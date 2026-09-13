import uuid
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db
from app.models import Base, ConcurrencyLog, Concert, Payment, Reservation, ReservationItem, Schedule, Seat, SeatCategory, SeatHold, Ticket, User, Venue
from app.schemas import CheckoutRequest, ConcertCreate, HoldRequest, LoginRequest, PasswordChange, ProfileUpdate, SimulationRequest, UserCreate, VenueCreate, VenueSeatingUpdate
from app.security import admin_user, create_access_token, current_user, hash_password, verify_password
from app.services import checkout, concert_summary, create_default_schedule_for_concert, hold_seats, run_simulation, seat_map, seed_data, ticket_pdf

app = FastAPI(title="TicketRush API", version="1.0.0")
UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    ensure_optional_media_columns()
    if settings.seed_sample_data:
        with Session(engine) as db:
            seed_data(db, settings.admin_email, hash_password(settings.admin_password), hash_password("AdminPass123!"))


def ensure_optional_media_columns():
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(engine)
    existing = {column["name"] for column in inspector.get_columns("concerts")}
    with engine.begin() as connection:
        if "banner_url" not in existing:
            connection.execute(text("ALTER TABLE concerts ADD COLUMN banner_url VARCHAR(500)"))
        if "policy_rules" not in existing:
            connection.execute(text("ALTER TABLE concerts ADD COLUMN policy_rules TEXT"))
        if "archived_at" not in existing:
            connection.execute(text("ALTER TABLE concerts ADD COLUMN archived_at DATETIME"))
        if "max_tickets_per_customer" not in existing:
            connection.execute(text("ALTER TABLE concerts ADD COLUMN max_tickets_per_customer INTEGER NOT NULL DEFAULT 4"))
        venue_columns = {column["name"] for column in inspector.get_columns("venues")}
        if "image_url" not in venue_columns:
            connection.execute(text("ALTER TABLE venues ADD COLUMN image_url VARCHAR(500)"))
        if "status" not in venue_columns:
            connection.execute(text("ALTER TABLE venues ADD COLUMN status VARCHAR(40) NOT NULL DEFAULT 'Active'"))
        if "archived_at" not in venue_columns:
            connection.execute(text("ALTER TABLE venues ADD COLUMN archived_at DATETIME"))
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "contact_number" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN contact_number VARCHAR(40)"))
        if "profile_photo_url" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN profile_photo_url VARCHAR(500)"))
        if "account_status" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN account_status VARCHAR(40) NOT NULL DEFAULT 'Active'"))
        if "last_login_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register")
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=payload.email, full_name=payload.full_name, hashed_password=hash_password(payload.password), role="customer")
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role, "profile_photo_url": user.profile_photo_url},
    }


