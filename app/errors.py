"""Uniform error taxonomy.

Every failure the API can produce has a stable machine code, so the frontend can
branch on `error.code` and never parse prose. The envelope shape is frozen:

    {"error": {"code", "message", "details"}, "timestamp", "request_id"}
"""

from __future__ import annotations

from typing import Any, Optional


class AppError(Exception):
    """Base class for every deliberate, client-visible failure."""

    status_code = 400
    code = "BAD_REQUEST"

    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.details = details or {}


class InvalidInput(AppError):
    status_code = 422
    code = "INVALID_INPUT"


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"


class Unauthorized(AppError):
    status_code = 401
    code = "UNAUTHORIZED"


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"


class RateLimited(AppError):
    status_code = 429
    code = "RATE_LIMITED"


class ScanFailed(AppError):
    status_code = 500
    code = "SCAN_FAILED"


class UnsupportedTarget(AppError):
    status_code = 415
    code = "UNSUPPORTED_TARGET"


class PayloadTooLarge(AppError):
    """Request or response deliberately bounded (exports, uploads, scan budgets)."""
    status_code = 413
    code = "EXPORT_TOO_LARGE"


class UpstreamUnavailable(AppError):
    status_code = 503
    code = "UPSTREAM_UNAVAILABLE"
