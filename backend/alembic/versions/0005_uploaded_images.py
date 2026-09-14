"""store uploaded images

Revision ID: 0005_uploaded_images
Revises: 0004_concert_ticket_limit
Create Date: 2026-09-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0005_uploaded_images"
down_revision = "0004_concert_ticket_limit"
branch_labels = None
depends_on = None


def upgrade():
    inspector = inspect(op.get_bind())
    if "uploaded_images" not in inspector.get_table_names():
        op.create_table(
            "uploaded_images",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("filename", sa.String(length=255), nullable=False),
            sa.Column("content_type", sa.String(length=120), nullable=False),
            sa.Column("data", sa.LargeBinary(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_uploaded_images_filename", "uploaded_images", ["filename"], unique=True)


def downgrade():
    op.drop_index("ix_uploaded_images_filename", table_name="uploaded_images")
    op.drop_table("uploaded_images")
