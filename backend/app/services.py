from __future__ import annotations

import io
import json
import random
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from xml.sax.saxutils import escape

import qrcode
from fastapi import HTTPException, status
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, joinedload

from app.database import db_session, engine
from app.models import (
    ConcurrencyLog,
    Concert,
    Payment,
    Reservation,
    ReservationItem,
    Schedule,
    Seat,
    SeatCategory,
    SeatHold,
    SimulationRun,
    Ticket,
    User,
    Venue,
)

local_purchase_locks: dict[tuple[int, int], threading.Lock] = {}
locks_guard = threading.Lock()
unsafe_claims: list[int] = []


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_lock(key: tuple[int, int]) -> threading.Lock:
    with locks_guard:
        if key not in local_purchase_locks:
            local_purchase_locks[key] = threading.Lock()
        return local_purchase_locks[key]


def cleanup_expired_holds(db: Session) -> int:
    now = utcnow()
    expired = (
        db.query(SeatHold)
        .filter(SeatHold.released_at.is_(None), SeatHold.expires_at <= now)
        .update({"released_at": now}, synchronize_session=False)
    )
    if expired:
        db.add(
            ConcurrencyLog(
                thread_name=threading.current_thread().name,
                thread_id=str(threading.get_ident()),
                operation="hold_expiration",
                result="released",
                details=f"Released {expired} expired holds",
            )
        )
    return expired


def seed_data(db: Session, admin_email: str, admin_password_hash: str, customer_password_hash: str | None = None):
    admin = db.scalar(select(User).where(User.role == "admin").order_by(User.id))
    if admin:
        admin.email = admin_email
        admin.hashed_password = admin_password_hash
        admin.full_name = admin.full_name or "TicketRush Admin"
    else:
        admin = User(email=admin_email, full_name="TicketRush Admin", hashed_password=admin_password_hash, role="admin")
        db.add(admin)

    customer = db.scalar(select(User).where(User.email == "customer@ticketrush.example.com"))
    if not customer:
        customer = User(
            email="customer@ticketrush.example.com",
            full_name="Demo Customer",
            hashed_password=customer_password_hash or admin_password_hash,
            role="customer",
        )
        db.add(customer)

    venue = db.scalar(select(Venue).where(Venue.name == "SM Seaside Arena").order_by(Venue.id))
    if not venue:
        venue = Venue(name="SM Seaside Arena", city="Cebu City", rows=24, seats_per_row=12)
        db.add(venue)
        db.flush()
        seat_plan = [("VVIP", 100), ("VIP", 100), ("General Admission", 83)]
        created = 0
        for category, count in seat_plan:
            for _ in range(count):
                row_index = created // venue.seats_per_row
                number = (created % venue.seats_per_row) + 1
                row = chr(ord("A") + row_index)
                db.add(Seat(venue_id=venue.id, row_label=row, number=number, category_name=category))
                created += 1

    for title in ("Neon Skyline Live", "Solar Hearts Tour", "Midnight Frequency"):
        old_concert = db.scalar(select(Concert).where(Concert.title == title))
        if old_concert and old_concert.status != "Archived":
            old_concert.status = "Archived"
            old_concert.archived_at = utcnow()

    demo_concerts = [
        {
            "title": "BTS World Tour Live in Cebu",
            "artist": "BTS",
            "description": "A full-scale K-pop concert experience in Cebu with premium reserved seating and arena production.",
            "poster_url": "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=85",
            "category": "Pop",
            "starts_at": utcnow() + timedelta(days=18),
            "prices": {"VVIP": Decimal("6620.00"), "VIP": Decimal("4520.00"), "General Admission": Decimal("2500.00")},
        },
        {
            "title": "Bruno Mars Concert",
            "artist": "Bruno Mars",
            "description": "A high-energy pop and R&B concert with reserved seating and customer-friendly ticket limits.",
            "poster_url": "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=85",
            "category": "R&B",
            "starts_at": utcnow() + timedelta(days=35),
            "prices": {"VVIP": Decimal("7200.00"), "VIP": Decimal("5200.00"), "General Admission": Decimal("3200.00")},
        },
    ]
    for item in demo_concerts:
        concert = db.scalar(select(Concert).where(Concert.title == item["title"]).order_by(Concert.id))
        if concert:
            concert.artist = item["artist"]
            concert.description = item["description"]
            if not concert.poster_url or "picsum.photos" in concert.poster_url:
                concert.poster_url = item["poster_url"]
            if not concert.banner_url or "picsum.photos" in concert.banner_url:
                concert.banner_url = concert.poster_url
            concert.category = item["category"]
            concert.status = "On Sale"
            concert.archived_at = None
            concert.max_tickets_per_customer = 4
        else:
            concert = Concert(
                title=item["title"],
                artist=item["artist"],
                description=item["description"],
                poster_url=item["poster_url"],
                banner_url=item["poster_url"],
                category=item["category"],
                status="On Sale",
                max_tickets_per_customer=4,
            )
            db.add(concert)
            db.flush()
        schedule = db.scalar(select(Schedule).where(Schedule.concert_id == concert.id).order_by(Schedule.id))
        if not schedule:
            schedule = Schedule(concert_id=concert.id, venue_id=venue.id, starts_at=item["starts_at"], sale_opens_at=utcnow() - timedelta(days=2), sale_closes_at=item["starts_at"] - timedelta(days=1))
            db.add(schedule)
            db.flush()
        else:
            schedule.venue_id = venue.id
            schedule.starts_at = item["starts_at"]
            schedule.sale_opens_at = utcnow() - timedelta(days=2)
            schedule.sale_closes_at = item["starts_at"] - timedelta(days=1)
        existing_categories = {category.name: category for category in db.scalars(select(SeatCategory).where(SeatCategory.schedule_id == schedule.id)).all()}
        for name, price in item["prices"].items():
            if name in existing_categories:
                existing_categories[name].price = price
            else:
                db.add(SeatCategory(schedule_id=schedule.id, name=name, price=price))

    if not db.scalar(select(Venue).where(Venue.name == "Pulse Arena").order_by(Venue.id)):
        legacy_venue = Venue(name="Pulse Arena", city="Manila", rows=8, seats_per_row=12)
        db.add(legacy_venue)
        db.flush()
        for row_index in range(legacy_venue.rows):
            row = chr(ord("A") + row_index)
            category = "VIP" if row_index < 2 else "Lower Bowl" if row_index < 5 else "General"
            for number in range(1, legacy_venue.seats_per_row + 1):
                db.add(Seat(venue_id=legacy_venue.id, row_label=row, number=number, category_name=category))

    db.commit()


