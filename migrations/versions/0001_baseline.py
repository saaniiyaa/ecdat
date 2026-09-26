"""baseline: schema is created from the declarative models

ECDAT creates its schema with `create_all` on first boot so that a laptop and a
fresh Postgres container reach the same state with no manual step. This baseline
revision therefore performs no DDL - it exists so that Alembic owns every
*subsequent* change and `alembic current` always reports a truthful revision.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-09-26
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa  # noqa: F401

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """No-op: the 19 tables already exist (see app/models.py)."""


def downgrade() -> None:
    """No-op: dropping the schema is `rm ecdat.db` on SQLite / DROP SCHEMA on Postgres."""
