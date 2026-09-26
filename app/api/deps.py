"""Shared FastAPI dependencies: auth, rate limiting, sessions, pagination."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Iterator, Optional

from fastapi import Depends, Header, Query, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import create_db_engine, create_session_factory
from app.errors import RateLimited, Unauthorized


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_engine(request: Request) -> Engine:
    return request.app.state.engine


def get_session(request: Request) -> Iterator[Session]:
    factory: sessionmaker[Session] = request.app.state.session_factory
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


class RateLimiter:
    """Per-key sliding window, in-process. Redis is the scale-out path."""

    def __init__(self, limit_per_minute: int) -> None:
        self.limit = max(1, limit_per_minute)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            while bucket and now - bucket[0] > 60:
                bucket.popleft()
            if len(bucket) >= self.limit:
                retry_after = max(1, int(60 - (now - bucket[0])))
                return False, retry_after
            bucket.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def get_limiter(request: Request) -> RateLimiter:
    return request.app.state.limiter


def require_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    authorization: Optional[str] = Header(default=None),
    settings: Settings = Depends(get_settings_dep),
    limiter: RateLimiter = Depends(get_limiter),
) -> str:
    key = x_api_key
    if not key and authorization and authorization.lower().startswith("bearer "):
        key = authorization[7:].strip()
    if not key or key not in settings.api_keys:
        raise Unauthorized("valid API key required (X-API-Key or Authorization: Bearer)",
                           details={"hint": "use the key from ECDAT_API_KEYS or .env"})
    allowed, retry_after = limiter.check(key)
    if not allowed:
        raise RateLimited("rate limit exceeded", details={"retry_after_seconds": retry_after})
    request.state.api_key = key
    return key


class Pagination:
    def __init__(
        self,
        limit: int = Query(default=50, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> None:
        self.limit = limit
        self.offset = offset

    def slice(self, items: list):
        return items[self.offset: self.offset + self.limit], len(items)


def paginate(items: list, limit: int, offset: int) -> dict:
    window = items[offset: offset + limit]
    return {
        "items": window,
        "total": len(items),
        "limit": limit,
        "offset": offset,
        "has_next": offset + limit < len(items),
    }
