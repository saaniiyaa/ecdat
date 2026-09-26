"""Deterministic, content-addressed identifiers.

Every finding, asset and recommendation gets a stable ID derived only from the
content that defines it. Two scans of the same target therefore produce the same
IDs, which is what makes scan-to-scan diffing, CBOM stability and forensic
Merkle roots reproducible (byte-identical reports for identical inputs).
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any


def canonical_json(payload: Any) -> str:
    """RFC-8785-style canonical JSON: sorted keys, no insignificant whitespace."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def sha256_hex(*parts: str | bytes) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(part if isinstance(part, bytes) else str(part).encode("utf-8", errors="replace"))
        digest.update(b"\x1f")  # unit separator prevents field-boundary collisions
    return digest.hexdigest()


def stable_id(prefix: str, *parts: str) -> str:
    """`f_9a1c...` style ID: same inputs -> same ID, forever."""
    return f"{prefix}_{sha256_hex(*parts)[:24]}"


def request_id() -> str:
    return uuid.uuid4().hex[:16]


def random_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def merkle_root(leaves: list[str]) -> str:
    """Binary Merkle tree over hex leaf hashes; duplicate last node when odd."""
    if not leaves:
        return hashlib.sha256(b"empty").hexdigest()
    level = list(leaves)
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        nxt = []
        for i in range(0, len(level), 2):
            # RFC 6962 style: sort the two nodes before hashing so the tree is
            # independent of left/right ordering when reconstructing from proofs.
            pair = "".join(sorted((level[i], level[i + 1])))
            nxt.append(hashlib.sha256(pair.encode()).hexdigest())
        level = nxt
    return level[0]


def merkle_proof(leaves: list[str], index: int) -> list[str]:
    """Audit path for `index`, so any third party can verify one leaf."""
    if not leaves or index >= len(leaves):
        return []
    level = list(leaves)
    proof: list[str] = []
    idx = index
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        pair = idx ^ 1
        proof.append(level[pair])
        level = [hashlib.sha256((level[i] + level[i + 1]).encode()).hexdigest() for i in range(0, len(level), 2)]
        idx //= 2
    return proof


def verify_merkle_proof(leaf: str, proof: list[str], root: str) -> bool:
    node = leaf
    for sibling in proof:
        pair = node + sibling if node < sibling else sibling + node
        node = hashlib.sha256(pair.encode()).hexdigest()
    return node == root
