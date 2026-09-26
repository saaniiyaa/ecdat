"""Runtime configuration.

All tunables are environment-driven so the same image runs on a hackathon laptop
(SQLite, air-gapped) and on a cloud host (PostgreSQL) without code changes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

# A .env file next to the project root is loaded if present, so `cp .env.example .env`
# works on Linux, macOS *and* Windows (where `source .env` and `export` do not exist).
# Real environment variables always win over the file.
try:  # python-dotenv is a declared dependency; a missing install must not be fatal
    from dotenv import load_dotenv

    _ROOT = Path(__file__).resolve().parent.parent
    if (_ROOT / ".env").is_file():
        load_dotenv(_ROOT / ".env", override=False)
except Exception:  # pragma: no cover - dotenv is optional at runtime
    pass


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    try:
        return int(raw) if raw is not None else default
    except ValueError:
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "ECDAT Backend"
    env: str = "dev"
    version: str = "1.0.0"
    engine_version: str = "1.0.0"
    policy_pack_version: str = "pp-2026.09"

    # Persistence: SQLite URL for demo/laptop, PostgreSQL URL in production.
    database_url: str = "sqlite:///./ecdat.db"
    sql_echo: bool = False

    # Security
    api_keys: tuple[str, ...] = ("dev-ecdat-key",)
    rate_limit_rpm: int = 240
    cors_origins: tuple[str, ...] = ("*",)

    # Scan safety limits (zip-bomb / runaway-repo protection)
    max_upload_bytes: int = 512 * 1024 * 1024
    max_files: int = 50_000
    max_file_bytes: int = 8 * 1024 * 1024
    max_container_members: int = 20_000
    scan_workers: int = 4
    # Synchronous export guard. Measured: ~3 ms per finding to build a CBOM, so a
    # 6,100-finding scan takes ~19 s. Above this threshold the API refuses with a
    # clear, filterable error instead of timing out a gateway.
    export_max_findings: int = 5000

    # Network probing is OFF by default: the tool is static-first and air-gap safe.
    allow_live_probe: bool = False
    live_probe_hosts: tuple[str, ...] = ("127.0.0.1", "localhost", "::1")
    live_probe_timeout_s: float = 3.0

    excluded_dirs: tuple[str, ...] = (
        ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
        ".mypy_cache", ".pytest_cache", "target", "vendor", ".idea",
    )

    log_level: str = "INFO"
    extra: dict = field(default_factory=dict)

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("ECDAT_APP_NAME", "ECDAT Backend"),
        env=os.getenv("ECDAT_ENV", "dev"),
        version=os.getenv("ECDAT_VERSION", "1.0.0"),
        engine_version=os.getenv("ECDAT_ENGINE_VERSION", "1.0.0"),
        policy_pack_version=os.getenv("ECDAT_POLICY_PACK", "pp-2026.09"),
        database_url=os.getenv("DATABASE_URL", "sqlite:///./ecdat.db"),
        sql_echo=_env_bool("ECDAT_SQL_ECHO", False),
        api_keys=tuple(_env_list("ECDAT_API_KEYS", ["dev-ecdat-key"])),
        rate_limit_rpm=_env_int("ECDAT_RATE_LIMIT_RPM", 240),
        cors_origins=tuple(_env_list("ECDAT_CORS_ORIGINS", ["*"])),
        max_upload_bytes=_env_int("ECDAT_MAX_UPLOAD_BYTES", 512 * 1024 * 1024),
        max_files=_env_int("ECDAT_MAX_FILES", 50_000),
        max_file_bytes=_env_int("ECDAT_MAX_FILE_BYTES", 8 * 1024 * 1024),
        max_container_members=_env_int("ECDAT_MAX_CONTAINER_MEMBERS", 20_000),
        scan_workers=_env_int("ECDAT_SCAN_WORKERS", 4),
        export_max_findings=_env_int("ECDAT_EXPORT_MAX_FINDINGS", 5000),
        allow_live_probe=_env_bool("ECDAT_ALLOW_LIVE_PROBE", False),
        live_probe_hosts=tuple(_env_list("ECDAT_LIVE_PROBE_HOSTS", ["127.0.0.1", "localhost", "::1"])),
        live_probe_timeout_s=float(os.getenv("ECDAT_LIVE_PROBE_TIMEOUT_S", "3.0")),
        excluded_dirs=tuple(_env_list("ECDAT_EXCLUDED_DIRS", list(Settings.excluded_dirs))),
        log_level=os.getenv("ECDAT_LOG_LEVEL", "INFO"),
    )