def seed_legacy_concerts(db: Session, venue: Venue):
    posters = [
        ("Neon Skyline Live", "Luna Vale", "Synth-pop anthems under moving laser canopies.", "Electronic"),
        ("Solar Hearts Tour", "The Radiant Kind", "A bright arena show with brass, percussion, and crowd choruses.", "Pop"),
        ("Midnight Frequency", "Axis North", "Rock textures, cinematic lights, and a late-night pulse.", "Rock"),
    ]
    start = utcnow() + timedelta(days=21)
    for index, (title, artist, description, category) in enumerate(posters):
        if db.scalar(select(Concert).where(Concert.title == title)):
            continue
        concert = Concert(
            title=title,
            artist=artist,
            description=description,
            poster_url=f"https://picsum.photos/seed/ticketrush-{index}/900/1200",
            category=category,
            status="Archived",
            archived_at=utcnow(),
        )
        db.add(concert)
        db.flush()
        schedule = Schedule(
            concert_id=concert.id,
            venue_id=venue.id,
            starts_at=start + timedelta(days=index * 10),
            sale_opens_at=utcnow() - timedelta(days=3),
            sale_closes_at=start + timedelta(days=index * 10 - 1),
        )
        db.add(schedule)
        db.flush()
        db.add_all(
            [
                SeatCategory(schedule_id=schedule.id, name="VIP", price=Decimal("6500.00")),
                SeatCategory(schedule_id=schedule.id, name="Lower Bowl", price=Decimal("3800.00")),
                SeatCategory(schedule_id=schedule.id, name="General", price=Decimal("1800.00")),
            ]
        )
    db.commit()


