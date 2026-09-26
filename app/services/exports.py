"""Exports: CycloneDX CBOM (1.6/1.7), SARIF 2.1.0, Markdown report, findings CSV.

The CBOM is the interoperability contract with the rest of the world: CycloneDX
1.6 introduced the `cryptographic-asset` component type and `cryptoProperties`
(ECMA-424), and 1.7 added the algorithm registry/family objects. We emit 1.6 by
default (widest consumer support) and can emit 1.7, and the document is built
from the database only, so the exported file is byte-reproducible.
"""

from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any, Iterable

CYCLONEDX_NS = "http://cyclonedx.org/schema/bom/1.6"


def _iso(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("+00:00", "Z")


def _crypto_properties(asset: Any, finding: Any | None, risk: Any | None) -> dict[str, Any]:
    props: dict[str, Any] = {"assetType": asset.asset_type or "algorithm"}
    if asset.asset_type == "algorithm":
        alg: dict[str, Any] = {
            "primitive": _primitive(asset.primitive),
            "executionEnvironment": "software-plain-ram",
            "implementationPlatform": "x86_64",
            "cryptoFunctions": [asset.purpose or "unknown"],
            "classicalSecurityLevel": int(asset.classical_security_bits or 0),
            "nistQuantumSecurityLevel": int(asset.quantum_security_bits or 0),
        }
        if asset.parameter_set:
            alg["parameterSetIdentifier"] = asset.parameter_set
        if asset.curve:
            alg["curve"] = asset.curve
        if asset.mode:
            alg["mode"] = asset.mode
        if asset.padding:
            alg["padding"] = asset.padding
        props["algorithmProperties"] = alg
    if asset.asset_type == "certificate" and finding is not None and (finding.extra or {}).get("certificate"):
        cert = finding.extra["certificate"]
        props["certificateProperties"] = {
            "subjectName": cert.get("subject", "")[:255],
            "issuerName": cert.get("issuer", "")[:255],
            "notValidBefore": _iso(cert.get("not_before")),
            "notValidAfter": _iso(cert.get("not_after")),
            "signatureAlgorithmRef": cert.get("signature_algorithm", ""),
        }
    if asset.oid:
        props["oid"] = asset.oid
    return props


_PRIMITIVE_MAP = {
    "block-cipher": "ae", "stream-cipher": "ae", "hash": "hash", "mac": "mac",
    "signature": "signature", "digital-signature": "signature", "key-agreement": "key-agreement",
    "kem": "kem", "key-encapsulation": "kem", "kdf": "kdf", "certificate": "certificate",
    "key": "key", "library": "other", "protocol": "protocol",
}


def _primitive(primitive: str | None) -> str:
    return _PRIMITIVE_MAP.get((primitive or "unknown").lower(), "other")


def build_cbom(
    *,
    scan: Any,
    assets: Iterable[Any],
    findings: Iterable[Any],
    coverage: dict[str, Any],
    spec_version: str = "1.6",
    serial_number: str | None = None,
) -> dict[str, Any]:
    findings = list(findings)
    assets = {a.id: a for a in assets}
    by_asset: dict[str, list[Any]] = {}
    for f in findings:
        by_asset.setdefault(f.asset_id, []).append(f)

    components: list[dict[str, Any]] = []
    deps: list[dict[str, Any]] = []
    for asset_id, asset in sorted(assets.items()):
        occurrences = []
        for finding in sorted(by_asset.get(asset_id, []), key=lambda x: (x.file_path, x.line_start or 0)):
            occurrences.append({
                "location": finding.file_path,
                "line": finding.line_start or 0,
                "offset": 0,
                "symbol": finding.symbol or "",
                "additionalContext": f"{finding.detector_id}/{finding.evidence_class} conf={finding.confidence:.2f}",
            })
        component: dict[str, Any] = {
            "type": "cryptographic-asset",
            "bom-ref": asset.id,
            "name": asset.canonical_name,
            "cryptoProperties": _crypto_properties(asset, (by_asset.get(asset_id) or [None])[0], None),
        }
        if occurrences:
            component["evidence"] = {"occurrences": occurrences[:200]}
        components.append(component)
        deps.append({
            "ref": asset.id,
            "dependsOn": sorted({f.file_path for f in by_asset.get(asset_id, [])}),
        })

    return {
        "$schema": f"http://cyclonedx.org/schema/bom/{spec_version}.xsd",
        "bomFormat": "CycloneDX",
        "specVersion": spec_version,
        # Deterministic serial + root ref: identical target bytes produce an
        # identical document, which is what makes "same report twice" a testable
        # property rather than a promise.
        "serialNumber": serial_number or "urn:uuid:" + str(uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"ecdat:{scan.target_sha256}:{scan.engine_version}:{scan.policy_pack_version}:{spec_version}",
        )),
        "version": 1,
        "metadata": {
            "timestamp": _iso(scan.created_at),
            "tools": {"components": [{"type": "application", "name": "ECDAT", "version": scan.engine_version}]},
            "component": {
                "type": "application",
                "bom-ref": f"root:{scan.target_sha256[:32]}",
                "name": scan.name or scan.target_uri,
                "version": scan.engine_version,
            },
            "properties": [
                {"name": "ecdat:policy-pack", "value": scan.policy_pack_version},
                {"name": "ecdat:coverage-index", "value": str(coverage.get("coverage_index", 0))},
                {"name": "ecdat:unobserved-pct", "value": str(coverage.get("unobserved_pct", 0))},
                {"name": "ecdat:target-sha256", "value": scan.target_sha256},
            ],
        },
        "components": components,
        "dependencies": [{"ref": f"root:{scan.target_sha256[:32]}", "dependsOn": sorted(assets)}] + deps,
    }


