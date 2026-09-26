"""Scan-to-scan diffing (deterministic, content-addressed)."""

from __future__ import annotations

from typing import Any


def compute(
    before: dict[str, dict[str, Any]],
    after: dict[str, dict[str, Any]],
    before_scan_id: str,
    after_scan_id: str,
    coverage_before: float | None = None,
    coverage_after: float | None = None,
) -> dict[str, Any]:
    added_keys = sorted(set(after) - set(before))
    removed_keys = sorted(set(before) - set(after))
    common = sorted(set(before) & set(after))

    band_moves: list[dict[str, str]] = []
    risk_delta = 0
    for key in common:
        old, new = before[key], after[key]
        risk_delta += int(new["composite_risk"]) - int(old["composite_risk"])
        if old["band"] != new["band"]:
            band_moves.append({
                "finding_id": new["finding_id"], "file_path": new["file_path"],
                "from": old["band"], "to": new["band"],
                "delta": str(int(new["composite_risk"]) - int(old["composite_risk"])),
            })

    coverage_delta = (
        round(float(coverage_after or 0) - float(coverage_before or 0), 4)
        if (coverage_before is not None and coverage_after is not None) else None
    )
    summary = (
        f"{len(added_keys)} new finding(s), {len(removed_keys)} removed, {len(common)} retained, "
        f"net composite risk {risk_delta:+d}, {len(band_moves)} band move(s)"
        + (f", coverage {coverage_delta:+.2%}" if coverage_delta is not None else "")
    )
    return {
        "from_scan_id": before_scan_id,
        "to_scan_id": after_scan_id,
        "added": [after[k]["finding_id"] for k in added_keys],
        "removed": [before[k]["finding_id"] for k in removed_keys],
        "unchanged": len(common),
        "risk_delta": risk_delta,
        "band_moves": band_moves,
        "coverage_delta": coverage_delta if coverage_delta is not None else 0.0,
        "summary": summary,
    }