def ensure_default_venue(db: Session) -> Venue:
    venue = db.scalar(select(Venue).order_by(Venue.id))
    if venue:
        return venue
    venue = Venue(name="Pulse Arena", city="Manila", rows=8, seats_per_row=12)
    db.add(venue)
    db.flush()
    for row_index in range(venue.rows):
        row = chr(ord("A") + row_index)
        category = "VIP" if row_index < 2 else "Lower Bowl" if row_index < 5 else "General"
        for number in range(1, venue.seats_per_row + 1):
            db.add(Seat(venue_id=venue.id, row_label=row, number=number, category_name=category))
    return venue


def create_default_schedule_for_concert(
    db: Session,
    concert: Concert,
    venue_id: int | None = None,
    starts_at: datetime | None = None,
    sale_opens_at: datetime | None = None,
    sale_closes_at: datetime | None = None,
    tier_prices: dict[str, Decimal] | None = None,
) -> Schedule:
    venue = db.get(Venue, venue_id) if venue_id else ensure_default_venue(db)
    if not venue:
        raise HTTPException(404, "Selected venue not found")
    now = utcnow()
    starts = starts_at or now + timedelta(days=30)
    sale_opens = sale_opens_at or now - timedelta(hours=1)
    sale_closes = sale_closes_at or starts - timedelta(days=1)
    if sale_closes >= starts:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ticket selling period must end before the concert starts")
    prices = tier_prices or {}
    schedule = Schedule(
        concert_id=concert.id,
        venue_id=venue.id,
        starts_at=starts,
        sale_opens_at=sale_opens,
        sale_closes_at=sale_closes,
    )
    db.add(schedule)
    db.flush()
    venue_tiers = [
        name
        for (name,) in db.execute(
            select(Seat.category_name).where(Seat.venue_id == venue.id).distinct().order_by(Seat.category_name)
        )
    ]
    defaults = {name: Decimal("1800.00") for name in venue_tiers} or {
        "VIP": Decimal("6500.00"),
        "Lower Bowl": Decimal("3800.00"),
        "General": Decimal("1800.00"),
    }
    categories = []
    for name, default_price in defaults.items():
        price = prices.get(name, default_price)
        if price < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ticket prices cannot be negative")
        categories.append(SeatCategory(schedule_id=schedule.id, name=name, price=price))
    db.add_all(categories)
    return schedule


def repair_concerts_without_schedules(db: Session) -> int:
    concerts = db.scalars(
        select(Concert).where(Concert.status != "Archived", ~Concert.id.in_(select(Schedule.concert_id)))
    ).all()
    for concert in concerts:
        create_default_schedule_for_concert(db, concert)
    if concerts:
        db.commit()
    return len(concerts)


