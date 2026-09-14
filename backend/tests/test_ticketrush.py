import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_ticketrush.db"
os.environ["JWT_SECRET"] = "test-secret"

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))
test_db = ROOT / "test_ticketrush.db"
if test_db.exists():
    test_db.unlink()

from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.database import engine
from app.models import Base, Concert, UploadedImage
from app.security import hash_password
from app.services import seed_data
from sqlalchemy.orm import Session

Base.metadata.create_all(bind=engine)
with Session(engine) as db:
    seed_data(db, settings.admin_email, hash_password(settings.admin_password), hash_password("AdminPass123!"))

client = TestClient(app)


def token(email="customer@ticketrush.example.com", password="AdminPass123!"):
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_register_login_and_role_access():
    response = client.post("/auth/register", json={"email": "new@ticketrush.example.com", "full_name": "New Customer", "password": "Password123!"})
    assert response.status_code in (200, 409)
    auth = token()
    denied = client.get("/admin/logs", headers={"Authorization": f"Bearer {auth}"})
    assert denied.status_code == 403


def test_hold_checkout_and_idempotency():
    auth = token()
    concerts = client.get("/concerts").json()
    schedule_id = concerts[0]["schedule_id"]
    seats = client.get(f"/schedules/{schedule_id}/seats").json()["seats"]
    seat_id = next(seat["id"] for seat in seats if seat["status"] == "available")
    hold = client.post("/holds", json={"schedule_id": schedule_id, "seat_ids": [seat_id]}, headers={"Authorization": f"Bearer {auth}"})
    assert hold.status_code == 200, hold.text
    payload = {"schedule_id": schedule_id, "seat_ids": [seat_id], "idempotency_key": "idem-test-001", "payment_method": "Simulated Card"}
    first = client.post("/checkout", json=payload, headers={"Authorization": f"Bearer {auth}"})
    second = client.post("/checkout", json=payload, headers={"Authorization": f"Bearer {auth}"})
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["booking_reference"] == second.json()["booking_reference"]