SARIF_LEVEL = {"critical": "error", "high": "error", "medium": "warning", "low": "note"}
SARIF_RULE = {
    "critical": "ECDA-CRITICAL", "high": "ECDA-HIGH", "medium": "ECDA-MEDIUM", "low": "ECDA-LOW",
}


def build_sarif(scan: Any, rows: list[tuple[Any, Any, Any]]) -> dict[str, Any]:
    """rows: (finding, asset, risk)."""
    rules = []
    for band, rule_id in SARIF_RULE.items():
        rules.append({
            "id": rule_id,
            "name": f"CryptographicRisk{band.title()}",
            "shortDescription": {"text": f"Cryptographic asset with {band} assessed risk"},
            "fullDescription": {"text": "Deterministic dual-track (classical/quantum) risk assessment from ECDAT"},
            "helpUri": "https://cyclonedx.org/capabilities/bom/",
        })
    results = []
    for finding, asset, risk in rows:
        result: dict[str, Any] = {
            "ruleId": SARIF_RULE.get(risk.band, "ECDA-LOW"),
            "level": SARIF_LEVEL.get(risk.band, "note"),
            "message": {"text": risk.explanation[:1000]},
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {"uri": finding.file_path},
                    "region": {"startLine": max(1, finding.line_start or 1)},
                }
            }],
            "partialFingerprints": {"ecdatEvidenceHash": finding.evidence_hash, "ecdatAssetId": asset.id},
            "properties": {
                "canonicalName": asset.canonical_name,
                "quantumStatus": asset.quantum_status,
                "classicalRisk": risk.classical_risk,
                "quantumRisk": risk.quantum_risk,
                "moscaState": risk.mosca_state,
                "evidenceClass": finding.evidence_class,
                "confidence": finding.confidence,
            },
        }
        if finding.snippet_redacted:
            result["locations"][0]["physicalLocation"]["contextRegion"] = {"snippet": {"text": finding.snippet_redacted}}
        results.append(result)
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{
            "tool": {"driver": {"name": "ECDAT", "version": scan.engine_version,
                                "informationUri": "https://github.com/", "rules": rules}},
            "invocations": [{"executionSuccessful": True}],
            "results": results,
        }],
    }