@app.get("/me")
def me(user: User = Depends(current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "contact_number": user.contact_number or "",
        "profile_photo_url": user.profile_photo_url,
        "account_status": user.account_status,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }


@app.put("/me")
def update_me(payload: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    duplicate = db.scalar(select(User).where(User.email == payload.email, User.id != user.id))
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user.full_name = f"{payload.first_name.strip()} {payload.last_name.strip()}".strip()
    user.email = payload.email
    user.contact_number = payload.contact_number.strip()
    user.profile_photo_url = payload.profile_photo_url
    db.commit()
    db.refresh(user)
    return me(user)


@app.put("/me/password")
def update_password(payload: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"updated": True}


@app.get("/concerts")
def list_concerts(db: Session = Depends(get_db)):
    return concert_summary(db)


@app.get("/concerts/schedule/{schedule_id}")
def get_concert_by_schedule(schedule_id: int, db: Session = Depends(get_db)):
    for item in concert_summary(db):
        if item["schedule_id"] == schedule_id:
            return item
    raise HTTPException(404, "Concert schedule not found")


@app.get("/concerts/{concert_id}")
def get_concert(concert_id: int, db: Session = Depends(get_db)):
    for item in concert_summary(db):
        if item["id"] == concert_id:
            return item
    raise HTTPException(404, "Concert not found")


@app.get("/schedules/{schedule_id}/seats")
def get_seats(schedule_id: int, db: Session = Depends(get_db)):
    return seat_map(db, schedule_id)


@app.post("/holds")
def create_hold(payload: HoldRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return hold_seats(db, user, payload.schedule_id, payload.seat_ids)


@app.post("/checkout")
def create_checkout(payload: CheckoutRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    reservation = checkout(db, user, payload.schedule_id, payload.seat_ids, payload.idempotency_key, payload.payment_method)
    return {"id": reservation.id, "booking_reference": reservation.booking_reference, "total_amount": reservation.total_amount, "status": reservation.status}


@app.get("/reservations")
def reservations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Reservation).where(Reservation.user_id == user.id).order_by(Reservation.created_at.desc())).all()
    return [{"id": r.id, "status": r.status, "booking_reference": r.booking_reference, "total_amount": r.total_amount, "created_at": r.created_at} for r in rows]


@app.get("/tickets")
def tickets(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = (
        select(Ticket, Reservation, Seat, Schedule, Concert)
        .join(Reservation, Ticket.reservation_id == Reservation.id)
        .join(Seat, Ticket.seat_id == Seat.id)
        .join(Schedule, Ticket.schedule_id == Schedule.id)
        .join(Concert, Schedule.concert_id == Concert.id)
        .where(Reservation.user_id == user.id)
    )
    return [
        {
            "id": ticket.id,
            "ticket_number": ticket.ticket_number,
            "booking_reference": reservation.booking_reference,
            "concert": concert.title,
            "artist": concert.artist,
            "poster_url": concert.poster_url,
            "banner_url": concert.banner_url or concert.poster_url,
            "venue": schedule.venue.name,
            "starts_at": schedule.starts_at,
            "seat": seat.label,
            "category": seat.category_name,
            "qr_payload": ticket.qr_payload,
        }
        for ticket, reservation, seat, schedule, concert in db.execute(stmt).all()
    ]


@app.get("/tickets/{ticket_id}/pdf")
def download_ticket(ticket_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pdf = ticket_pdf(db, ticket_id, user)
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=ticketrush-{ticket_id}.pdf"})


@app.post("/admin/uploads")
def upload_concert_image(file: UploadFile = File(...), _: User = Depends(admin_user)):
    max_upload_size = 15 * 1024 * 1024
    allowed_types = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
    allowed_extensions = {".jpg": ".jpg", ".jpeg": ".jpg", ".png": ".png", ".webp": ".webp", ".gif": ".gif"}
    suffix = Path(file.filename or "").suffix.lower()
    extension = allowed_types.get(file.content_type or "") or allowed_extensions.get(suffix)
    if not extension:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only JPG, PNG, WEBP, or GIF images are allowed")
    filename = f"{uuid.uuid4().hex}{extension}"
    target = UPLOAD_DIR / filename
    size = 0
    with target.open("wb") as buffer:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > max_upload_size:
                buffer.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image must be 15 MB or smaller")
            buffer.write(chunk)
    return {"url": f"/uploads/{filename}"}


@app.get("/admin/dashboard")
def admin_dashboard(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    return build_business_report(db)


@app.post("/admin/concerts")
def admin_create_concert(payload: ConcertCreate, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    data = payload.model_dump()
    concert_fields = {key: data[key] for key in ["title", "artist", "description", "poster_url", "banner_url", "category", "status", "max_tickets_per_customer"]}
    concert_fields["policy_rules"] = json.dumps([rule.model_dump() for rule in payload.rules])
    concert = Concert(**concert_fields)
    db.add(concert)
    db.flush()
    schedule_days = payload.schedule_days or ([payload.starts_at] if payload.starts_at else [None])
    schedules = []
    for starts_at in schedule_days:
        schedules.append(
            create_default_schedule_for_concert(
                db,
                concert,
                venue_id=payload.venue_id,
                starts_at=starts_at,
                sale_opens_at=payload.sale_opens_at,
                sale_closes_at=payload.sale_closes_at,
                tier_prices={
                    "VIP": payload.vip_price,
                    "Lower Bowl": payload.lower_bowl_price,
                    "General": payload.general_price,
                    **payload.tier_prices,
                },
            )
        )
    db.commit()
    db.refresh(concert)
    return {"id": concert.id, "schedule_id": schedules[0].id, "schedule_ids": [schedule.id for schedule in schedules], "title": concert.title, "artist": concert.artist, "status": concert.status}


@app.get("/admin/concerts")
def admin_concerts(archived: bool = Query(False), _: User = Depends(admin_user), db: Session = Depends(get_db)):
    if not archived:
        return concert_summary(db)
    rows = (
        db.scalars(
            select(Schedule)
            .join(Concert, Schedule.concert_id == Concert.id)
            .where(Concert.status == "Archived")
            .options()
            .order_by(Concert.archived_at.desc().nullslast(), Schedule.starts_at)
        )
        .all()
    )
    data = []
    for schedule in rows:
        concert = db.get(Concert, schedule.concert_id)
        venue = db.get(Venue, schedule.venue_id)
        total = db.scalar(select(func.count(Seat.id)).where(Seat.venue_id == schedule.venue_id)) or 0
        sold = db.scalar(select(func.count(Ticket.id)).where(Ticket.schedule_id == schedule.id)) or 0
        data.append(
            {
                "id": concert.id,
                "schedule_id": schedule.id,
                "title": concert.title,
                "artist": concert.artist,
                "poster_url": concert.poster_url,
                "banner_url": concert.banner_url or concert.poster_url,
                "category": concert.category,
                "status": concert.status,
                "archived_at": concert.archived_at,
                "venue_id": venue.id if venue else None,
                "venue": venue.name if venue else "Unknown venue",
                "starts_at": schedule.starts_at,
                "total_seats": total,
                "available_seats": max(total - sold, 0),
                "safe_to_delete": sold == 0,
                "delete_block_reason": "" if sold == 0 else "This concert has issued tickets or protected bookings.",
            }
        )
    return data


@app.put("/admin/concerts/{concert_id}")
def admin_update_concert(concert_id: int, payload: ConcertCreate, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    concert = db.get(Concert, concert_id)
    if not concert:
        raise HTTPException(404, "Concert not found")
    data = payload.model_dump()
    for key in ["title", "artist", "description", "poster_url", "banner_url", "category", "status", "max_tickets_per_customer"]:
        value = data[key]
        setattr(concert, key, value)
    concert.policy_rules = json.dumps([rule.model_dump() for rule in payload.rules])
    schedule = db.scalar(select(Schedule).where(Schedule.concert_id == concert_id).order_by(Schedule.id))
    if not schedule:
        schedule = create_default_schedule_for_concert(db, concert)
    if payload.venue_id:
        if not db.get(Venue, payload.venue_id):
            raise HTTPException(404, "Selected venue not found")
        schedule.venue_id = payload.venue_id
    if payload.starts_at:
        schedule.starts_at = payload.starts_at
    if payload.sale_opens_at:
        schedule.sale_opens_at = payload.sale_opens_at
    if payload.sale_closes_at:
        schedule.sale_closes_at = payload.sale_closes_at
    if schedule.sale_closes_at >= schedule.starts_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ticket selling period must end before the concert starts")
    for category in db.scalars(select(SeatCategory).where(SeatCategory.schedule_id == schedule.id)):
        if category.name in payload.tier_prices:
            category.price = payload.tier_prices[category.name]
        elif category.name == "VIP":
            category.price = payload.vip_price
        elif category.name == "Lower Bowl":
            category.price = payload.lower_bowl_price
        elif category.name == "General":
            category.price = payload.general_price
    db.commit()
    return concert


@app.put("/admin/concerts/{concert_id}/archive")
def admin_archive_concert(concert_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    concert = db.get(Concert, concert_id)
    if not concert:
        raise HTTPException(404, "Concert not found")
    concert.status = "Archived"
    concert.archived_at = datetime.now(timezone.utc)
    db.commit()
    return {"archived": True, "id": concert.id, "archived_at": concert.archived_at}


@app.put("/admin/concerts/{concert_id}/restore")
def admin_restore_concert(concert_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    concert = db.get(Concert, concert_id)
    if not concert:
        raise HTTPException(404, "Concert not found")
    concert.status = "Draft"
    concert.archived_at = None
    db.commit()
    return {"restored": True, "id": concert.id, "status": concert.status}


@app.delete("/admin/concerts/{concert_id}")
def admin_delete_concert(concert_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    concert = db.get(Concert, concert_id)
    if not concert:
        raise HTTPException(404, "Concert not found")
    if concert.status != "Archived":
        raise HTTPException(status.HTTP_409_CONFLICT, "Archive the concert before permanently deleting it")
    sold_tickets = (
        db.query(Ticket)
        .join(Schedule, Ticket.schedule_id == Schedule.id)
        .filter(Schedule.concert_id == concert_id)
        .count()
    )
    if sold_tickets:
        raise HTTPException(status.HTTP_409_CONFLICT, "Concert has confirmed tickets and cannot be permanently deleted")
    db.delete(concert)
    db.commit()
    return {"deleted": True}


@app.get("/admin/customers")
def admin_customers(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    return db.query(User).filter(User.role == "customer").all()


@app.get("/admin/reservations")
def admin_reservations(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Reservation, User, Schedule, Concert)
        .join(User, Reservation.user_id == User.id)
        .join(Schedule, Reservation.schedule_id == Schedule.id)
        .join(Concert, Schedule.concert_id == Concert.id)
        .order_by(Reservation.created_at.desc())
        .all()
    )
    return [
        {
            "id": reservation.id,
            "booking_reference": reservation.booking_reference,
            "customer": user.email,
            "concert": concert.title,
            "status": reservation.status,
            "total_amount": reservation.total_amount,
            "created_at": reservation.created_at,
        }
        for reservation, user, schedule, concert in rows
    ]


@app.get("/admin/transactions")
def admin_transactions(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Reservation, User, Schedule, Concert, Payment)
        .join(User, Reservation.user_id == User.id)
        .join(Schedule, Reservation.schedule_id == Schedule.id)
        .join(Concert, Schedule.concert_id == Concert.id)
        .outerjoin(Payment, Payment.reservation_id == Reservation.id)
        .filter(Reservation.status != "simulation")
        .order_by(Reservation.created_at.desc())
        .all()
    )
    data = []
    for reservation, user, schedule, concert, payment in rows:
        items = db.query(ReservationItem, Seat).join(Seat, ReservationItem.seat_id == Seat.id).filter(ReservationItem.reservation_id == reservation.id).all()
        tiers = sorted({seat.category_name for _, seat in items})
        data.append(
            {
                "id": reservation.id,
                "booking_reference": reservation.booking_reference,
                "customer": user.email,
                "customer_name": user.full_name,
                "concert": concert.title,
                "schedule_id": schedule.id,
                "venue_id": schedule.venue_id,
                "venue": schedule.venue.name,
                "starts_at": schedule.starts_at,
                "quantity": len(items),
                "tiers": ", ".join(tiers),
                "seats": ", ".join(seat.label for _, seat in items),
                "total_amount": reservation.total_amount,
                "payment_method": payment.method if payment else "Pending",
                "payment_status": payment.status if payment else "pending",
                "status": reservation.status,
                "created_at": reservation.created_at,
            }
        )
    return data


@app.get("/admin/transactions/{reservation_id}")
def admin_transaction_detail(reservation_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    row = (
        db.query(Reservation, User, Schedule, Concert, Payment)
        .join(User, Reservation.user_id == User.id)
        .join(Schedule, Reservation.schedule_id == Schedule.id)
        .join(Concert, Schedule.concert_id == Concert.id)
        .outerjoin(Payment, Payment.reservation_id == Reservation.id)
        .filter(Reservation.id == reservation_id, Reservation.status != "simulation")
        .first()
    )
    if not row:
        raise HTTPException(404, "Transaction not found")
    reservation, user, schedule, concert, payment = row
    items = db.query(ReservationItem, Seat).join(Seat, ReservationItem.seat_id == Seat.id).filter(ReservationItem.reservation_id == reservation.id).all()
    tickets = db.scalars(select(Ticket).where(Ticket.reservation_id == reservation.id)).all()
    return {
        "id": reservation.id,
        "booking_reference": reservation.booking_reference,
        "customer": {"name": user.full_name, "email": user.email},
        "concert": {"title": concert.title, "artist": concert.artist, "date": schedule.starts_at, "venue": schedule.venue.name},
        "seats": [{"label": seat.label, "tier": seat.category_name, "price": item.price} for item, seat in items],
        "tickets": [{"ticket_number": ticket.ticket_number, "seat_id": ticket.seat_id, "issued_at": ticket.created_at} for ticket in tickets],
        "payment": {"amount": payment.amount if payment else reservation.total_amount, "method": payment.method if payment else "Pending", "status": payment.status if payment else "pending"},
        "status": reservation.status,
        "created_at": reservation.created_at,
    }


@app.get("/admin/reports")
def admin_reports(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    return build_business_report(db)


def build_business_report(db: Session):
    now = datetime.now(timezone.utc)
    def aware(value):
        if value and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    completed_statuses = ("paid", "completed")
    schedules = concert_summary(db)
    transactions = admin_transactions(None, db)
    completed_transactions = [row for row in transactions if row["payment_status"] in completed_statuses and row["status"] != "simulation"]
    completed_revenue = sum(float(row["total_amount"] or 0) for row in completed_transactions)
    tickets_sold = db.scalar(select(func.count(Ticket.id)).join(Reservation, Ticket.reservation_id == Reservation.id).where(Reservation.status != "simulation")) or 0
    total_seats = sum(int(item["total_seats"] or 0) for item in schedules)
    available_seats = sum(int(item["available_seats"] or 0) for item in schedules)
    held_seats = sum(int(item.get("held_seats", 0) or 0) for item in schedules)
    active_concerts = db.scalar(select(func.count(Concert.id)).where(Concert.status.in_(["On Sale", "Upcoming"]))) or 0
    upcoming_concerts = len([item for item in schedules if item["status"] in ("On Sale", "Upcoming") and aware(item["starts_at"]) >= now])
    active_reservations = db.scalar(select(func.count(Reservation.id)).where(Reservation.status.in_(["held", "pending", "confirmed"]))) or 0
    customers = db.scalars(select(User).where(User.role == "customer")).all()

    revenue_by_reservation = {row["id"]: float(row["total_amount"] or 0) for row in completed_transactions}
    concert_rows = []
    for item in schedules:
        sold = max(int(item["total_seats"] or 0) - int(item["available_seats"] or 0), 0)
        revenue = sum(row["total_amount"] for row in completed_transactions if row["schedule_id"] == item["schedule_id"])
        occupancy = round((sold / max(int(item["total_seats"] or 0), 1)) * 100, 1)
        status_label = item["status"]
        if status_label not in ("Cancelled", "Sold Out") and occupancy >= 95:
            status_label = "Nearly Sold Out"
        concert_rows.append({
            **item,
            "concert": item["title"],
            "sold": sold,
            "revenue": float(revenue or 0),
            "occupancy": occupancy,
            "performance_status": status_label,
        })

    tier_rows = {}
    completed_items = (
        db.query(Reservation, ReservationItem, Seat, Schedule, Concert, Venue)
        .join(ReservationItem, ReservationItem.reservation_id == Reservation.id)
        .join(Seat, ReservationItem.seat_id == Seat.id)
        .join(Schedule, Reservation.schedule_id == Schedule.id)
        .join(Concert, Schedule.concert_id == Concert.id)
        .join(Venue, Schedule.venue_id == Venue.id)
        .join(Payment, Payment.reservation_id == Reservation.id)
        .filter(Reservation.status != "simulation", Payment.status.in_(completed_statuses))
        .all()
    )
    for reservation, item, seat, schedule, concert, venue in completed_items:
        key = (schedule.id, seat.category_name)
        tier_rows.setdefault(key, {
            "schedule_id": schedule.id,
            "concert": concert.title,
            "tier": seat.category_name,
            "venue_section": seat.category_name,
            "venue": venue.name,
            "price": float(item.price),
            "allocated_seats": db.scalar(select(func.count(Seat.id)).where(Seat.venue_id == venue.id, Seat.category_name == seat.category_name)) or 0,
            "tickets_sold": 0,
            "available_seats": 0,
            "revenue": 0,
            "occupancy": 0,
        })
        tier_rows[key]["tickets_sold"] += 1
        tier_rows[key]["revenue"] += float(item.price)
    for row in tier_rows.values():
        row["available_seats"] = max(int(row["allocated_seats"]) - int(row["tickets_sold"]), 0)
        row["occupancy"] = round((int(row["tickets_sold"]) / max(int(row["allocated_seats"]), 1)) * 100, 1)

    trend_rows = {}
    for row in completed_transactions:
        day = str(row["created_at"])[:10]
        trend_rows.setdefault(day, {"date": day, "tickets": 0, "revenue": 0})
        trend_rows[day]["tickets"] += int(row["quantity"] or 0)
        trend_rows[day]["revenue"] += float(row["total_amount"] or 0)

    reservation_rows = []
    for reservation, user, schedule, concert in (
        db.query(Reservation, User, Schedule, Concert)
        .join(User, Reservation.user_id == User.id)
        .join(Schedule, Reservation.schedule_id == Schedule.id)
        .join(Concert, Schedule.concert_id == Concert.id)
        .filter(Reservation.status != "simulation")
        .order_by(Reservation.created_at.desc())
        .all()
    ):
        items = db.query(ReservationItem, Seat).join(Seat, ReservationItem.seat_id == Seat.id).filter(ReservationItem.reservation_id == reservation.id).all()
        hold_expiration = db.scalar(select(func.max(SeatHold.expires_at)).where(SeatHold.schedule_id == reservation.schedule_id))
        reservation_rows.append({
            "id": reservation.id,
            "booking_reference": reservation.booking_reference,
            "customer": user.email,
            "concert": concert.title,
            "reserved_seats": ", ".join(seat.label for _, seat in items),
            "quantity": len(items),
            "total_amount": float(reservation.total_amount),
            "status": reservation.status,
            "hold_expiration": hold_expiration,
            "created_at": reservation.created_at,
        })

    customer_rows = []
    for customer in customers:
        customer_transactions = [row for row in completed_transactions if row["customer"] == customer.email]
        customer_rows.append({
            "id": customer.id,
            "customer": customer.full_name,
            "email": customer.email,
            "total_bookings": len([row for row in transactions if row["customer"] == customer.email]),
            "tickets_purchased": sum(int(row["quantity"] or 0) for row in customer_transactions),
            "total_spent": sum(float(row["total_amount"] or 0) for row in customer_transactions),
            "last_purchase": max((row["created_at"] for row in customer_transactions), default=None),
            "account_status": customer.account_status,
        })

    upcoming = min(
        [row for row in concert_rows if row["status"] in ("On Sale", "Upcoming") and aware(row["starts_at"]) >= now],
        key=lambda row: aware(row["starts_at"]),
        default=None,
    )
    if upcoming:
        upcoming["days_remaining"] = max((aware(upcoming["starts_at"]) - now).days, 0)

    return {
        "revenue": completed_revenue,
        "tickets": int(tickets_sold),
        "active_concerts": int(active_concerts),
        "upcoming_concerts": int(upcoming_concerts),
        "available_seats": int(available_seats),
        "active_reservations": int(active_reservations),
        "completed_transactions": len(completed_transactions),
        "customers": len(customers),
        "summary": {
            "total_revenue": completed_revenue,
            "completed_revenue": completed_revenue,
            "tickets_sold": int(tickets_sold),
            "active_concerts": int(active_concerts),
            "active_reservations": int(active_reservations),
            "customers": len(customers),
            "total_customers": len(customers),
            "available_seats": int(available_seats),
            "upcoming_concerts": int(upcoming_concerts),
            "completed_transactions": len(completed_transactions),
            "average_transaction_value": round(completed_revenue / max(len(completed_transactions), 1), 2),
            "average_tickets_per_transaction": round((sum(row["quantity"] for row in completed_transactions) / max(len(completed_transactions), 1)), 2),
        },
        "seat_occupancy": {
            "sold": int(tickets_sold),
            "held": int(held_seats),
            "available": int(available_seats),
            "total": int(total_seats),
            "occupancy": round((int(tickets_sold) / max(int(total_seats), 1)) * 100, 1),
        },
        "trend": sorted(trend_rows.values(), key=lambda row: row["date"]),
        "concerts": sorted(concert_rows, key=lambda row: row["sold"], reverse=True),
        "tiers": sorted(tier_rows.values(), key=lambda row: row["tickets_sold"], reverse=True),
        "transactions": transactions,
        "reservations": reservation_rows,
        "customer_rows": customer_rows,
        "upcoming": upcoming,
    }


@app.get("/admin/venues")
def admin_venues(archived: bool = Query(False), _: User = Depends(admin_user), db: Session = Depends(get_db)):
    status_filter = "Archived" if archived else "Active"
    rows = db.query(Venue).filter(Venue.status == status_filter).order_by(Venue.name).all()
    return [
        {
            "id": venue.id,
            "name": venue.name,
            "city": venue.city,
            "image_url": venue.image_url,
            "rows": venue.rows,
            "seats_per_row": venue.seats_per_row,
            "capacity": venue.rows * venue.seats_per_row,
            "status": venue.status,
            "archived_at": venue.archived_at,
            "safe_to_delete": (db.scalar(select(func.count(Schedule.id)).where(Schedule.venue_id == venue.id)) or 0) == 0,
        }
        for venue in rows
    ]


@app.post("/admin/venues")
def admin_create_venue(payload: VenueCreate, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = Venue(name=payload.name, city=payload.city, image_url=payload.image_url, status="Active", rows=payload.rows, seats_per_row=payload.seats_per_row)
    db.add(venue)
    db.flush()
    tier_seats = [{"name": tier.name.strip(), "seats": tier.seats} for tier in payload.tier_seats if tier.name.strip()]
    if tier_seats:
        if len(set(tier["name"] for tier in tier_seats)) != len(tier_seats):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tier names must be unique")
        if sum(tier["seats"] for tier in tier_seats) > venue.rows * venue.seats_per_row:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tier seat total cannot exceed venue capacity")
        seat_index = 0
        for tier in tier_seats:
            for _ in range(tier["seats"]):
                row_index = seat_index // venue.seats_per_row
                row = chr(ord("A") + row_index)
                number = (seat_index % venue.seats_per_row) + 1
                db.add(Seat(venue_id=venue.id, row_label=row, number=number, category_name=tier["name"]))
                seat_index += 1
    else:
        for row_index in range(venue.rows):
            row = chr(ord("A") + row_index)
            category = "VIP" if row_index < max(1, venue.rows // 4) else "Lower Bowl" if row_index < max(2, venue.rows // 2) else "General"
            for number in range(1, venue.seats_per_row + 1):
                db.add(Seat(venue_id=venue.id, row_label=row, number=number, category_name=category))
    db.commit()
    db.refresh(venue)
    return {
        "id": venue.id,
        "name": venue.name,
        "city": venue.city,
        "image_url": venue.image_url,
        "rows": venue.rows,
        "seats_per_row": venue.seats_per_row,
        "capacity": venue.rows * venue.seats_per_row,
        "status": venue.status,
    }


@app.get("/admin/venues/{venue_id}")
def admin_get_venue(venue_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    return {
        "id": venue.id,
        "name": venue.name,
        "city": venue.city,
        "image_url": venue.image_url,
        "rows": venue.rows,
        "seats_per_row": venue.seats_per_row,
        "capacity": venue.rows * venue.seats_per_row,
        "status": venue.status,
        "archived_at": venue.archived_at,
    }


@app.put("/admin/venues/{venue_id}")
def admin_update_venue(venue_id: int, payload: VenueCreate, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    venue.name = payload.name
    venue.city = payload.city
    venue.image_url = payload.image_url
    db.commit()
    db.refresh(venue)
    return admin_get_venue(venue_id, _, db)


@app.put("/admin/venues/{venue_id}/archive")
def admin_archive_venue(venue_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    venue.status = "Archived"
    venue.archived_at = datetime.now(timezone.utc)
    db.commit()
    return {"archived": True, "id": venue.id, "archived_at": venue.archived_at}


@app.put("/admin/venues/{venue_id}/restore")
def admin_restore_venue(venue_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    venue.status = "Active"
    venue.archived_at = None
    db.commit()
    return {"restored": True, "id": venue.id, "status": venue.status}


@app.delete("/admin/venues/{venue_id}")
def admin_delete_venue(venue_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    if venue.status != "Archived":
        raise HTTPException(status.HTTP_409_CONFLICT, "Archive the venue before permanently deleting it")
    linked_schedules = db.scalar(select(func.count(Schedule.id)).where(Schedule.venue_id == venue_id)) or 0
    if linked_schedules:
        raise HTTPException(status.HTTP_409_CONFLICT, "Venue is used by concerts and cannot be permanently deleted")
    db.delete(venue)
    db.commit()
    return {"deleted": True}


@app.get("/admin/venues/{venue_id}/seating")
def admin_venue_seating(venue_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    seats = db.scalars(select(Seat).where(Seat.venue_id == venue_id).order_by(Seat.row_label, Seat.number)).all()
    tiers = {}
    for seat in seats:
        tiers.setdefault(seat.category_name, {"name": seat.category_name, "seats": 0, "rows": set()})
        tiers[seat.category_name]["seats"] += 1
        tiers[seat.category_name]["rows"].add(seat.row_label)
    return {
        "venue": {
            "id": venue.id,
            "name": venue.name,
            "city": venue.city,
            "rows": venue.rows,
            "seats_per_row": venue.seats_per_row,
            "capacity": venue.rows * venue.seats_per_row,
        },
        "tiers": [
            {**tier, "rows": len(tier["rows"]), "percent": round((tier["seats"] / max(len(seats), 1)) * 100, 1), "status": "Active"}
            for tier in tiers.values()
        ],
        "seats": [{"id": seat.id, "label": seat.label, "row": seat.row_label, "number": seat.number, "tier": seat.category_name} for seat in seats],
    }


@app.put("/admin/venues/{venue_id}/seating")
def admin_update_venue_seating(venue_id: int, payload: VenueSeatingUpdate, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    venue = db.get(Venue, venue_id)
    if not venue:
        raise HTTPException(404, "Venue not found")
    used = db.scalar(select(func.count(Schedule.id)).where(Schedule.venue_id == venue_id)) or 0
    sold = db.scalar(select(func.count(Ticket.id)).join(Schedule, Ticket.schedule_id == Schedule.id).where(Schedule.venue_id == venue_id)) or 0
    if used and sold:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot regenerate seats for a venue with sold tickets")
    tier_seats = payload.tier_seats or [{"name": tier.strip(), "seats": max(1, payload.seats_per_row)} for tier in payload.tiers if tier.strip()]
    normalized = [{"name": tier["name"].strip() if isinstance(tier, dict) else tier.name.strip(), "seats": int(tier["seats"] if isinstance(tier, dict) else tier.seats)} for tier in tier_seats]
    normalized = [tier for tier in normalized if tier["name"]]
    if len(set(tier["name"] for tier in normalized)) != len(normalized):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tier names must be unique")
    total_seats = sum(tier["seats"] for tier in normalized)
    capacity = payload.rows * payload.seats_per_row
    if total_seats > capacity:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tier seat total cannot exceed venue capacity")
    db.query(Seat).filter(Seat.venue_id == venue_id).delete(synchronize_session=False)
    venue.rows = payload.rows
    venue.seats_per_row = payload.seats_per_row
    seat_index = 0
    for tier in normalized:
        for _ in range(tier["seats"]):
            row_index = seat_index // venue.seats_per_row
            row = chr(ord("A") + row_index)
            number = (seat_index % venue.seats_per_row) + 1
            db.add(Seat(venue_id=venue.id, row_label=row, number=number, category_name=tier["name"]))
            seat_index += 1
    db.commit()
    return admin_venue_seating(venue_id, _, db)


@app.get("/admin/logs")
def logs(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.query(ConcurrencyLog).order_by(ConcurrencyLog.created_at.desc()).limit(200).all()
    return [
        {
            "id": row.id,
            "created_at": row.created_at,
            "thread_id": row.thread_id,
            "thread_name": row.thread_name,
            "operation": row.operation,
            "result": row.result,
            "customer": row.customer,
            "concert": row.concert,
            "seat": row.seat,
            "waiting_ms": row.waiting_ms,
            "duration_ms": row.duration_ms,
            "details": row.details,
        }
        for row in rows
    ]


@app.post("/admin/simulations")
def simulations(payload: SimulationRequest, _: User = Depends(admin_user)):
    return run_simulation(payload.mode, payload.attempts, payload.schedule_id, payload.seat_id)