def test_safe_simulation_allows_one_winner():
    admin = token(settings.admin_email, settings.admin_password)
    concerts = client.get("/concerts").json()
    schedule_id = concerts[1]["schedule_id"]
    seat_id = client.get(f"/schedules/{schedule_id}/seats").json()["seats"][0]["id"]
    response = client.post(
        "/admin/simulations",
        json={"mode": "safe", "attempts": 10, "schedule_id": schedule_id, "seat_id": seat_id},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["success_count"] == 1


def test_ticket_pdf_download_has_embedded_qr_and_enforces_ownership():
    email = "pdf-owner@example.com"
    client.post("/auth/register", json={"email": email, "full_name": "A Customer With A Long Name For Printed Tickets", "password": "Password123!"})
    headers = {"Authorization": f"Bearer {token(email, 'Password123!')}"}
    schedule_id = client.get("/concerts").json()[0]["schedule_id"]
    seats = client.get(f"/schedules/{schedule_id}/seats").json()["seats"]
    seat_id = next(seat["id"] for seat in seats if seat["status"] == "available")
    hold = client.post("/holds", json={"schedule_id": schedule_id, "seat_ids": [seat_id]}, headers=headers)
    assert hold.status_code == 200, hold.text
    purchase = client.post("/checkout", json={"schedule_id": schedule_id, "seat_ids": [seat_id], "idempotency_key": "pdf-download-regression"}, headers=headers)
    assert purchase.status_code == 200, purchase.text
    ticket_id = client.get("/tickets", headers=headers).json()[0]["id"]
    pdf = client.get(f"/tickets/{ticket_id}/pdf", headers=headers)
    assert pdf.status_code == 200, pdf.text
    assert pdf.content.startswith(b"%PDF")
    assert b"/Subtype /Image" in pdf.content
    denied = client.get(f"/tickets/{ticket_id}/pdf", headers={"Authorization": f"Bearer {token()}"})
    assert denied.status_code == 403


def test_unsafe_simulation_demonstrates_race():
    admin = token(settings.admin_email, settings.admin_password)
    concerts = client.get("/concerts").json()
    schedule_id = concerts[-1]["schedule_id"]
    seat_id = client.get(f"/schedules/{schedule_id}/seats").json()["seats"][0]["id"]
    response = client.post(
        "/admin/simulations",
        json={"mode": "unsafe", "attempts": 20, "schedule_id": schedule_id, "seat_id": seat_id},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["success_count"] >= 1


def test_admin_dashboard_venues_and_reservations():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    dashboard = client.get("/admin/dashboard", headers=headers)
    venues = client.get("/admin/venues", headers=headers)
    reservations = client.get("/admin/reservations", headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    assert "revenue" in dashboard.json()
    assert venues.status_code == 200, venues.text
    assert venues.json()[0]["capacity"] > 0
    assert reservations.status_code == 200, reservations.text


def test_admin_created_concert_appears_in_public_listing():
    admin = token(settings.admin_email, settings.admin_password)
    payload = {
        "title": "Test Launch Night",
        "artist": "Codex Avenue",
        "description": "A regression test concert with an automatic schedule.",
        "poster_url": "https://picsum.photos/seed/test-launch-night/900/1200",
        "category": "Pop",
        "status": "On Sale",
    }
    created = client.post("/admin/concerts", json=payload, headers={"Authorization": f"Bearer {admin}"})
    assert created.status_code == 200, created.text
    concerts = client.get("/concerts").json()
    match = next((concert for concert in concerts if concert["title"] == payload["title"]), None)
    assert match is not None
    assert match["schedule_id"] == created.json()["schedule_id"]
    assert match["available_seats"] > 0


def test_admin_can_create_venue_and_scheduled_concert():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    venue = client.post(
        "/admin/venues",
        json={"name": "Cebu Test Dome", "city": "Cebu", "rows": 3, "seats_per_row": 4},
        headers=headers,
    )
    assert venue.status_code == 200, venue.text
    payload = {
        "title": "Cebu Schedule Night",
        "artist": "Venue Makers",
        "description": "A concert with a selected venue, schedule, seats, and prices.",
        "poster_url": "https://picsum.photos/seed/cebu-schedule-night/900/1200",
        "category": "Pop",
        "status": "On Sale",
        "venue_id": venue.json()["id"],
        "starts_at": "2026-12-20T20:00:00+00:00",
        "sale_opens_at": "2026-12-01T09:00:00+00:00",
        "sale_closes_at": "2026-12-19T18:00:00+00:00",
        "vip_price": "7000.00",
        "lower_bowl_price": "4000.00",
        "general_price": "1500.00",
    }
    created = client.post("/admin/concerts", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    concerts = client.get("/concerts").json()
    match = next((concert for concert in concerts if concert["title"] == payload["title"]), None)
    assert match is not None
    assert match["venue"] == "Cebu Test Dome"
    assert match["total_seats"] == 12
    assert match["vip_price"] == 7000.0
    seats = client.get(f"/schedules/{match['schedule_id']}/seats").json()["seats"]
    assert len(seats) == 12
    assert any(seat["category"] == "VIP" and seat["price"] == 7000.0 for seat in seats)


def test_admin_uploads_are_served_from_database():
    admin = token(settings.admin_email, settings.admin_password)
    response = client.post(
        "/admin/uploads",
        headers={"Authorization": f"Bearer {admin}"},
        files={"file": ("poster.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert response.status_code == 200, response.text
    filename = response.json()["url"].split("/")[-1]
    with Session(engine) as db:
        stored = db.query(UploadedImage).filter(UploadedImage.filename == filename).one()
        assert stored.data == b"\x89PNG\r\n\x1a\n"
    asset = client.get(response.json()["url"])
    assert asset.status_code == 200
    assert asset.content == b"\x89PNG\r\n\x1a\n"


def test_admin_can_configure_venue_seating_before_concert():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    venue = client.post(
        "/admin/venues",
        json={
            "name": "Layout Test Hall",
            "city": "Davao",
            "rows": 4,
            "seats_per_row": 5,
            "tier_seats": [
                {"name": "VVIP", "seats": 3},
                {"name": "VIP", "seats": 5},
                {"name": "Upper Box", "seats": 7},
                {"name": "General Admission", "seats": 5},
            ],
        },
        headers=headers,
    )
    assert venue.status_code == 200, venue.text
    seating = client.get(f"/admin/venues/{venue.json()['id']}/seating", headers=headers)
    body = seating.json()
    assert body["venue"]["capacity"] == 20
    assert [tier["name"] for tier in body["tiers"]] == ["VVIP", "VIP", "Upper Box", "General Admission"]
    assert [tier["seats"] for tier in body["tiers"]] == [3, 5, 7, 5]
    assert len(body["seats"]) == 20
    concert = client.post(
        "/admin/concerts",
        json={
            "title": "Custom Tier Pricing",
            "artist": "Seat Makers",
            "description": "A concert that uses venue-specific ticket tiers.",
            "poster_url": "https://picsum.photos/seed/custom-tier-pricing/900/1200",
            "category": "Pop",
            "status": "On Sale",
            "venue_id": venue.json()["id"],
            "starts_at": "2026-12-22T20:00:00+00:00",
            "sale_opens_at": "2026-12-01T09:00:00+00:00",
            "sale_closes_at": "2026-12-21T18:00:00+00:00",
            "tier_prices": {"VVIP": "10000.00", "VIP": "5000.00", "Upper Box": "3000.00", "General Admission": "1200.00"},
        },
        headers=headers,
    )
    assert concert.status_code == 200, concert.text
    public = next(row for row in client.get("/concerts").json() if row["title"] == "Custom Tier Pricing")
    assert public["tier_prices"] == {"VVIP": 10000.0, "VIP": 5000.0, "Upper Box": 3000.0, "General Admission": 1200.0}


def test_admin_can_create_multi_day_concert_schedules():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    venue = client.post(
        "/admin/venues",
        json={"name": "Multi Day Hall", "city": "Cebu", "rows": 2, "seats_per_row": 5},
        headers=headers,
    )
    payload = {
        "title": "Two Day Festival",
        "artist": "Day Selectors",
        "description": "A concert with two selectable days.",
        "poster_url": "https://picsum.photos/seed/two-day-festival/900/1200",
        "category": "Pop",
        "status": "On Sale",
        "venue_id": venue.json()["id"],
        "schedule_days": ["2026-12-20T20:00:00+00:00", "2026-12-21T20:00:00+00:00"],
        "sale_opens_at": "2026-12-01T09:00:00+00:00",
        "sale_closes_at": "2026-12-19T18:00:00+00:00",
        "vip_price": "7000.00",
        "lower_bowl_price": "4000.00",
        "general_price": "1500.00",
    }
    created = client.post("/admin/concerts", json=payload, headers=headers)
    assert created.status_code == 200, created.text
    assert len(created.json()["schedule_ids"]) == 2
    concerts = [concert for concert in client.get("/concerts").json() if concert["title"] == payload["title"]]
    assert len(concerts) == 2
    detail = client.get(f"/concerts/schedule/{created.json()['schedule_ids'][1]}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["starts_at"].startswith("2026-12-21")


def test_admin_can_delete_unused_concert_and_venue():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    concert_payload = {
        "title": "Delete Me Concert",
        "artist": "Cleanup Crew",
        "description": "Temporary concert for delete testing.",
        "poster_url": "https://picsum.photos/seed/delete-me/900/1200",
        "category": "Pop",
        "status": "Draft",
    }
    concert = client.post("/admin/concerts", json=concert_payload, headers=headers)
    assert concert.status_code == 200, concert.text
    archive_concert = client.put(f"/admin/concerts/{concert.json()['id']}/archive", headers=headers)
    assert archive_concert.status_code == 200, archive_concert.text
    deleted_concert = client.delete(f"/admin/concerts/{concert.json()['id']}", headers=headers)
    assert deleted_concert.status_code == 200, deleted_concert.text
    concerts = client.get("/concerts").json()
    assert not any(row["title"] == concert_payload["title"] for row in concerts)

    venue = client.post(
        "/admin/venues",
        json={
            "name": "Delete Me Venue",
            "city": "Cebu",
            "rows": 1,
            "seats_per_row": 2,
            "tier_seats": [{"name": "VIP", "seats": 2}],
        },
        headers=headers,
    )
    assert venue.status_code == 200, venue.text
    archive_venue = client.put(f"/admin/venues/{venue.json()['id']}/archive", headers=headers)
    assert archive_venue.status_code == 200, archive_venue.text
    deleted_venue = client.delete(f"/admin/venues/{venue.json()['id']}", headers=headers)
    assert deleted_venue.status_code == 200, deleted_venue.text
    venues = client.get("/admin/venues", headers=headers).json()
    assert not any(row["name"] == "Delete Me Venue" for row in venues)


def test_admin_cannot_delete_venue_used_by_concert():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    venue = client.post(
        "/admin/venues",
        json={
            "name": "Protected Venue",
            "city": "Cebu",
            "rows": 1,
            "seats_per_row": 2,
            "tier_seats": [{"name": "VIP", "seats": 2}],
        },
        headers=headers,
    )
    assert venue.status_code == 200, venue.text
    concert = client.post(
        "/admin/concerts",
        json={
            "title": "Protected Venue Concert",
            "artist": "Seat Keepers",
            "description": "This concert keeps the venue attached.",
            "poster_url": "https://picsum.photos/seed/protected-venue/900/1200",
            "category": "Pop",
            "status": "Draft",
            "venue_id": venue.json()["id"],
            "starts_at": "2026-12-22T20:00:00+00:00",
        },
        headers=headers,
    )
    assert concert.status_code == 200, concert.text
    assert client.put(f"/admin/venues/{venue.json()['id']}/archive", headers=headers).status_code == 200
    response = client.delete(f"/admin/venues/{venue.json()['id']}", headers=headers)
    assert response.status_code == 409


def test_admin_can_archive_and_restore_records():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    concert = client.post(
        "/admin/concerts",
        json={
            "title": "Restore Concert",
            "artist": "Archive Team",
            "description": "Temporary concert for restore testing.",
            "poster_url": "https://picsum.photos/seed/restore-concert/900/1200",
            "category": "Pop",
            "status": "Draft",
        },
        headers=headers,
    )
    assert concert.status_code == 200, concert.text
    assert client.put(f"/admin/concerts/{concert.json()['id']}/archive", headers=headers).status_code == 200
    archived = client.get("/admin/concerts?archived=true", headers=headers)
    assert any(row["title"] == "Restore Concert" for row in archived.json())
    assert client.put(f"/admin/concerts/{concert.json()['id']}/restore", headers=headers).status_code == 200
    active = client.get("/admin/concerts", headers=headers)
    assert any(row["title"] == "Restore Concert" for row in active.json())


def test_admin_can_update_venue_metadata():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    venue = client.post(
        "/admin/venues",
        json={"name": "Editable Venue", "city": "Cebu", "rows": 1, "seats_per_row": 2, "tier_seats": [{"name": "VIP", "seats": 2}]},
        headers=headers,
    )
    assert venue.status_code == 200, venue.text
    updated = client.put(
        f"/admin/venues/{venue.json()['id']}",
        json={"name": "Updated Venue", "city": "Mandaue", "rows": 1, "seats_per_row": 2, "tier_seats": [{"name": "VIP", "seats": 2}]},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Updated Venue"
    assert updated.json()["city"] == "Mandaue"


def test_admin_transactions_reports_and_profile_are_business_facing():
    admin = token(settings.admin_email, settings.admin_password)
    headers = {"Authorization": f"Bearer {admin}"}
    transactions = client.get("/admin/transactions", headers=headers)
    reports = client.get("/admin/reports", headers=headers)
    profile = client.put(
        "/me",
        json={
            "first_name": "TicketRush",
            "last_name": "Admin",
            "email": settings.admin_email,
            "contact_number": "+639171234567",
            "profile_photo_url": "/uploads/profile.png",
        },
        headers=headers,
    )
    assert transactions.status_code == 200, transactions.text
    assert reports.status_code == 200, reports.text
    assert "summary" in reports.json()
    assert profile.status_code == 200, profile.text
    assert profile.json()["contact_number"] == "+639171234567"


def test_admin_can_upload_concert_image():
    admin = token(settings.admin_email, settings.admin_password)
    response = client.post(
        "/admin/uploads",
        files={"file": ("poster.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["url"].startswith("/uploads/")


def test_public_listing_repairs_concert_without_schedule():
    with Session(engine) as db:
        db.add(
            Concert(
                title="Orphan Concert Repair",
                artist="Schedule Fixers",
                description="This concert was saved before schedules were automatic.",
                poster_url="https://picsum.photos/seed/orphan-repair/900/1200",
                category="Rock",
                status="On Sale",
            )
        )
        db.commit()
    concerts = client.get("/concerts").json()
    match = next((concert for concert in concerts if concert["title"] == "Orphan Concert Repair"), None)
    assert match is not None
    assert match["schedule_id"]
    assert match["available_seats"] > 0


def test_admin_temporary_password_reset_flow():
    email = "reset-flow@example.com"
    created = client.post(
        "/auth/register",
        json={
            "first_name": "Reset",
            "last_name": "Customer",
            "contact_number": "09170000000",
            "email": email,
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert created.status_code == 200, created.text
    original_auth = token(email, "Password123!")

    forgot = client.post("/auth/forgot-password", json={"email": email})
    assert forgot.status_code == 200, forgot.text
    unknown = client.post("/auth/forgot-password", json={"email": "unknown-reset@example.com"})
    assert unknown.status_code == 200, unknown.text
    assert unknown.json()["message"] == forgot.json()["message"]

    admin = token(settings.admin_email, settings.admin_password)
    customers = client.get("/admin/customers", headers={"Authorization": f"Bearer {admin}"}).json()
    customer = next(row for row in customers if row["email"] == email)
    assert customer["reset_request_status"] == "Pending"

    generated = client.post(f"/admin/customers/{customer['id']}/reset-password", headers={"Authorization": f"Bearer {admin}"})
    assert generated.status_code == 200, generated.text
    temporary_password = generated.json()["temporary_password"]
    assert temporary_password
    assert "hashed" not in generated.text.lower()

    old_session = client.get("/tickets", headers={"Authorization": f"Bearer {original_auth}"})
    assert old_session.status_code == 401
    old_login = client.post("/auth/login", json={"email": email, "password": "Password123!"})
    assert old_login.status_code == 401

    temp_login = client.post("/auth/login", json={"email": email, "password": temporary_password})
    assert temp_login.status_code == 200, temp_login.text
    temp_payload = temp_login.json()
    assert temp_payload["must_change_password"] is True
    blocked = client.get("/tickets", headers={"Authorization": f"Bearer {temp_payload['access_token']}"})
    assert blocked.status_code == 403
    reused = client.post("/auth/login", json={"email": email, "password": temporary_password})
    assert reused.status_code == 403

    weak = client.post(
        "/auth/create-new-password",
        json={"new_password": "weakpass", "confirm_password": "weakpass"},
        headers={"Authorization": f"Bearer {temp_payload['access_token']}"},
    )
    assert weak.status_code == 400
    updated = client.post(
        "/auth/create-new-password",
        json={"new_password": "NewPassword123!", "confirm_password": "NewPassword123!"},
        headers={"Authorization": f"Bearer {temp_payload['access_token']}"},
    )
    assert updated.status_code == 200, updated.text
    assert token(email, "NewPassword123!")
