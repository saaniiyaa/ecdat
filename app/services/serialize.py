"""JSON normalisation for evidence blobs.

Detector output is arbitrary Python; the database wants JSON. Everything that
crosses that boundary goes through `jsonable`, so a stray datetime or a set in a
scanner's extras can never abort a scan half-way.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any


def jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, (dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, bytes):
        return f"<{len(value)} bytes sha256-pending>"
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [jsonable(v) for v in value]
    if hasattr(value, "__dict__"):
        return {k: jsonable(v) for k, v in vars(value).items() if not k.startswith("_")}
    return str(value)
