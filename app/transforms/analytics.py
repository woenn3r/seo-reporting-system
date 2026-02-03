from __future__ import annotations

from typing import Any


def from_rybbit(raw: dict[str, Any]) -> dict[str, Any]:
    if {"sessions", "conversions", "conversion_rate"}.issubset(raw.keys()):
        return {
            "sessions": raw.get("sessions"),
            "conversions": raw.get("conversions"),
            "conversion_rate": raw.get("conversion_rate"),
        }
    return {
        "sessions": raw.get("sessions"),
        "conversions": raw.get("conversions"),
        "conversion_rate": raw.get("conversion_rate"),
    }
