"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-09
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="customer"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "venues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("city", sa.String(120), nullable=False),
        sa.Column("rows", sa.Integer(), nullable=False),
        sa.Column("seats_per_row", sa.Integer(), nullable=False),
    )
    op.create_table(
        "concerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("artist", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("poster_url", sa.String(500), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("status", sa.String(40), nullable=False, server_default="On Sale"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("concert_id", sa.Integer(), sa.ForeignKey("concerts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sale_opens_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sale_closes_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "seat_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
    )
    op.create_table(
        "seats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_label", sa.String(8), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("category_name", sa.String(100), nullable=False),
        sa.UniqueConstraint("venue_id", "row_label", "number", name="uq_seat_in_venue"),
    )
    op.create_table(
        "seat_holds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seat_id", sa.Integer(), sa.ForeignKey("seats.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("schedules.id"), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("booking_reference", sa.String(40), nullable=False, unique=True),
        sa.Column("idempotency_key", sa.String(100), nullable=False, unique=True),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "reservation_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reservation_id", sa.Integer(), sa.ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seat_id", sa.Integer(), sa.ForeignKey("seats.id"), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reservation_id", sa.Integer(), sa.ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("method", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reservation_id", sa.Integer(), sa.ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("schedules.id"), nullable=False),
        sa.Column("seat_id", sa.Integer(), sa.ForeignKey("seats.id"), nullable=False),
        sa.Column("ticket_number", sa.String(60), nullable=False, unique=True),
        sa.Column("qr_payload", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("schedule_id", "seat_id", name="uq_ticket_per_schedule_seat"),
    )
    op.create_table(
        "simulation_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("success_count", sa.Integer(), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "concurrency_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("simulation_run_id", sa.Integer(), sa.ForeignKey("simulation_runs.id"), nullable=True),
        sa.Column("thread_name", sa.String(120), nullable=False),
        sa.Column("thread_id", sa.String(80), nullable=False),
        sa.Column("operation", sa.String(120), nullable=False),
        sa.Column("result", sa.String(80), nullable=False),
        sa.Column("customer", sa.String(255), nullable=True),
        sa.Column("concert", sa.String(255), nullable=True),
        sa.Column("seat", sa.String(40), nullable=True),
        sa.Column("waiting_ms", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Numeric(12, 3), nullable=False, server_default="0"),
        sa.Column("details", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_holds_lookup", "seat_holds", ["schedule_id", "seat_id", "released_at", "expires_at"])
    op.create_index("ix_logs_created", "concurrency_logs", ["created_at"])


def downgrade():
    for table in [
        "concurrency_logs",
        "simulation_runs",
        "tickets",
        "payments",
        "reservation_items",
        "reservations",
        "seat_holds",
        "seats",
        "seat_categories",
        "schedules",
        "concerts",
        "venues",
        "users",
    ]:
        op.drop_table(table)