def concert_summary(db: Session) -> list[dict]:
    cleanup_expired_holds(db)
    repair_concerts_without_schedules(db)
    schedules = db.scalars(
        select(Schedule)
        .join(Concert, Schedule.concert_id == Concert.id)
        .where(Concert.status != "Archived")
        .options(joinedload(Schedule.concert), joinedload(Schedule.venue))
    ).unique().all()
    data = []
    for schedule in schedules:
        try:
            rules = json.loads(schedule.concert.policy_rules or "[]")
        except json.JSONDecodeError:
            rules = []
        total = db.scalar(select(func.count(Seat.id)).where(Seat.venue_id == schedule.venue_id)) or 0
        sold = db.scalar(select(func.count(Ticket.id)).where(Ticket.schedule_id == schedule.id)) or 0
        prices = {
            category.name: category.price
            for category in db.scalars(select(SeatCategory).where(SeatCategory.schedule_id == schedule.id))
        }
        held = (
            db.scalar(
                select(func.count(SeatHold.id)).where(
                    SeatHold.schedule_id == schedule.id,
                    SeatHold.released_at.is_(None),
                    SeatHold.expires_at > utcnow(),
                )
            )
            or 0
        )
        data.append(
            {
                "id": schedule.concert.id,
                "schedule_id": schedule.id,
                "title": schedule.concert.title,
                "artist": schedule.concert.artist,
                "description": schedule.concert.description,
                "rules": rules,
                "poster_url": schedule.concert.poster_url,
                "banner_url": schedule.concert.banner_url or schedule.concert.poster_url,
                "category": schedule.concert.category,
                "status": "Sold Out" if sold >= total else schedule.concert.status,
                "max_tickets_per_customer": schedule.concert.max_tickets_per_customer,
                "venue_id": schedule.venue_id,
                "venue": schedule.venue.name,
                "city": schedule.venue.city,
                "starts_at": schedule.starts_at,
                "sale_opens_at": schedule.sale_opens_at,
                "sale_closes_at": schedule.sale_closes_at,
                "tier_prices": prices,
                "vip_price": prices.get("VIP", Decimal("6500.00")),
                "lower_bowl_price": prices.get("Lower Bowl", Decimal("3800.00")),
                "general_price": prices.get("General", Decimal("1800.00")),
                "total_seats": total,
                "available_seats": max(total - sold - held, 0),
            }
        )
    return data


def seat_map(db: Session, schedule_id: int) -> dict:
    cleanup_expired_holds(db)
    schedule = db.get(Schedule, schedule_id)
    if not schedule:
        raise HTTPException(404, "Concert schedule not found")
    category_prices = {c.name: c.price for c in db.scalars(select(SeatCategory).where(SeatCategory.schedule_id == schedule_id))}
    sold = {tid for (tid,) in db.execute(select(Ticket.seat_id).where(Ticket.schedule_id == schedule_id))}
    holds = {
        hold.seat_id: hold
        for hold in db.scalars(
            select(SeatHold).where(
                SeatHold.schedule_id == schedule_id,
                SeatHold.released_at.is_(None),
                SeatHold.expires_at > utcnow(),
            )
        )
    }
    seats = []
    for seat in db.scalars(select(Seat).where(Seat.venue_id == schedule.venue_id).order_by(Seat.row_label, Seat.number)):
        status_value = "sold" if seat.id in sold else "held" if seat.id in holds else "available"
        seats.append(
            {
                "id": seat.id,
                "label": seat.label,
                "row": seat.row_label,
                "number": seat.number,
                "category": seat.category_name,
                "price": category_prices.get(seat.category_name, Decimal("0.00")),
                "status": status_value,
                "hold_expires_at": holds[seat.id].expires_at if seat.id in holds else None,
            }
        )
    return {"schedule_id": schedule_id, "venue": schedule.venue.name, "seats": seats}


def _lock_seat_query(db: Session, seat_id: int):
    stmt = select(Seat).where(Seat.id == seat_id)
    if engine.dialect.name != "sqlite":
        stmt = stmt.with_for_update(nowait=False)
    return db.scalar(stmt)


def customer_ticket_usage(db: Session, user_id: int, concert_id: int, now, exclude_held_seat_ids: set[int] | None = None) -> int:
    schedule_ids = select(Schedule.id).where(Schedule.concert_id == concert_id)
    purchased = (
        db.scalar(
            select(func.count(Ticket.id))
            .join(Reservation, Ticket.reservation_id == Reservation.id)
            .where(Ticket.schedule_id.in_(schedule_ids), Reservation.user_id == user_id, Reservation.status != "cancelled")
        )
        or 0
    )
    hold_filters = [
        SeatHold.schedule_id.in_(schedule_ids),
        SeatHold.user_id == user_id,
        SeatHold.released_at.is_(None),
        SeatHold.expires_at > now,
    ]
    if exclude_held_seat_ids:
        hold_filters.append(~SeatHold.seat_id.in_(exclude_held_seat_ids))
    held = (
        db.scalar(
            select(func.count(SeatHold.id)).where(*hold_filters)
        )
        or 0
    )
    return int(purchased) + int(held)


