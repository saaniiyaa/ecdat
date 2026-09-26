"""Forensic attestation: Merkle evidence tree + append-only ledger + signature.

Chain of custody, in three layers:

1. **Leaf** - one SHA-256 per finding over a canonical JSON of the finding, its
   asset and its risk verdict. Any later edit to a finding changes its leaf.
2. **Tree** - Merkle root over leaves sorted by evidence hash, so the root is
   independent of insertion order and reproducible from the database alone.
3. **Ledger** - append-only hash chain (`entry_hash = SHA256(prev_hash|payload)`)
   recording what happened, when, in what order.

Signature is Ed25519 (deterministic, offline, no CA required). Key handling is
honest: if no operator key is configured we generate an ephemeral demo key and
record `key_origin='ephemeral_demo'` in the dossier, so nobody can later claim
the document was signed by a real officer key.
"""

from __future__ import annotations

import base64
import datetime as dt
import os
from typing import Any, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519

from app.db import utcnow
from app.ids import canonical_json, merkle_root, sha256_hex
from app.models import EvidenceLedger

LEDGER_GENESIS = "0" * 64


def leaf_hash(finding: Any, asset: Any, risk: Any) -> str:
    payload = {
        "finding_id": finding.id,
        "evidence_hash": finding.evidence_hash,
        "file_path": finding.file_path,
        "line_start": finding.line_start,
        "detector_id": finding.detector_id,
        "evidence_class": finding.evidence_class,
        "confidence": round(float(finding.confidence), 3),
        "asset_id": asset.id,
        "canonical_name": asset.canonical_name,
        "oid": asset.oid,
        "quantum_status": asset.quantum_status,
        "composite_risk": getattr(risk, "composite_risk", None),
        "band": getattr(risk, "band", None),
    }
    return sha256_hex(canonical_json(payload))


def build_leaves(rows: list[tuple[Any, Any, Any]]) -> list[str]:
    """Deterministic ordering: leaves sorted by evidence hash before merkle-ing."""
    return sorted(leaf_hash(f, a, r) for f, a, r in rows)


def append_ledger(session, scan_id: str, entries: list[dict[str, Any]]) -> str:
    """Append `entries` to the scan's hash chain; returns the head hash."""
    head = LEDGER_GENESIS
    seq = session.query(EvidenceLedger).filter(EvidenceLedger.scan_id == scan_id).count()
    for entry in entries:
        payload_hash = sha256_hex(canonical_json(entry))
        entry_hash = sha256_hex(head, payload_hash, entry.get("kind", "finding"), str(seq))
        session.add(
            EvidenceLedger(
                scan_id=scan_id, seq=seq, kind=entry.get("kind", "finding"),
                payload_hash=payload_hash, prev_hash=head, entry_hash=entry_hash, created_at=utcnow(),
            )
        )
        head = entry_hash
        seq += 1
    return head


def load_or_create_key() -> tuple[ed25519.Ed25519PrivateKey, str, str]:
    """Return (private_key, public_key_b64, key_origin)."""
    env_key = os.getenv("ECDAT_SIGNING_KEY_B64")
    if env_key:
        try:
            raw = base64.b64decode(env_key)
            key = ed25519.Ed25519PrivateKey.from_private_bytes(raw)
            pub = key.public_key().public_bytes(
                encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
            )
            return key, base64.b64encode(pub).decode(), "operator_configured"
        except Exception:
            pass
    key = ed25519.Ed25519PrivateKey.generate()
    pub = key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    return key, base64.b64encode(pub).decode(), "ephemeral_demo"


def sign(message: bytes, key: ed25519.Ed25519PrivateKey) -> str:
    return base64.b64encode(key.sign(message)).decode()


def verify_signature(message: bytes, signature_b64: str, public_key_b64: str) -> bool:
    try:
        pub = ed25519.Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64))
        pub.verify(base64.b64decode(signature_b64), message)
        return True
    except Exception:
        return False


def verify_ledger(session, scan_id: str) -> tuple[bool, str]:
    rows = (
        session.query(EvidenceLedger)
        .filter(EvidenceLedger.scan_id == scan_id)
        .order_by(EvidenceLedger.seq)
        .all()
    )
    head = LEDGER_GENESIS
    for row in rows:
        if row.prev_hash != head:
            return False, head
        expected = sha256_hex(head, row.payload_hash, row.kind, str(row.seq))
        if expected != row.entry_hash:
            return False, head
        head = row.entry_hash
    return True, head


def tpm_quote() -> tuple[Optional[str], Optional[dict[str, Any]]]:
    """Best-effort TPM 2.0 PCR[0-7] read. Absent on most laptops -> reported honestly."""
    try:  # pragma: no cover - hardware dependent
        from tpm2_pytss import ESAPI  # type: ignore

        with ESAPI() as esapi:
            pcrs = esapi.pcr_read(0, [i for i in range(8)])
            values = {f"PCR{i}": pcrs[i].hex() for i in range(8)}
        return json_dumps(values), values
    except Exception:
        return None, None


def json_dumps(payload: Any) -> str:
    import json

    return json.dumps(payload, sort_keys=True, separators=(",", ":"))
