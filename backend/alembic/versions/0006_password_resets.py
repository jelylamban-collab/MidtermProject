"""password reset workflow

Revision ID: 0006_password_resets
Revises: 0005_uploaded_images
Create Date: 2026-09-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0006_password_resets"
down_revision = "0005_uploaded_images"
branch_labels = None
depends_on = None


def add_column_if_missing(table_name, column):
    inspector = inspect(op.get_bind())
    if column.name not in {item["name"] for item in inspector.get_columns(table_name)}:
        op.add_column(table_name, column)


def upgrade():
    inspector = inspect(op.get_bind())
    add_column_if_missing("users", sa.Column("force_password_change", sa.Integer(), nullable=False, server_default="0"))
    add_column_if_missing("users", sa.Column("temporary_password_expires_at", sa.DateTime(timezone=True), nullable=True))
    add_column_if_missing("users", sa.Column("temporary_password_used_at", sa.DateTime(timezone=True), nullable=True))
    add_column_if_missing("users", sa.Column("session_version", sa.Integer(), nullable=False, server_default="1"))

    if "password_reset_requests" not in inspector.get_table_names():
        op.create_table(
            "password_reset_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="Pending"),
            sa.Column("processed_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_password_reset_requests_email", "password_reset_requests", ["email"])

    if "account_security_events" not in inspector.get_table_names():
        op.create_table(
            "account_security_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("event_type", sa.String(length=80), nullable=False),
            sa.Column("details", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )


def downgrade():
    op.drop_table("account_security_events")
    op.drop_index("ix_password_reset_requests_email", table_name="password_reset_requests")
    op.drop_table("password_reset_requests")
    op.drop_column("users", "session_version")
    op.drop_column("users", "temporary_password_used_at")
    op.drop_column("users", "temporary_password_expires_at")
    op.drop_column("users", "force_password_change")