def hold_seats(db: Session, user: User, schedule_id: int, seat_ids: list[int]) -> dict:
    if not seat_ids:
        raise HTTPException(400, "Select at least one seat")
    now = utcnow()
    expires = now + timedelta(minutes=5)
    sorted_ids = sorted(set(seat_ids))
    try:
        cleanup_expired_holds(db)
        with db.begin_nested():
            schedule = db.get(Schedule, schedule_id)
            if not schedule:
                raise HTTPException(404, "Concert schedule not found")
            limit = schedule.concert.max_tickets_per_customer or 4
            existing = customer_ticket_usage(db, user.id, schedule.concert_id, now, set(sorted_ids))
            remaining = max(limit - existing, 0)
            if len(sorted_ids) > remaining:
                raise HTTPException(status.HTTP_409_CONFLICT, f"Ticket limit reached. Maximum {limit}; existing {existing}; remaining {remaining}.")
            for seat_id in sorted_ids:
                _lock_seat_query(db, seat_id)
                if db.scalar(select(Ticket).where(Ticket.schedule_id == schedule_id, Ticket.seat_id == seat_id)):
                    raise HTTPException(status.HTTP_409_CONFLICT, "Seat already sold")
                hold = db.scalar(
                    select(SeatHold).where(
                        SeatHold.schedule_id == schedule_id,
                        SeatHold.seat_id == seat_id,
                        SeatHold.released_at.is_(None),
                        SeatHold.expires_at > now,
                    )
                )
                if hold and hold.user_id != user.id:
                    raise HTTPException(status.HTTP_409_CONFLICT, "Seat already reserved")
                if hold and hold.user_id == user.id:
                    hold.expires_at = expires
                else:
                    db.add(SeatHold(schedule_id=schedule_id, seat_id=seat_id, user_id=user.id, expires_at=expires))
        db.commit()
    except OperationalError as exc:
        db.rollback()
        log_event(db, "hold_seats", "timeout", details=str(exc))
        raise HTTPException(status.HTTP_409_CONFLICT, "Seat lock timed out")
    return {"held_until": expires, "seat_ids": sorted_ids}


