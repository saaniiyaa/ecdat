"""FastAPI application factory.

Run locally:      uvicorn app.main:app --host 0.0.0.0 --port 8000
Run in Docker:    docker compose up
Run on Render:    render.yaml (blueprint at repo root)

Design notes
------------
* One Uvicorn worker for the laptop demo (scan workers are an in-process
  thread pool, so multiple workers would duplicate work). For production scale,
  run N web workers *and* move scan execution to a queue (see README).
* `ECDAT_API_KEYS` accepts several keys, so the frontend and the CLI can have
  separate credentials without a database-backed user table.
"""

from __future__ import annotations

import logging
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import routes_analysis, routes_evidence, routes_meta, routes_scans
from app.api.deps import RateLimiter
from app.config import get_settings
from app.db import create_db_engine, create_session_factory, init_db
from app.errors import AppError
from app.schemas import iso

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("ecdat")


def _error_payload(code: str, message: str, details: dict[str, Any], request_id: str) -> dict[str, Any]:
    return {
        "error": {"code": code, "message": message, "details": details},
        "timestamp": iso(__import__("datetime").datetime.now(__import__("datetime").timezone.utc)),
        "request_id": request_id,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.engine = create_db_engine(settings.database_url, echo=settings.sql_echo)
    init_db(app.state.engine)
    app.state.session_factory = create_session_factory(app.state.engine)
    app.state.limiter = RateLimiter(settings.rate_limit_rpm)
    app.state.executor = ThreadPoolExecutor(max_workers=max(2, settings.scan_workers),
                                           thread_name_prefix="ecdat-scan")
    app.state.future_registry: set[Future] = set()
    app.state.upload_dir = Path(".ecdat/uploads")
    app.state.upload_dir.mkdir(parents=True, exist_ok=True)
    logger.info("ecdat ready: dialect=%s policy_pack=%s workers=%d",
                "sqlite" if settings.is_sqlite else "postgresql",
                settings.policy_pack_version, settings.scan_workers)
    try:
        yield
    finally:
        app.state.executor.shutdown(wait=False, cancel_futures=True)
        app.state.engine.dispose()


ERROR_RESPONSES: dict[int | str, dict] = {
    400: ("BAD_REQUEST", "Malformed request that the validator could not describe"),
    401: ("UNAUTHORIZED", "Missing or unknown X-API-Key"),
    404: ("NOT_FOUND", "Unknown scan, workspace, finding or attestation id"),
    409: ("CONFLICT", "State conflict, e.g. cancelling a scan that already finished"),
    413: ("EXPORT_TOO_LARGE", "Export exceeds ECDAT_EXPORT_MAX_FINDINGS for this scan"),
    415: ("UNSUPPORTED_TARGET", "Target kind or container type cannot be ingested"),
    422: ("INVALID_INPUT", "Field-level validation failure; `details` lists the offending fields"),
    429: ("RATE_LIMITED", "Per-key request budget exceeded (ECDAT_RATE_LIMIT_RPM)"),
    500: ("SCAN_FAILED", "Internal failure; the scan row keeps the traceback reference"),
    503: ("UPSTREAM_UNAVAILABLE", "A configured external dependency is unreachable"),
}


def _openapi_with_error_envelope(app: FastAPI):
    """Wrap the generated OpenAPI document so every operation documents the
    uniform error envelope and the standard headers."""
    base = app.openapi

    def custom() -> dict:
        document = base()
        envelope = {
            "type": "object",
            "required": ["error", "timestamp", "request_id"],
            "properties": {
                "error": {
                    "type": "object",
                    "required": ["code", "message"],
                    "properties": {
                        "code": {"type": "string", "enum": sorted({v[0] for v in ERROR_RESPONSES.values()})},
                        "message": {"type": "string"},
                        "details": {"type": "object", "additionalProperties": True},
                    },
                },
                "timestamp": {"type": "string", "format": "date-time"},
                "request_id": {"type": "string"},
            },
        }
        for path, operations in document.get("paths", {}).items():
            for method, operation in operations.items():
                responses = operation.setdefault("responses", {})
                for status, (code, description) in ERROR_RESPONSES.items():
                    if str(status) in responses:
                        continue
                    responses[str(status)] = {
                        "description": f"{code} - {description}",
                        "content": {"application/json": {"schema": {
                            "allOf": [{"$ref": "#/components/schemas/ErrorEnvelope"}]
                        }}},
                    }
                operation["parameters"] = [
                    {"$ref": "#/components/parameters/RequestId"},
                    {"$ref": "#/components/parameters/ResponseTime"},
                ] + [p for p in operation.get("parameters", []) if p.get("name") != "RequestId"]
        document.setdefault("components", {})["schemas"]["ErrorEnvelope"] = envelope
        document["components"]["parameters"] = {
            "RequestId": {
                "name": "X-Request-Id", "in": "header", "required": False,
                "description": "Correlation id; echoed on the response. Generated when absent.",
                "schema": {"type": "string"},
            },
            "ResponseTime": {
                "name": "X-Response-Time-ms", "in": "header", "required": False,
                "description": "Server-side handler time in milliseconds.",
                "schema": {"type": "string"},
            },
        }
        document["components"]["securitySchemes"] = {
            "ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"}
        }
        document["security"] = [{"ApiKeyAuth": []}]
        return document

    return custom


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ECDAT - Enterprise Cryptographic Discovery & Analysis Tool",
        version=settings.version,
        description=(
            "Discovers cryptographic artefacts across source, binaries, containers, certificates and "
            "configuration; scores classical and quantum risk on separate tracks; applies Mosca's "
            "inequality; recommends purpose-aware PQC migrations; and emits a signed CycloneDX CBOM "
            "plus a forensic dossier.\n\n"
            "**Not detected is not quantum-safe** - every response carries a coverage index."
        ),
        lifespan=lifespan,
        openapi_tags=[
            {"name": "scans", "description": "Workspaces, scans, coverage ledger, diffing"},
            {"name": "analysis", "description": "Findings, risk, Mosca simulation, migration queue"},
            {"name": "evidence", "description": "CBOM / SARIF / report exports and attestation"},
            {"name": "meta", "description": "Health, metrics, registry"},
        ],
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # One error envelope for the whole API. Declaring it here means the contract
    # in /docs shows the exact failure shape on every operation, so the frontend
    # never has to guess a status code.
    app.openapi = _openapi_with_error_envelope(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:16]
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            routes_meta.bump("errors")
            raise
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-Id"] = request.state.request_id
        response.headers["X-Response-Time-ms"] = f"{elapsed_ms:.1f}"
        routes_meta.bump("requests")
        logger.info(json_line("http_access", method=request.method, path=request.url.path,
                              status=response.status_code, ms=round(elapsed_ms, 1),
                              request_id=request.state.request_id))
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        routes_meta.bump("errors")
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(exc.code, exc.message, exc.details,
                                   getattr(request.state, "request_id", "")),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        routes_meta.bump("errors")
        return JSONResponse(
            status_code=422,
            content=_error_payload("INVALID_INPUT", "request body failed validation",
                                   {"errors": [{"loc": list(e.get("loc", [])), "msg": e.get("msg")}
                                               for e in exc.errors()][:20]},
                                   getattr(request.state, "request_id", "")),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        code = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 429: "RATE_LIMITED"}.get(
            exc.status_code, "HTTP_ERROR")
        return JSONResponse(status_code=exc.status_code,
                            content=_error_payload(code, str(exc.detail), {},
                                                   getattr(request.state, "request_id", "")),
                            headers=getattr(exc, "headers", None) or {})

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        routes_meta.bump("errors")
        logger.exception("unhandled error request_id=%s", getattr(request.state, "request_id", "?"))
        return JSONResponse(status_code=500,
                            content=_error_payload("INTERNAL_ERROR", "internal error",
                                                   {"type": type(exc).__name__},
                                                   getattr(request.state, "request_id", "")))

    app.include_router(routes_meta.router)
    app.include_router(routes_scans.router)
    app.include_router(routes_analysis.router)
    app.include_router(routes_evidence.router)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {
            "service": settings.app_name,
            "docs": "/docs",
            "openapi": "/openapi.json",
            "health": "/api/v1/health",
            "auth": "X-API-Key header (see ECDAT_API_KEYS)",
        }

    return app


def json_line(event: str, **fields: Any) -> str:
    import json

    return json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                       "event": event, **fields}, default=str)


app = create_app()
