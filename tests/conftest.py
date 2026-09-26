"""Shared pytest fixtures: isolated database + a fully wired app client."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("ECDAT_API_KEYS", "test-key")
os.environ.setdefault("ECDAT_SCAN_WORKERS", "2")


@pytest.fixture(scope="session")
def demo_repo() -> Path:
    return ROOT / "fixtures" / "demo_repo"


@pytest.fixture()
def demo_copy(tmp_path) -> Path:
    """A private writable copy of the demo estate, isolated per test."""
    dest = tmp_path
    target = dest / "demo_repo"
    shutil.copytree(ROOT / "fixtures" / "demo_repo", target)
    return target


@pytest.fixture()
def env_db(tmp_path, monkeypatch):
    db_path = tmp_path / "ecdat-test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("ECDAT_API_KEYS", "test-key")
    monkeypatch.setenv("ECDAT_ALLOW_LIVE_PROBE", "false")
    from app.config import get_settings

    get_settings.cache_clear()
    yield db_path
    get_settings.cache_clear()


@pytest.fixture()
def client(env_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    application = create_app()
    with TestClient(application) as test_client:
        test_client.headers.update({"X-API-Key": "test-key"})
        test_client.ecdat_engine = application.state.engine
        yield test_client


@pytest.fixture()
def unauth_client(env_db):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture()
def scanned(client, demo_copy):
    """A completed scan of the demo estate, returned as (scan_id, response)."""
    response = client.post(
        "/api/v1/scans",
        params={"wait_seconds": 120},
        json={
            "target_uri": str(demo_copy),
            "name": "demo-estate",
            "context": {
                "exposure": "internet_facing",
                "criticality": "sovereign_critical",
                "classification": "confidential",
                "data_lifetime_years": 15,
            },
            "mosca": {"scenario": "baseline"},
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "completed", body
    return body["id"], body