def checkout(db: Session, user: User, schedule_id: int, seat_ids: list[int], idempotency_key: str, method: str) -> Reservation:
    existing = db.scalar(select(Reservation).where(Reservation.idempotency_key == idempotency_key, Reservation.user_id == user.id))
    if existing:
        return existing
    if not seat_ids:
        raise HTTPException(400, "Select at least one seat")
    now = utcnow()
    sorted_ids = sorted(set(seat_ids))
    start = time.perf_counter()
    try:
        cleanup_expired_holds(db)
        with db.begin_nested():
            schedule = db.get(Schedule, schedule_id)
            if not schedule:
                raise HTTPException(404, "Concert schedule not found")
            limit = schedule.concert.max_tickets_per_customer or 4
            existing = customer_ticket_usage(db, user.id, schedule.concert_id, now)
            if existing > limit or len(sorted_ids) > existing:
                raise HTTPException(status.HTTP_409_CONFLICT, f"Ticket limit reached. Maximum {limit}; existing {existing}; remaining {max(limit - existing, 0)}.")
            prices = {c.name: c.price for c in db.scalars(select(SeatCategory).where(SeatCategory.schedule_id == schedule_id))}
            total = Decimal("0.00")
            seats = []
            for seat_id in sorted_ids:
                seat = _lock_seat_query(db, seat_id)
                if not seat:
                    raise HTTPException(404, "Seat not found")
                if db.scalar(select(Ticket).where(Ticket.schedule_id == schedule_id, Ticket.seat_id == seat_id)):
                    raise HTTPException(status.HTTP_409_CONFLICT, "Seat already sold")
                hold = db.scalar(
                    select(SeatHold).where(
                        SeatHold.schedule_id == schedule_id,
                        SeatHold.seat_id == seat_id,
                        SeatHold.user_id == user.id,
                        SeatHold.released_at.is_(None),
                        SeatHold.expires_at > now,
                    )
                )
                if not hold:
                    raise HTTPException(status.HTTP_409_CONFLICT, "Seat hold expired")
                total += prices[seat.category_name]
                seats.append((seat, prices[seat.category_name]))
            total += Decimal("120.00")
            reservation = Reservation(
                user_id=user.id,
                schedule_id=schedule_id,
                status="confirmed",
                booking_reference=f"TR-{uuid.uuid4().hex[:10].upper()}",
                idempotency_key=idempotency_key,
                total_amount=total,
            )
            db.add(reservation)
            db.flush()
            for seat, price in seats:
                db.add(ReservationItem(reservation_id=reservation.id, seat_id=seat.id, price=price))
                ticket_no = f"TICKET-{uuid.uuid4().hex[:12].upper()}"
                db.add(
                    Ticket(
                        reservation_id=reservation.id,
                        schedule_id=schedule_id,
                        seat_id=seat.id,
                        ticket_number=ticket_no,
                        qr_payload=f"TicketRush:{ticket_no}:{reservation.booking_reference}",
                    )
                )
            db.add(Payment(reservation_id=reservation.id, amount=total, status="paid", method=method))
            db.query(SeatHold).filter(
                SeatHold.schedule_id == schedule_id,
                SeatHold.seat_id.in_(sorted_ids),
                SeatHold.user_id == user.id,
                SeatHold.released_at.is_(None),
            ).update({"released_at": now}, synchronize_session=False)
        db.commit()
        log_event(db, "checkout", "success", customer=user.email, waiting_ms=0, duration_ms=(time.perf_counter() - start) * 1000)
        return reservation
    except IntegrityError:
        db.rollback()
        log_event(db, "checkout", "conflict", customer=user.email, details="Unique ticket constraint prevented duplicate booking")
        raise HTTPException(status.HTTP_409_CONFLICT, "Seat already purchased")
    except OperationalError as exc:
        db.rollback()
        log_event(db, "checkout", "rollback", customer=user.email, details=str(exc))
        raise HTTPException(status.HTTP_409_CONFLICT, "Transaction timed out; please retry")


def log_event(db: Session, operation: str, result: str, **kwargs):
    db.add(
        ConcurrencyLog(
            thread_name=threading.current_thread().name,
            thread_id=str(threading.get_ident()),
            operation=operation,
            result=result,
            customer=kwargs.get("customer"),
            concert=kwargs.get("concert"),
            seat=kwargs.get("seat"),
            waiting_ms=kwargs.get("waiting_ms", 0),
            duration_ms=kwargs.get("duration_ms", 0),
            details=kwargs.get("details", ""),
            simulation_run_id=kwargs.get("simulation_run_id"),
        )
    )
    db.commit()


