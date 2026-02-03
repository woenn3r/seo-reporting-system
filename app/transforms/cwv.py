from __future__ import annotations

from typing import Any


def _p75(metric: dict[str, Any]) -> float | None:
    return metric.get("percentiles", {}).get("p75") if metric else None


def from_crux(raw: dict[str, Any]) -> dict[str, Any]:
    if "metrics" in raw:
        return raw["metrics"]

    record = raw.get("record", {})
    metrics = record.get("metrics", {})
    lcp = _p75(metrics.get("largest_contentful_paint"))
    inp = _p75(metrics.get("interaction_to_next_paint"))
    cls = _p75(metrics.get("cumulative_layout_shift"))

    return {
        "lcp_p75_ms": lcp,
        "inp_p75_ms": inp,
        "cls_p75": cls,
        "status": None,
    }
