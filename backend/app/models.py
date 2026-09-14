from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    full_name = Column(String(255), nullable=False)
    contact_number = Column(String(40), nullable=True)
    profile_photo_url = Column(String(500), nullable=True)
    account_status = Column(String(40), nullable=False, default="Active")
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="customer")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Venue(Base):
    __tablename__ = "venues"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    city = Column(String(120), nullable=False)
    image_url = Column(String(500), nullable=True)
    status = Column(String(40), nullable=False, default="Active")
    archived_at = Column(DateTime(timezone=True), nullable=True)
    rows = Column(Integer, nullable=False)
    seats_per_row = Column(Integer, nullable=False)
    seats = relationship("Seat", back_populates="venue", cascade="all, delete-orphan")


class Concert(Base):
    __tablename__ = "concerts"
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    artist = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    policy_rules = Column(Text, nullable=True)
    poster_url = Column(String(500), nullable=False)
    banner_url = Column(String(500), nullable=True)
    category = Column(String(100), nullable=False)
    status = Column(String(40), nullable=False, default="On Sale")
    max_tickets_per_customer = Column(Integer, nullable=False, default=4)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    schedules = relationship("Schedule", back_populates="concert", cascade="all, delete-orphan")


class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True)
    concert_id = Column(Integer, ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False)
    venue_id = Column(Integer, ForeignKey("venues.id"), nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=False)
    sale_opens_at = Column(DateTime(timezone=True), nullable=False)
    sale_closes_at = Column(DateTime(timezone=True), nullable=False)
    concert = relationship("Concert", back_populates="schedules")
    venue = relationship("Venue")
    categories = relationship("SeatCategory", back_populates="schedule", cascade="all, delete-orphan")


class SeatCategory(Base):
    __tablename__ = "seat_categories"
    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    schedule = relationship("Schedule", back_populates="categories")


class Seat(Base):
    __tablename__ = "seats"
    __table_args__ = (UniqueConstraint("venue_id", "row_label", "number", name="uq_seat_in_venue"),)
    id = Column(Integer, primary_key=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False)
    row_label = Column(String(8), nullable=False)
    number = Column(Integer, nullable=False)
    category_name = Column(String(100), nullable=False)
    venue = relationship("Venue", back_populates="seats")

    @property
    def label(self) -> str:
        return f"{self.row_label}{self.number}"


class SeatHold(Base):
    __tablename__ = "seat_holds"
    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False)
    seat_id = Column(Integer, ForeignKey("seats.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    released_at = Column(DateTime(timezone=True), nullable=True)


class Reservation(Base):
    __tablename__ = "reservations"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False)
    status = Column(String(40), nullable=False)
    booking_reference = Column(String(40), nullable=False, unique=True)
    idempotency_key = Column(String(100), nullable=False, unique=True)
    total_amount = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    items = relationship("ReservationItem", cascade="all, delete-orphan")


class ReservationItem(Base):
    __tablename__ = "reservation_items"
    id = Column(Integer, primary_key=True)
    reservation_id = Column(Integer, ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False)
    seat_id = Column(Integer, ForeignKey("seats.id"), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)


class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    reservation_id = Column(Integer, ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(40), nullable=False)
    method = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (UniqueConstraint("schedule_id", "seat_id", name="uq_ticket_per_schedule_seat"),)
    id = Column(Integer, primary_key=True)
    reservation_id = Column(Integer, ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False)
    seat_id = Column(Integer, ForeignKey("seats.id"), nullable=False)
    ticket_number = Column(String(60), nullable=False, unique=True)
    qr_payload = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    id = Column(Integer, primary_key=True)
    mode = Column(String(20), nullable=False)
    attempts = Column(Integer, nullable=False)
    success_count = Column(Integer, nullable=False)
    failure_count = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ConcurrencyLog(Base):
    __tablename__ = "concurrency_logs"
    id = Column(Integer, primary_key=True)
    simulation_run_id = Column(Integer, ForeignKey("simulation_runs.id"), nullable=True)
    thread_name = Column(String(120), nullable=False)
    thread_id = Column(String(80), nullable=False)
    operation = Column(String(120), nullable=False)
    result = Column(String(80), nullable=False)
    customer = Column(String(255), nullable=True)
    concert = Column(String(255), nullable=True)
    seat = Column(String(40), nullable=True)
    waiting_ms = Column(Numeric(12, 3), nullable=False, default=0)
    duration_ms = Column(Numeric(12, 3), nullable=False, default=0)
    details = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UploadedImage(Base):
    __tablename__ = "uploaded_images"
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False, unique=True, index=True)
    content_type = Column(String(120), nullable=False)
    data = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