def run_simulation(mode: str, attempts: int, schedule_id: int, seat_id: int) -> dict:
    unsafe_claims.clear()
    results = []
    run_db = db_session()
    run = SimulationRun(mode=mode, attempts=attempts, success_count=0, failure_count=0)
    run_db.add(run)
    run_db.commit()
    run_id = run.id
    run_db.close()

    def attempt(index: int) -> dict:
        thread_name = threading.current_thread().name
        thread_id = threading.get_ident()
        start = time.perf_counter()
        wait_start = time.perf_counter()
        result = "failed"
        detail = ""
        if mode == "unsafe":
            time.sleep(random.uniform(0.001, 0.025))
            if seat_id not in unsafe_claims:
                time.sleep(random.uniform(0.001, 0.025))
                unsafe_claims.append(seat_id)
                result = "success"
                detail = "Race-prone in-memory claim; test data only"
            else:
                detail = "Seat already claimed in unsafe sample state"
            waiting = 0
        else:
            lock = get_lock((schedule_id, seat_id))
            with lock:
                waiting = (time.perf_counter() - wait_start) * 1000
                session = db_session()
                try:
                    if session.scalar(select(Ticket).where(Ticket.schedule_id == schedule_id, Ticket.seat_id == seat_id)):
                        detail = "Database source of truth rejected duplicate ticket"
                    else:
                        sim_user = session.scalar(select(User).where(User.email == "customer@ticketrush.example.com"))
                        ref = f"SIM-{uuid.uuid4().hex[:10].upper()}"
                        reservation = Reservation(
                            user_id=sim_user.id,
                            schedule_id=schedule_id,
                            status="simulation",
                            booking_reference=ref,
                            idempotency_key=f"sim-{uuid.uuid4()}",
                            total_amount=Decimal("0.00"),
                        )
                        session.add(reservation)
                        session.flush()
                        session.add(
                            Ticket(
                                reservation_id=reservation.id,
                                schedule_id=schedule_id,
                                seat_id=seat_id,
                                ticket_number=f"SIMT-{uuid.uuid4().hex[:12].upper()}",
                                qr_payload=ref,
                            )
                        )
                        session.commit()
                        result = "success"
                        detail = "Python lock plus unique database constraint allowed one winner"
                except IntegrityError:
                    session.rollback()
                    detail = "Unique constraint prevented duplicate ticket"
                finally:
                    session.close()
        duration = (time.perf_counter() - start) * 1000
        session = db_session()
        log_event(
            session,
            "safe_simulation" if mode == "safe" else "unsafe_simulation",
            result,
            seat=str(seat_id),
            waiting_ms=waiting,
            duration_ms=duration,
            details=detail,
            simulation_run_id=run_id,
        )
        session.close()
        return {
            "attempt": index,
            "thread_name": thread_name,
            "thread_id": thread_id,
            "waiting_ms": round(waiting, 3),
            "duration_ms": round(duration, 3),
            "result": result,
            "details": detail,
        }

    with ThreadPoolExecutor(max_workers=min(attempts, 32), thread_name_prefix=f"TicketRush-{mode}") as executor:
        futures = [executor.submit(attempt, i + 1) for i in range(attempts)]
        for future in as_completed(futures):
            results.append(future.result())

    success = sum(1 for item in results if item["result"] == "success")
    session = db_session()
    run = session.get(SimulationRun, run_id)
    run.success_count = success
    run.failure_count = attempts - success
    session.commit()
    session.close()
    return {"run_id": run_id, "mode": mode, "attempts": attempts, "success_count": success, "failure_count": attempts - success, "results": sorted(results, key=lambda x: x["attempt"])}


def ticket_pdf(db: Session, ticket_id: int, user: User) -> bytes:
    ticket = db.get(Ticket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    reservation = db.get(Reservation, ticket.reservation_id)
    if user.role != "admin" and reservation.user_id != user.id:
        raise HTTPException(403, "Ticket access denied")
    schedule = db.get(Schedule, ticket.schedule_id)
    concert = db.get(Concert, schedule.concert_id)
    seat = db.get(Seat, ticket.seat_id)
    owner = db.get(User, reservation.user_id)
    buffer = io.BytesIO()
    page = canvas.Canvas(buffer, pagesize=letter)
    page.setFont("Helvetica-Bold", 22)
    page.drawString(72, 730, "TicketRush")
    page.setFont("Helvetica", 12)
    lines = [
        f"Ticket: {ticket.ticket_number}",
        f"Booking: {reservation.booking_reference}",
        f"Customer: {owner.full_name}",
        f"Concert: {concert.title}",
        f"Artist: {concert.artist}",
        f"Venue: {schedule.venue.name}",
        f"Date: {schedule.starts_at}",
        f"Seat: {seat.label} ({seat.category_name})",
    ]
    y = 690
    style = ParagraphStyle("Ticket detail", fontName="Helvetica", fontSize=11, leading=16)
    for line in lines:
        paragraph = Paragraph(escape(line), style)
        _, height = paragraph.wrap(294, 700)
        if y - height < 60:
            page.showPage()
            y = 730
        paragraph.drawOn(page, 72, y - height)
        y -= height + 10
    qr = qrcode.make(ticket.qr_payload)
    qr_buffer = io.BytesIO()
    qr.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    page.drawImage(ImageReader(qr_buffer), 390, 560, 150, 150, preserveAspectRatio=True)
    page.showPage()
    page.save()
    return buffer.getvalue()
