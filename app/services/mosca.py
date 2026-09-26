"""Mosca's inequality engine (X + Y > Z).

Why this is a module and not a formula in a report: the three variables are
inputs that change (a new CRQC estimate, a vendor contract, a re-scoped data
retention policy), and the PS explicitly asks for a *simulator*. We keep the
arithmetic in one place, return the margin, and never hide the assumptions.

X = security shelf-life of the data        (per data class, declared by owner)
Y = migration time for this estate         (per organisation)
Z = time until a cryptographically relevant quantum computer

`X + Y > Z` means the data is already effectively exposed the day the machine
arrives, because it will still be protected by classical crypto on that day.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Literal

from app.registry import POLICY_PACK

MoscaState = Literal["breached", "borderline", "safe", "not_evaluated"]


@dataclass(frozen=True)
class MoscaResult:
    x_years: float
    y_years: float
    z_years: float
    state: MoscaState
    holds: bool
    margin_years: float
    must_start_by: str
    narrative: str

    def as_dict(self) -> dict:
        return {
            "x_years": self.x_years,
            "y_years": self.y_years,
            "z_years": self.z_years,
            "state": self.state,
            "holds": self.holds,
            "margin_years": round(self.margin_years, 2),
            "must_start_by": self.must_start_by,
        }


def evaluate(x_years: float, y_years: float, z_years: float, *, today: dt.date | None = None) -> MoscaResult:
    total = float(x_years) + float(y_years)
    z = float(z_years)
    margin = z - total
    if total > z:
        state: MoscaState = "breached"
    elif total >= 0.8 * z:
        state = "borderline"
    else:
        state = "safe"

    today = today or dt.date.today()
    latest_start = today + dt.timedelta(days=int(max(margin, 0) * 365.25))
    narrative = (
        f"X={x_years:g}y + Y={y_years:g}y = {total:g}y vs Z={z:g}y -> "
        f"{'BREACHED' if state == 'breached' else state.upper()}; "
        f"margin {margin:+.1f}y; migration must start by {latest_start.isoformat()}"
    )
    return MoscaResult(
        x_years=float(x_years), y_years=float(y_years), z_years=float(z_years),
        state=state, holds=total > z, margin_years=margin,
        must_start_by=latest_start.isoformat(), narrative=narrative,
    )


def scenario(name: str) -> dict:
    for item in POLICY_PACK["scenarios"]:
        if item["name"] == name:
            return item
    return POLICY_PACK["scenarios"][1]


def resolve(scenario_name: str, x: float | None, y: float | None, z: float | None) -> tuple[float, float, float, str]:
    """Merge caller overrides with the named scenario defaults."""
    preset = scenario(scenario_name if scenario_name != "custom" else "baseline")
    defaults = POLICY_PACK["defaults"]
    x_years = float(x if x is not None else defaults["x_years"])
    y_years = float(y if y is not None else defaults["y_years"])
    z_years = float(z if z is not None else preset["z_years"])
    return x_years, y_years, z_years, preset["source"] if z is None else "caller-supplied"
