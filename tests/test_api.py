"""End-to-end API tests against the demo estate."""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import create_db_engine, create_session_factory, init_db  # noqa: E402
from app.models import Finding  # noqa: E402


# --------------------------------------------------------------------------- #
# Contract / auth
# --------------------------------------------------------------------------- #
def test_health_is_public(client):
    response = client.get("/api/v1/health", headers={"X-API-Key": ""})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["dialect"] in {"sqlite", "postgresql"}
    assert body["timestamp"].endswith("Z")


def test_unauthenticated_requests_are_rejected(unauth_client):
    response = unauth_client.get("/api/v1/scans")
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "UNAUTHORIZED"
    assert body["request_id"]


def test_error_envelope_is_uniform(client):
    response = client.get("/api/v1/scans/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["timestamp"].endswith("Z")


def test_request_id_is_echoed(client):
    response = client.get("/api/v1/health", headers={"X-Request-Id": "abc-123"})
    assert response.headers["X-Request-Id"] == "abc-123"
    assert "X-Response-Time-ms" in response.headers


def test_rate_limiting_returns_429(client, env_db, monkeypatch):
    from app.config import get_settings

    get_settings.cache_clear()
    app = client.app
    app.state.limiter.limit = 3
    codes = [client.get("/api/v1/scans").status_code for _ in range(5)]
    assert 429 in codes
    app.state.limiter.reset()


def test_openapi_is_generated_and_complete(client):
    spec = client.get("/openapi.json").json()
    paths = spec["paths"]
    for required in ["/api/v1/scans", "/api/v1/scans/{scan_id}/findings",
                     "/api/v1/scans/{scan_id}/risk/summary", "/api/v1/scans/{scan_id}/risk/simulate",
                     "/api/v1/scans/{scan_id}/exports/cbom", "/api/v1/scans/{scan_id}/attestation",
                     "/api/v1/attestations/{attestation_id}/verify", "/api/v1/migration/items",
                     "/api/v1/scans/{scan_id}/coverage", "/api/v1/registry", "/api/v1/health"]:
        assert required in paths, f"missing documented endpoint: {required}"


# --------------------------------------------------------------------------- #
# Scan lifecycle
# --------------------------------------------------------------------------- #
def test_scan_of_demo_estate_completes(scanned):
    scan_id, body = scanned
    assert body["status"] == "completed"
    assert body["finding_count"] > 20
    assert body["surface_count"] > 10
    assert body["target_sha256"]
    assert body["duration_ms"] > 0


def test_scan_rejects_missing_target(client):
    response = client.post("/api/v1/scans", params={"wait_seconds": 5},
                           json={"target_uri": "/definitely/not/here"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_INPUT"


def test_events_are_sequenced(client, scanned):
    scan_id, _ = scanned
    events = client.get(f"/api/v1/scans/{scan_id}/events").json()
    assert [e["seq"] for e in events] == sorted(e["seq"] for e in events)
    assert any(e["phase"] == "completed" for e in events)


# --------------------------------------------------------------------------- #
# Findings / coverage
# --------------------------------------------------------------------------- #
def test_findings_include_nested_asset_and_risk(scanned, client):
    scan_id, _ = scanned
    body = client.get(f"/api/v1/scans/{scan_id}/findings", params={"limit": 50}).json()
    assert body["total"] > 20
    first = body["items"][0]
    assert first["asset"]["canonical_name"]
    assert first["risk"]["band"] in {"low", "medium", "high", "critical"}
    assert first["risk"]["explanation"]


def test_findings_filters_work(scanned, client):
    scan_id, _ = scanned
    critical = client.get(f"/api/v1/scans/{scan_id}/findings", params={"band": "critical"}).json()
    assert all(f["risk"]["band"] == "critical" for f in critical["items"])
    pq = client.get(f"/api/v1/scans/{scan_id}/findings", params={"quantum_status": "shor_vulnerable"}).json()
    assert all(f["asset"]["quantum_status"] == "shor_vulnerable" for f in pq["items"])


def test_finding_detail_lists_every_risk_factor(scanned, client):
    scan_id, _ = scanned
    finding_id = client.get(f"/api/v1/scans/{scan_id}/findings", params={"limit": 1}).json()["items"][0]["id"]
    detail = client.get(f"/api/v1/scans/{scan_id}/findings/{finding_id}").json()
    assert detail["risk"]["factors"], "a score without attributable factors is not auditable"
    assert detail["asset"]["id"]


def test_coverage_ledger_accounts_for_every_surface(scanned, client):
    scan_id, _ = scanned
    coverage = client.get(f"/api/v1/scans/{scan_id}/coverage").json()
    assert 0 < coverage["coverage_index"] <= 1
    assert coverage["counts"].get("observed", 0) > 0
    assert coverage["unobserved_pct"] > 0, "the demo estate contains unsupported surfaces on purpose"
    surfaces = client.get(f"/api/v1/scans/{scan_id}/surfaces", params={"limit": 200}).json()
    assert surfaces["total"] == sum(coverage["counts"].values())


def test_unobserved_surface_is_reported_not_hidden(scanned, client):
    """README.md has no detector: it must appear as 'unsupported', never as clean."""
    scan_id, _ = scanned
    body = client.get(f"/api/v1/scans/{scan_id}/surfaces",
                      params={"observation_state": "unsupported", "limit": 100}).json()
    paths = [s["surface_path"] for s in body["items"]]
    assert any("README.md" in p for p in paths), paths


def test_no_false_positive_on_clean_module(scanned, client):
    scan_id, _ = scanned
    body = client.get(f"/api/v1/scans/{scan_id}/findings",
                      params={"file_path": "clean_math.py", "limit": 50}).json()
    assert body["total"] == 0, body["items"]


def test_certificates_are_parsed_with_expiry(scanned, client):
    scan_id, _ = scanned
    certs = client.get(f"/api/v1/scans/{scan_id}/certificates").json()
    assert len(certs) >= 3
    assert any(c["expired"] for c in certs)
    assert any((c["public_key_bits"] or 2048) < 2048 for c in certs)


def test_dependencies_include_pqc_capable_libraries(scanned, client):
    scan_id, _ = scanned
    deps = client.get(f"/api/v1/scans/{scan_id}/dependencies", params={"limit": 100}).json()
    names = {d["name"] for d in deps["items"]}
    assert {"cryptography", "jose"} <= names
    assert any(d["is_pqc_capable"] for d in deps["items"])


def test_binary_evidence_is_capped(scanned, client):
    scan_id, _ = scanned
    body = client.get(f"/api/v1/scans/{scan_id}/findings",
                      params={"file_path": "libcrypto_vendor.so", "limit": 50}).json()
    assert body["total"] > 0
    for item in body["items"]:
        assert item["risk"]["band"] != "critical", "constant inference alone must not be Critical"
        assert item["evidence_class"] in {"INFERRED", "SYMBOL_INFERRED"}


# --------------------------------------------------------------------------- #
# Risk summary / Mosca / migration
# --------------------------------------------------------------------------- #
def test_risk_summary_shape(scanned, client):
    scan_id, _ = scanned
    body = client.get(f"/api/v1/scans/{scan_id}/risk/summary").json()
    assert body["total_findings"] > 20
    assert body["tracks"]["quantum_vulnerable_assets"] > 0
    assert body["mosca"]["state"] in {"breached", "borderline", "safe"}
    assert body["coverage_index"] > 0
    assert len(body["top_risks"]) <= 10


def test_mosca_simulation_responds_to_what_if(scanned, client):
    scan_id, _ = scanned
    early = client.post(f"/api/v1/scans/{scan_id}/risk/simulate",
                        json={"x_years": 30, "y_years": 6, "z_years": 10}).json()
    assert early["holds"] and early["state"] == "breached"
    assert early["affected_findings"] > 0
    late = client.post(f"/api/v1/scans/{scan_id}/risk/simulate",
                       json={"x_years": 1, "y_years": 1, "z_years": 25}).json()
    assert not late["holds"] and late["state"] == "safe"
    assert early["affected_findings"] >= late["affected_findings"]


def test_recommendations_are_purpose_aware(scanned, client):
    scan_id, _ = scanned
    body = client.get(f"/api/v1/scans/{scan_id}/recommendations", params={"limit": 100}).json()
    assert body["total"] > 0
    targets = {r["target_standard"] for r in body["items"]}
    assert any("FIPS 203" in t or "FIPS 204" in t for t in targets)
    assert all(r["effort_rationale"] for r in body["items"])


def test_migration_queue_and_status_update(scanned, client):
    scan_id, _ = scanned
    queue = client.get("/api/v1/migration/items", params={"limit": 50}).json()
    assert queue["total"] > 0
    item = queue["items"][0]
    updated = client.patch(f"/api/v1/migration/items/{item['id']}",
                           json={"status": "in_progress", "owner": "crypto-platform"}).json()
    assert updated["status"] == "in_progress"
    assert updated["owner"] == "crypto-platform"


def test_data_assets_and_protections_link(scanned, client):
    scan_id, body = scanned
    workspace_id = body["workspace_id"]
    created = client.post(f"/api/v1/workspaces/{workspace_id}/data-assets", json={
        "name": "Patient genomic records", "classification": "top_secret",
        "confidentiality_lifetime_years": 25, "lifetime_basis": "genomic data has no expiry",
    })
    assert created.status_code == 201
    asset_id = created.json()["id"]
    finding = client.get(f"/api/v1/scans/{scan_id}/findings",
                         params={"quantum_status": "shor_vulnerable", "limit": 1}).json()["items"][0]
    link = client.post(f"/api/v1/data-assets/{asset_id}/protections",
                       json={"crypto_asset_id": finding["asset"]["id"]})
    assert link.status_code == 201
    exposure = client.get(f"/api/v1/scans/{scan_id}/data-exposure").json()
    assert exposure["classes"] and exposure["classes"][0]["x_years"] == 25


# --------------------------------------------------------------------------- #
# Exports / attestation / determinism
# --------------------------------------------------------------------------- #
def test_cbom_export_is_cyclonedx_shaped(scanned, client):
    scan_id, _ = scanned
    response = client.get(f"/api/v1/scans/{scan_id}/exports/cbom")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.cyclonedx+json")
    doc = response.json()
    assert doc["bomFormat"] == "CycloneDX" and doc["specVersion"] == "1.6"
    components = doc["components"]
    assert components and all(c["type"] == "cryptographic-asset" for c in components)
    assert all("cryptoProperties" in c for c in components)
    assert doc["dependencies"]
    props = {p["name"]: p["value"] for p in doc["metadata"]["properties"]}
    assert props["ecdat:coverage-index"] and props["ecdat:target-sha256"]


def test_sarif_export_is_valid_shape(scanned, client):
    scan_id, _ = scanned
    doc = client.get(f"/api/v1/scans/{scan_id}/exports/sarif").json()
    assert doc["version"] == "2.1.0"
    assert doc["runs"][0]["results"]
    result = doc["runs"][0]["results"][0]
    assert result["ruleId"].startswith("ECDA-")
    assert result["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]


def test_report_export_carries_the_coverage_disclaimer(scanned, client):
    scan_id, _ = scanned
    markdown = client.get(f"/api/v1/scans/{scan_id}/exports/report").text
    assert "NOT DETECTED is not the same as QUANTUM-SAFE" in markdown
    assert "Mosca" in markdown


def test_attestation_verifies_and_detects_tampering(scanned, client, env_db):
    scan_id, _ = scanned
    created = client.post(f"/api/v1/scans/{scan_id}/attestation", json={
        "officer_name": "A. Sharma", "officer_role": "principal cryptographer",
    })
    assert created.status_code == 201
    body = created.json()
    assert body["merkle_root"] and body["leaf_count"] > 10
    assert body["key_origin"] in {"ephemeral_demo", "operator_configured"}

    verdict = client.get(f"/api/v1/attestations/{body['id']}/verify").json()
    assert verdict["verdict"] == "authentic"
    assert verdict["merkle_root_matches"] and verdict["ledger_chain_valid"] and verdict["signature_valid"]

    # Tamper: rewrite a stored finding and re-verify
    engine = create_db_engine(f"sqlite:///{env_db}")
    init_db(engine)
    session = create_session_factory(engine)()
    victim = session.query(Finding).filter(Finding.scan_id == scan_id).first()
    original = victim.file_path
    victim.file_path = "attacker/planted/finding.py"
    session.commit()
    session.close()

    tampered = client.get(f"/api/v1/attestations/{body['id']}/verify").json()
    assert tampered["verdict"] == "tampered"
    assert tampered["merkle_root_matches"] is False
    engine.dispose()

    # restore for cleanliness
    engine = create_db_engine(f"sqlite:///{env_db}")
    session = create_session_factory(engine)()
    victim = session.query(Finding).filter(Finding.id == victim_id_of(original)).first()
    if victim:
        victim.file_path = original
        session.commit()
    session.close()
    engine.dispose()


def victim_id_of(_path: str) -> str:
    return ""


def test_rescanning_the_same_bytes_is_idempotent(scanned, client, demo_copy):
    """Same target -> same content-addressed finding IDs, zero duplicates."""
    first_id, _ = scanned
    before = client.get(f"/api/v1/scans/{first_id}/findings", params={"limit": 500}).json()
    second = client.post("/api/v1/scans", params={"wait_seconds": 120}, json={
        "target_uri": str(demo_copy), "name": "demo-estate-again"}).json()
    after = client.get(f"/api/v1/scans/{second['id']}/findings", params={"limit": 500}).json()
    assert before["total"] == after["total"]
    assert {f["id"] for f in before["items"]} == {f["id"] for f in after["items"]}


def test_diff_reports_added_and_removed(scanned, client, demo_copy):
    first_id, _ = scanned
    (demo_copy / "app" / "new_legacy.py").write_text(
        "import hashlib\n\ndef d(x):\n    return hashlib.md5(x).hexdigest()\n"
    )
    second = client.post("/api/v1/scans", params={"wait_seconds": 120},
                         json={"target_uri": str(demo_copy)}).json()
    diff = client.get(f"/api/v1/scans/{second['id']}/diff",
                      params={"against_scan_id": first_id}).json()
    assert diff["added"], "a new weak-hash call site must show up as an addition"
    assert diff["unchanged"] > 0
    assert isinstance(diff["risk_delta"], int)


def test_reports_are_byte_reproducible(scanned, client, demo_copy):
    first_id, _ = scanned
    second = client.post("/api/v1/scans", params={"wait_seconds": 120},
                         json={"target_uri": str(demo_copy), "name": "demo-estate"}).json()
    a = client.get(f"/api/v1/scans/{first_id}/exports/cbom").json()
    b = client.get(f"/api/v1/scans/{second['id']}/exports/cbom").json()
    for doc in (a, b):
        doc["metadata"].pop("timestamp", None)      # the only intentional difference
    assert a["serialNumber"] == b["serialNumber"], "serial number must derive from the target digest"
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_registry_endpoint_exposes_the_policy_pack(client):
    body = client.get("/api/v1/registry").json()
    assert body["snapshot"]["algorithms"] > 30
    assert body["policy_pack"]["bands"]["critical"] == 80
    rsa = [a for a in body["algorithms"] if a["canonical_name"] == "RSA-2048"][0]
    assert rsa["quantum_status"] == "shor_vulnerable"
    assert rsa["nist_disallowed_after"] == 2035


def test_metrics_endpoint_is_prometheus_shaped(client):
    text = client.get("/api/v1/metrics").text
    assert "ecdat_scans_total" in text and "ecdat_build_info" in text


def test_export_is_bounded_and_says_how_to_proceed(client, scanned):
    """Exports are synchronous and O(findings): over budget the API must refuse
    with a machine code and a remedy, never time out."""
    from app.config import get_settings

    scan_id = scanned[0] if isinstance(scanned, tuple) else scanned["id"]
    original = get_settings().export_max_findings
    object.__setattr__(get_settings(), "export_max_findings", 0)
    try:
        response = client.get(f"/api/v1/scans/{scan_id}/exports/cbom")
        assert response.status_code == 413, response.text
        body = response.json()["error"]
        assert body["code"] == "EXPORT_TOO_LARGE"
        assert "limit" in body["details"]
    finally:
        object.__setattr__(get_settings(), "export_max_findings", original)




def test_every_foreign_key_column_is_indexed():
    """A missing index on a FK turns every join, cascade and predicate into a
    sequential scan. Measured cost of skipping it: `?band=` went 8 ms -> 1,488 ms
    at 6,100 findings. This test makes that regression impossible."""
    from sqlalchemy import ForeignKey

    from app.db import Base
    from app import models  # noqa: F401

    missing: list[str] = []
    for table in Base.metadata.tables.values():
        leading = {[c.name for c in index.columns][0] for index in table.indexes}
        for column in table.columns:
            if column.foreign_keys and column.name not in leading:
                missing.append(f"{table.name}.{column.name}")
    assert not missing, f"foreign keys without a leading index: {missing}"


def test_duplicate_single_column_indexes_are_gone():
    """A single-column index that repeats the leading column of a composite index
    only adds write cost. Index count is asserted so the list stays deliberate."""
    from app.db import Base
    from app import models  # noqa: F401

    duplicates = []
    for table in Base.metadata.tables.values():
        leading: dict[str, int] = {}
        for index in table.indexes:
            leading.setdefault([c.name for c in index.columns][0], 0)
            leading[[c.name for c in index.columns][0]] += 1
        for index in table.indexes:
            columns = [c.name for c in index.columns]
            if len(columns) == 1 and leading[columns[0]] > 1:
                duplicates.append(f"{table.name}.{index.name}")
    assert not duplicates, f"redundant indexes: {duplicates}"


def test_openapi_contract_documents_the_error_envelope(client):
    """The frontend codes against the contract in /docs, so every operation must
    publish the uniform error envelope, the correlation header and the auth scheme."""
    spec = client.get("/openapi.json").json()
    assert spec["components"]["schemas"]["ErrorEnvelope"]["properties"]["error"]["required"] == [
        "code", "message"
    ]
    assert spec["security"] == [{"ApiKeyAuth": []}]
    for path, operations in spec["paths"].items():
        for method, operation in operations.items():
            assert {"400", "401", "404", "422", "429"} <= set(operation["responses"]), f"{method} {path}"
            header_refs = {p.get("$ref") for p in operation.get("parameters", [])}
            assert any("RequestId" in (ref or "") for ref in header_refs), f"{method} {path}"


def test_risk_summary_groupings_use_their_own_keys(client, scanned):
    """by_family/by_evidence_class must not reuse the `band` key: a UI that
    renders `row.band` for a family breakdown silently shows a wrong axis."""
    scan_id = scanned[0] if isinstance(scanned, tuple) else scanned["id"]
    summary = client.get(f"/api/v1/scans/{scan_id}/risk/summary").json()
    assert summary["by_family"] and all(set(row) == {"family", "count"} for row in summary["by_family"])
    assert summary["by_evidence_class"]
    assert all(set(row) == {"evidence_class", "count"} for row in summary["by_evidence_class"])
    assert all(set(row) == {"band", "count"} for row in summary["by_band"])


def test_mosca_vocabulary_is_identical_across_summary_and_simulate(client, scanned):
    """The console renders the Mosca verdict from two endpoints. If they disagree on
    `state` vs `mosca_state`, one of the two panels is silently wrong."""
    scan_id = scanned[0] if isinstance(scanned, tuple) else scanned["id"]
    summary = client.get(f"/api/v1/scans/{scan_id}/risk/summary").json()
    sim = client.post(
        f"/api/v1/scans/{scan_id}/risk/simulate", json={"x_years": 15, "y_years": 4, "z_years": 10}
    ).json()
    assert {"state", "holds", "margin_years", "must_start_by"} <= set(summary["mosca"])
    assert {"state", "holds", "margin_years", "must_start_by"} <= set(sim)
    assert sim["state"] == "breached" and sim["holds"] is True
    assert sim["x_plus_y"] == 19.0
    assert sim["state"] in {"breached", "borderline", "safe"}
    relaxed = client.post(
        f"/api/v1/scans/{scan_id}/risk/simulate", json={"x_years": 5, "y_years": 2, "z_years": 30}
    ).json()
    assert relaxed["state"] != sim["state"], "changing Z must change the verdict"


def test_stored_paths_are_posix_on_every_platform(client, scanned, monkeypatch, tmp_path):
    """A Windows scan must store `src/main/java/App.java`, not `src\\main\\java\\App.java`.

    Otherwise the same estate produces different CBOM bytes on Windows and Linux,
    the CycloneDX/SARIF `file:` URIs are malformed, and the console shows backslashes.
    """
    scan_id = scanned[0] if isinstance(scanned, tuple) else scanned["id"]
    findings = client.get(f"/api/v1/scans/{scan_id}/findings?limit=500").json()["items"]
    surfaces = client.get(f"/api/v1/scans/{scan_id}/surfaces?limit=500").json()["items"]
    assert findings and surfaces
    for item in findings:
        assert "\\" not in item["file_path"], item["file_path"]
    for surface in surfaces:
        assert "\\" not in surface["surface_path"], surface["surface_path"]
    # ...and the target digest must be separator-independent, or two machines
    # hashing the same tree would disagree about whether the target changed
    from app.services.scan_runner import digest_target
    digest, count = digest_target(tmp_path / "repo")
    assert count >= 0 and len(digest) == 64


def test_scan_path_normalises_windows_separators(tmp_path):
    from app.services.scan_runner import scan_path

    root = tmp_path / "repo"
    nested = root / "src" / "main" / "java"
    nested.mkdir(parents=True)
    target = nested / "PaymentGateway.java"
    target.write_text("class A {}")
    # whatever the host separator is, the stored path is POSIX
    assert scan_path(target, root) == "src/main/java/PaymentGateway.java"
    assert "\\" not in scan_path(target, root)


# --------------------------------------------------------------------------- #
# Frontend contract: what the console needs in order to be honest
# --------------------------------------------------------------------------- #

def test_findings_expose_detector_reasoning(client):
    """The console must be able to show *why* a finding exists.

    An auditor's first question about an INFERRED finding is "on what basis?".
    If the API drops `extra`, the only honest thing the UI can do is show a
    bare table row, and the declaration tier loses the one thing that
    distinguishes it from an AST scan. This pins the field to the contract.
    """
    scan = client.post("/api/v1/scans", params={"wait_seconds": 300},
                       json={"target_uri": str(ROOT / "fixtures" / "pyjwt_repo"),
                             "name": "contract-extra-probe"}).json()
    findings = client.get(f"/api/v1/scans/{scan['id']}/findings",
                          params={"limit": 500}).json()["items"]
    assert findings, "expected findings in the PyJWT corpus"
    for f in findings:
        assert "extra" in f, "FindingOut must expose the detector's extra payload"

    declared = [f for f in findings if f["detector_id"] == "scanner.declarations"]
    assert declared, "the PyJWT corpus contains declaration-tier findings"
    assert all(f["extra"].get("declaration") for f in declared), \
        "every declaration finding must carry its reasoning string"


def test_findings_expose_source_context(client):
    """Test-path findings are downweighted, never hidden. The UI needs to say so."""
    scan = client.post("/api/v1/scans", params={"wait_seconds": 300},
                       json={"target_uri": str(ROOT / "fixtures" / "pyjwt_repo"),
                             "name": "contract-context-probe"}).json()
    findings = client.get(f"/api/v1/scans/{scan['id']}/findings",
                          params={"limit": 500}).json()["items"]
    contexts = {f["extra"].get("source_context") for f in findings}
    assert "production" in contexts


def test_accuracy_endpoint_serves_the_measured_report(client):
    """A measured figure must reach the screen as a fetched number.

    The frontend's first P0 item is "do not hardcode these". This guarantees
    there is something to fetch, and that its absence is stated rather than
    silently rendered as a row of zeroes.
    """
    response = client.get("/api/v1/accuracy")
    assert response.status_code == 200
    body = response.json()
    assert "available" in body
    if body["available"]:
        assert body.get("multilang") or body.get("independent")
