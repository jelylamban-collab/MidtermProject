"""add archive and profile fields

Revision ID: 0003_archive_profile_fields
Revises: 0002_media_urls
Create Date: 2026-09-11 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0003_archive_profile_fields"
down_revision = "0002_media_urls"
branch_labels = None
depends_on = None


def upgrade():
    inspector = inspect(op.get_bind())
    concert_columns = {column["name"] for column in inspector.get_columns("concerts")}
    venue_columns = {column["name"] for column in inspector.get_columns("venues")}
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "archived_at" not in concert_columns:
        op.add_column("concerts", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    if "policy_rules" not in concert_columns:
        op.add_column("concerts", sa.Column("policy_rules", sa.Text(), nullable=True))
    if "status" not in venue_columns:
        op.add_column("venues", sa.Column("status", sa.String(length=40), nullable=False, server_default="Active"))
    if "archived_at" not in venue_columns:
        op.add_column("venues", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    if "contact_number" not in user_columns:
        op.add_column("users", sa.Column("contact_number", sa.String(length=40), nullable=True))
    if "profile_photo_url" not in user_columns:
        op.add_column("users", sa.Column("profile_photo_url", sa.String(length=500), nullable=True))
    if "account_status" not in user_columns:
        op.add_column("users", sa.Column("account_status", sa.String(length=40), nullable=False, server_default="Active"))
    if "last_login_at" not in user_columns:
        op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "account_status")
    op.drop_column("users", "profile_photo_url")
    op.drop_column("users", "contact_number")
    op.drop_column("venues", "archived_at")
    op.drop_column("venues", "status")
    op.drop_column("concerts", "policy_rules")
    op.drop_column("concerts", "archived_at")