def build_markdown_report(
    *, scan: Any, summary: dict[str, Any], coverage: dict[str, Any], top: list[dict[str, Any]],
    mosca: dict[str, Any], disclaimer_text: str, attestation: dict[str, Any] | None = None,
) -> str:
    lines: list[str] = []
    lines.append(f"# Cryptographic Discovery & Quantum Risk Report")
    lines.append("")
    lines.append(f"**Scan ID** `{scan.id}`  |  **Target** `{scan.target_uri}`  |  "
                 f"**Target SHA-256** `{scan.target_sha256[:32]}...`")
    lines.append(f"**Engine** v{scan.engine_version}  |  **Policy pack** {scan.policy_pack_version}  |  "
                 f"**Generated** {_iso(scan.finished_at or scan.created_at)}")
    lines.append("")
    lines.append("## 1. Coverage (read this before the risk numbers)")
    lines.append("")
    lines.append(f"- Weighted coverage index: **{coverage.get('coverage_index', 0):.2%}**")
    lines.append(f"- Unobserved / partially observed estate: **{coverage.get('unobserved_pct', 0):.1f}%**")
    for state, count in sorted((coverage.get("counts") or {}).items()):
        lines.append(f"  - {state}: {count}")
    lines.append("")
    lines.append(f"> {disclaimer_text}")
    lines.append("")
    lines.append("## 2. Inventory summary")
    lines.append("")
    lines.append(f"- Findings: **{summary.get('total_findings', 0)}** across **{summary.get('total_assets', 0)}** canonical assets")
    band_rows = summary.get("by_band") or []
    if isinstance(band_rows, dict):
        band_rows = [{"band": k, "count": v} for k, v in band_rows.items()]
    for row in band_rows:
        lines.append(f"  - {str(row.get('band', '')).upper()}: {row.get('count', 0)}")
    lines.append("")
    lines.append("## 3. Mosca temporal exposure (X + Y > Z)")
    lines.append("")
    if mosca:
        lines.append(f"- State: **{mosca.get('state')}** - X={mosca.get('x_years')}y, Y={mosca.get('y_years')}y, "
                     f"Z={mosca.get('z_years')}y, margin {mosca.get('margin_years')}y")
        lines.append(f"- Migration must start by **{mosca.get('must_start_by')}**")
    lines.append("")
    lines.append("## 4. Highest-risk findings")
    lines.append("")
    lines.append("| Band | Asset | Quantum status | Location | Evidence | Urgency |")
    lines.append("|---|---|---|---|---|---|")
    for row in top:
        risk = row.get("risk") or {}
        asset = row.get("asset") or {}
        lines.append(
            f"| {str(risk.get('band', '')).upper()} | {asset.get('canonical_name', '')} | "
            f"{asset.get('quantum_status', '')} | `{row.get('file_path', '')}:{row.get('line_start') or 0}` | "
            f"{row.get('evidence_class', '')} ({float(row.get('confidence', 0)):.2f}) | "
            f"{risk.get('urgency_score', 0)} |"
        )
    lines.append("")
    if attestation:
        lines.append("## 5. Forensic attestation")
        lines.append("")
        lines.append(f"- Merkle root: `{attestation.get('merkle_root')}`")
        lines.append(f"- Leaves: {attestation.get('leaf_count')} | Ledger head: `{attestation.get('ledger_head')}`")
        lines.append(f"- Signature: {attestation.get('signature_alg')} (key origin: {attestation.get('key_origin')})")
        lines.append("")
    return "\n".join(lines)


def build_findings_csv(rows: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["finding_id", "band", "composite_risk", "classical_risk", "quantum_risk", "urgency",
                     "canonical_name", "quantum_status", "purpose", "file_path", "line", "detector",
                     "evidence_class", "confidence", "mosca_state"])
    for row in rows:
        writer.writerow([
            row.get("id", ""), row.get("band", ""), row.get("composite_risk", 0), row.get("classical_risk", 0),
            row.get("quantum_risk", 0), row.get("urgency_score", 0), row.get("canonical_name", ""),
            row.get("quantum_status", ""), row.get("purpose", ""), row.get("file_path", ""),
            row.get("line_start") or "", row.get("detector_id", ""), row.get("evidence_class", ""),
            f'{row.get("confidence", 0):.2f}', row.get("mosca_state", ""),
        ])
    return buffer.getvalue()


def dumps(payload: Any) -> str:
    return json.dumps(payload, indent=2, sort_keys=False, default=str)
