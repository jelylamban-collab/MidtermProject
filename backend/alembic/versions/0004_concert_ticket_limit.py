"""add concert ticket limit

Revision ID: 0004_concert_ticket_limit
Revises: 0003_archive_profile_fields
Create Date: 2026-09-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0004_concert_ticket_limit"
down_revision = "0003_archive_profile_fields"
branch_labels = None
depends_on = None


def upgrade():
    inspector = inspect(op.get_bind())
    concert_columns = {column["name"] for column in inspector.get_columns("concerts")}
    if "max_tickets_per_customer" not in concert_columns:
        op.add_column("concerts", sa.Column("max_tickets_per_customer", sa.Integer(), nullable=False, server_default="4"))


def downgrade():
    op.drop_column("concerts", "max_tickets_per_customer")
