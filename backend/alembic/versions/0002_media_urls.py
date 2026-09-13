"""add media URL fields

Revision ID: 0002_media_urls
Revises: 0001_initial
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0002_media_urls"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    inspector = inspect(op.get_bind())
    concert_columns = {column["name"] for column in inspector.get_columns("concerts")}
    venue_columns = {column["name"] for column in inspector.get_columns("venues")}
    if "banner_url" not in concert_columns:
        op.add_column("concerts", sa.Column("banner_url", sa.String(500), nullable=True))
    if "image_url" not in venue_columns:
        op.add_column("venues", sa.Column("image_url", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("venues", "image_url")
    op.drop_column("concerts", "banner_url")
