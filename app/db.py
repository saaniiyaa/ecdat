"""Engine / session management.

One code path for two dialects:
  * SQLite  -> air-gapped laptop demo, zero setup, file-backed
  * PostgreSQL -> production / cloud, JSONB + GIN indexes, real concurrency

The portability rules we hold ourselves to:
  1. No Postgres-only types in the ORM (JSONB is used through a variant type).
  2. No SQLite-only pragmas in the query layer.
  3. No ENUM columns (CHECK constraints + VARCHAR) so schema diffs stay trivial.
  4. All primary keys are application-generated strings -> identical IDs in both stores.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import JSON, create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

# JSON on SQLite, JSONB on PostgreSQL: same model code, better production
# behaviour (GIN-indexable on Postgres). Values are normalised with
# `app.services.serialize.jsonable` before they reach a column.
JSONVariant = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    """Declarative base for the whole inventory schema."""


def utcnow() -> dt.datetime:
    """Naive UTC timestamp (portable across SQLite/Postgres, serialised with 'Z')."""
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def create_db_engine(database_url: str, *, echo: bool = False) -> Engine:
    kwargs: dict = {"echo": echo, "future": True}
    if database_url.startswith("sqlite"):
        # check_same_thread=False: FastAPI's threadpool workers share the engine.
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        if ":memory:" in database_url:
            kwargs["poolclass"] = StaticPool
    else:
        kwargs.update(pool_pre_ping=True, pool_size=10, max_overflow=20, pool_recycle=1800)

    engine = create_engine(database_url, **kwargs)

    if database_url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - driver hook
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")       # FK enforcement OFF by default in SQLite
            cur.execute("PRAGMA journal_mode=WAL")      # concurrent readers during scans
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """Transactional scope: commit on success, roll back on any exception."""
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db(engine: Engine) -> None:
    """Create tables if missing. Idempotent - safe on every boot and on boot races."""
    from app import models  # noqa: F401  (register mappers)

    try:
        Base.metadata.create_all(engine)
    except OperationalError:
        # Two workers starting simultaneously: one lost the race, which is fine.
        Base.metadata.create_all(engine)
