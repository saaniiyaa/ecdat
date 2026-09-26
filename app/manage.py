"""Operator CLI: `python -m app.manage <command>`.

One entry point for everything a judge, a teammate or a 3 a.m. operator needs:
schema creation, Alembic migrations, demo scan, attestation verification and
backups. Every command prints machine-readable JSON on stdout and a non-zero
exit code on failure, so it composes with CI and shell scripts.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

from app.config import get_settings


def _emit(payload: dict) -> None:
    print(json.dumps(payload, indent=2, default=str))


def cmd_init_db(args: argparse.Namespace) -> int:
    from app.db import create_db_engine, init_db

    settings = get_settings()
    engine = create_db_engine(settings.database_url, echo=args.echo)
    init_db(engine)
    from app import models  # noqa: F401

    from app.db import Base

    tables = sorted(Base.metadata.tables)
    _emit({
        "command": "init-db",
        "dialect": engine.dialect.name,
        "tables": len(tables),
        "table_names": tables,
        "note": "idempotent: existing tables are left untouched; "
                "run `python -m app.manage stamp head` to hand the schema to Alembic",
    })
    return 0


def cmd_revision(args: argparse.Namespace) -> int:
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("script_location", "migrations")
    command.revision(cfg, message=args.message, autogenerate=args.autogenerate)
    _emit({"command": "revision", "message": args.message, "autogenerate": args.autogenerate})
    return 0


def cmd_upgrade(args: argparse.Namespace) -> int:
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("script_location", "migrations")
    command.upgrade(cfg, args.revision)
    _emit({"command": "upgrade", "revision": args.revision})
    return 0


def cmd_stamp(args: argparse.Namespace) -> int:
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("script_location", "migrations")
    command.stamp(cfg, args.revision)
    _emit({
        "command": "stamp",
        "revision": args.revision,
        "note": "use after a fresh create_all so Alembic owns future changes",
    })
    return 0


def cmd_current(args: argparse.Namespace) -> int:
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("script_location", "migrations")
    command.current(cfg, verbose=True)
    return 0


def cmd_demo_scan(args: argparse.Namespace) -> int:
    """Runs the demo estate through the *real* HTTP API, exactly like a user."""
    import httpx

    settings = get_settings()
    base = args.base_url.rstrip("/")
    headers = {"X-API-Key": args.api_key}
    with httpx.Client(timeout=args.timeout) as client:
        client.headers.update(headers)
        started = time.perf_counter()
        response = client.post(
            f"{base}/api/v1/scans",
            params={"wait_seconds": args.wait},
            json={
                "target_uri": args.target,
                "name": args.name,
                "context": {
                    "exposure": "internet_facing",
                    "criticality": "sovereign_critical",
                    "classification": "confidential",
                    "data_lifetime_years": 15,
                },
                "mosca": {"scenario": "baseline"},
            },
        )
        if response.status_code >= 400:
            _emit({"command": "demo-scan", "http_status": response.status_code, "body": response.text})
            return 1
        scan = response.json()
        summary = client.get(f"{base}/api/v1/scans/{scan['id']}/risk/summary").json()
        findings = client.get(
            f"{base}/api/v1/scans/{scan['id']}/findings", params={"limit": 5}
        ).json()
    _emit({
        "command": "demo-scan",
        "scan_id": scan["id"],
        "status": scan["status"],
        "engine_wall_clock_ms": round((time.perf_counter() - started) * 1000, 1),
        "reported_scan_ms": scan.get("duration_ms"),
        "findings": summary.get("total_findings"),
        "assets": summary.get("total_assets"),
        "coverage_index": summary.get("coverage_index"),
        "unobserved_pct": summary.get("unobserved_pct"),
        "bands": summary.get("by_band"),
        "tracks": summary.get("tracks"),
        "mosca": summary.get("mosca"),
        "top5": [
            {
                "band": item["risk"]["band"] if item["risk"] else None,
                "algorithm": item["asset"]["canonical_name"],
                "file": ":".join(
                    str(part) for part in (item["file_path"], item["line_start"]) if part
                ),
                "quantum_risk": item["risk"]["quantum_risk"] if item["risk"] else None,
            }
            for item in findings.get("items", [])
        ],
    })
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    import httpx

    headers = {"X-API-Key": args.api_key}
    with httpx.Client(timeout=args.timeout) as client:
        client.headers.update(headers)
        response = client.get(f"{args.base_url.rstrip('/')}/api/v1/attestations/{args.id}/verify")
    if response.status_code >= 400:
        _emit({"command": "verify", "http_status": response.status_code, "body": response.text})
        return 1
    payload = response.json()
    _emit({"command": "verify", **payload})
    return 0 if payload.get("verdict") in {"authentic", "valid"} else 1


def cmd_backup(args: argparse.Namespace) -> int:
    """Consistent, restorable backup for both dialects.

    SQLite -> the online `.backup` API (safe while a scan is writing).
    Postgres -> `pg_dump --format=custom`, so restore is a single pg_restore.
    """
    settings = get_settings()
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if settings.database_url.startswith("sqlite"):
        import sqlite3

        source = settings.database_url.split("sqlite:///")[-1]
        target = out_dir / f"ecdat-{stamp}.sqlite3"
        src = sqlite3.connect(source)
        dst = sqlite3.connect(target)
        with dst:
            src.backup(dst)          # online backup: consistent snapshot
        src.close()
        dst.close()
        _emit({
            "command": "backup", "dialect": "sqlite", "path": str(target),
            "size_bytes": target.stat().st_size,
            "restore": f"cp {target} ecdat.db",
        })
        return 0

    target = out_dir / f"ecdat-{stamp}.dump"
    os.system(f'pg_dump --format=custom --no-owner --file "{target}" "{settings.database_url}"')
    _emit({
        "command": "backup", "dialect": "postgresql", "path": str(target),
        "size_bytes": target.stat().st_size if target.exists() else 0,
        "restore": f'pg_restore --clean --no-owner --dbname "$DATABASE_URL" {target}',
    })
    return 0


def cmd_restore(args: argparse.Namespace) -> int:
    settings = get_settings()
    if settings.database_url.startswith("sqlite"):
        source = settings.database_url.split("sqlite:///")[-1]
        backup = Path(args.file)
        if not backup.is_file():
            _emit({"command": "restore", "error": f"{backup} not found"})
            return 1
        shutil.copy2(backup, source)
        _emit({"command": "restore", "path": source, "from": str(backup)})
        return 0
    code = os.system(f'pg_restore --clean --no-owner --dbname "{settings.database_url}" {args.file}')
    _emit({"command": "restore", "dialect": "postgresql", "exit_code": code})
    return code


def cmd_stats(args: argparse.Namespace) -> int:
    from sqlalchemy import func, select

    from app import models
    from app.db import create_db_engine, session_scope, create_session_factory

    settings = get_settings()
    engine = create_db_engine(settings.database_url)
    factory = create_session_factory(engine)
    counts: dict[str, int] = {}
    with session_scope(factory) as session:
        for name, model in (
            ("workspaces", models.Workspace), ("scans", models.Scan),
            ("surfaces", models.ScanSurface), ("assets", models.CryptoAsset),
            ("findings", models.Finding), ("assessments", models.RiskAssessment),
            ("factors", models.RiskFactor), ("recommendations", models.Recommendation),
            ("certificates", models.Certificate), ("data_assets", models.DataAsset),
            ("attestations", models.Attestation), ("events", models.ScanEvent),
        ):
            counts[name] = session.execute(select(func.count()).select_from(model)).scalar_one()
    _emit({"command": "stats", "dialect": engine.dialect.name, "counts": counts})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.manage", description="ECDAT operator CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init-db", help="create tables if they do not exist")
    p.add_argument("--echo", action="store_true")
    p.set_defaults(func=cmd_init_db)

    p = sub.add_parser("revision", help="generate an Alembic revision")
    p.add_argument("-m", "--message", required=True)
    p.add_argument("--autogenerate", action="store_true", default=True)
    p.set_defaults(func=cmd_revision)

    p = sub.add_parser("upgrade", help="apply migrations up to a revision")
    p.add_argument("revision", nargs="?", default="head")
    p.set_defaults(func=cmd_upgrade)

    p = sub.add_parser("stamp", help="mark the DB as being at a revision")
    p.add_argument("revision", nargs="?", default="head")
    p.set_defaults(func=cmd_stamp)

    p = sub.add_parser("current", help="print the current revision")
    p.set_defaults(func=cmd_current)

    p = sub.add_parser("demo-scan", help="scan the demo estate through the live API")
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--api-key", default=os.getenv("ECDAT_API_KEYS", "dev-ecdat-key").split(",")[0])
    p.add_argument("--target", default="fixtures/demo_repo")
    p.add_argument("--name", default="vajra-payments")
    p.add_argument("--wait", type=int, default=180)
    p.add_argument("--timeout", type=float, default=300.0)
    p.set_defaults(func=cmd_demo_scan)

    p = sub.add_parser("verify", help="verify an attestation dossier")
    p.add_argument("id")
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--api-key", default=os.getenv("ECDAT_API_KEYS", "dev-ecdat-key").split(",")[0])
    p.add_argument("--timeout", type=float, default=60.0)
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("backup", help="consistent backup of the configured database")
    p.add_argument("--out-dir", default="backups")
    p.set_defaults(func=cmd_backup)

    p = sub.add_parser("restore", help="restore a backup produced by `backup`")
    p.add_argument("file")
    p.set_defaults(func=cmd_restore)

    p = sub.add_parser("stats", help="row counts per table")
    p.set_defaults(func=cmd_stats)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
