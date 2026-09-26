"""Coverage accounting - the "Coverage Honesty" layer.

A scanner that reports 0 findings on 4,000 files has told you nothing unless it
also tells you how much of the estate it actually looked at. Every enumerated
surface carries an observation state, and the coverage index is a weighted
function of those states, published next to every risk number.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

# Weights reflect how much of the crypto estate each surface kind usually carries.
KIND_WEIGHTS = {
    "source": 0.50,
    "cert": 0.15,
    "config": 0.10,
    "manifest": 0.10,
    "binary": 0.10,
    "container": 0.05,
}
STATE_SCORE = {"observed": 1.0, "partial": 0.5, "unobserved": 0.0, "unsupported": 0.0, "skipped": 0.0}


@dataclass
class CoverageReport:
    coverage_index: float
    unobserved_pct: float
    counts: dict[str, int]
    by_kind: dict[str, dict[str, int]]
    unobserved_samples: list[dict[str, str]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "coverage_index": round(self.coverage_index, 4),
            "unobserved_pct": round(self.unobserved_pct, 2),
            "counts": self.counts,
            "by_kind": self.by_kind,
            "unobserved_samples": self.unobserved_samples[:25],
        }


def compute(surfaces: Iterable[Any], *, sample_limit: int = 25) -> CoverageReport:
    """`surfaces` are ORM ScanSurface rows or dicts with observation_state/surface_kind."""
    counts: dict[str, int] = {}
    by_kind: dict[str, dict[str, int]] = {}
    weighted_num = 0.0
    weighted_den = 0.0
    unobserved: list[dict[str, str]] = []
    total = 0

    for surface in surfaces:
        state = surface.observation_state if hasattr(surface, "observation_state") else surface["observation_state"]
        kind = surface.surface_kind if hasattr(surface, "surface_kind") else surface["surface_kind"]
        path = surface.surface_path if hasattr(surface, "surface_path") else surface["surface_path"]
        reason = getattr(surface, "observation_reason", None) or (
            surface.get("observation_reason") if isinstance(surface, dict) else None
        )
        counts[state] = counts.get(state, 0) + 1
        by_kind.setdefault(kind, {})[state] = by_kind.setdefault(kind, {}).get(state, 0) + 1
        weight = KIND_WEIGHTS.get(kind, 0.05)
        weighted_num += weight * STATE_SCORE.get(state, 0.0)
        weighted_den += weight
        total += 1
        if state in {"unobserved", "unsupported", "partial"} and len(unobserved) < sample_limit:
            unobserved.append({"path": path, "kind": kind, "state": state, "reason": reason or "not specified"})

    coverage_index = (weighted_num / weighted_den) if weighted_den else 0.0
    unobserved_pct = 100.0 * (1.0 - coverage_index) if weighted_den else 100.0
    return CoverageReport(
        coverage_index=coverage_index,
        unobserved_pct=unobserved_pct,
        counts=counts,
        by_kind=by_kind,
        unobserved_samples=unobserved,
    )


def disclaimer(coverage: CoverageReport, finding_count: int) -> str:
    """The sentence a regulator-facing report must carry."""
    if coverage.unobserved_pct <= 0.0:
        return (
            f"All {finding_count} findings come from fully observed surfaces in this scan; "
            "no vulnerable artefact was detected within the scanned scope."
        )
    return (
        f"NOT DETECTED is not the same as QUANTUM-SAFE. {coverage.unobserved_pct:.1f}% of the weighted estate was not "
        f"fully observed (states: {', '.join(f'{k}={v}' for k, v in sorted(coverage.counts.items()))}); "
        f"unobserved surfaces are listed in the coverage section and must be triaged before any assurance claim."
    )
