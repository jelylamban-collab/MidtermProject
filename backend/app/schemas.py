from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=255)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    contact_number: str | None = Field(default="", max_length=40)
    password: str = Field(min_length=8)
    confirm_password: str | None = Field(default=None, min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class ProfileUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(default="", max_length=120)
    email: EmailStr
    contact_number: str = Field(default="", max_length=40)
    profile_photo_url: str | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class TemporaryPasswordChange(BaseModel):
    new_password: str = Field(min_length=8)
    confirm_password: str = Field(min_length=8)


class ResetRequestStatusUpdate(BaseModel):
    status: str = Field(pattern="^(Pending|Processed|Cancelled)$")


class PolicyRuleInput(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=600)


class ConcertCreate(BaseModel):
    title: str
    artist: str
    description: str
    poster_url: str
    banner_url: str | None = None
    category: str
    status: str = "On Sale"
    max_tickets_per_customer: int = Field(default=4, ge=1, le=20)
    venue_id: int | None = None
    starts_at: datetime | None = None
    schedule_days: list[datetime] = Field(default_factory=list, max_length=14)
    sale_opens_at: datetime | None = None
    sale_closes_at: datetime | None = None
    vip_price: Decimal = Field(default=Decimal("6500.00"), ge=0)
    lower_bowl_price: Decimal = Field(default=Decimal("3800.00"), ge=0)
    general_price: Decimal = Field(default=Decimal("1800.00"), ge=0)
    tier_prices: dict[str, Decimal] = Field(default_factory=dict)
    rules: list[PolicyRuleInput] = Field(default_factory=list, max_length=20)


class VenueTierSeatInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    seats: int = Field(ge=1, le=1500)


class VenueCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    city: str = Field(min_length=2, max_length=120)
    image_url: str | None = None
    rows: int = Field(ge=1, le=30)
    seats_per_row: int = Field(ge=1, le=50)
    tier_seats: list[VenueTierSeatInput] = Field(default_factory=list, max_length=12)


class VenueSeatingUpdate(BaseModel):
    rows: int = Field(ge=1, le=30)
    seats_per_row: int = Field(ge=1, le=50)
    tiers: list[str] = Field(default_factory=list, max_length=8)
    tier_seats: list[VenueTierSeatInput] = Field(default_factory=list, max_length=12)


class HoldRequest(BaseModel):
    schedule_id: int
    seat_ids: list[int]


class ReleaseHoldRequest(BaseModel):
    schedule_id: int
    seat_ids: list[int]


class CheckoutRequest(BaseModel):
    schedule_id: int
    seat_ids: list[int]
    idempotency_key: str = Field(min_length=8, max_length=100)
    payment_method: str = "Simulated Card"


class SimulationRequest(BaseModel):
    mode: str = Field(pattern="^(safe|unsafe)$")
    attempts: int = Field(ge=5, le=100)
    schedule_id: int
    seat_id: int


class SeatOut(BaseModel):
    id: int
    label: str
    row: str
    number: int
    category: str
    price: Decimal
    status: str
    hold_expires_at: datetime | None = None


class ReservationOut(BaseModel):
    id: int
    status: str
    booking_reference: str
    total_amount: Decimal
    created_at: datetime
