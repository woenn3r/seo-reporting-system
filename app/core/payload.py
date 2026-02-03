from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.lake import load_mart
from app.core.time_utils import prev_period


def _mom_pct(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return round((current - previous) / previous, 4)


def build_payload(
    project: dict[str, Any],
    period: str,
    marts: dict[str, Any],
    missing_sources: list[str],
    warnings: list[str],
) -> dict[str, Any]:
    project_key = project["project_key"]
    prev = prev_period(period)

    prev_gsc = load_mart(project_key, prev, "gsc_monthly") if "gsc" in marts else None

    gsc = marts.get("gsc", {})
    gsc_kpis = gsc.get("kpis", {}) if gsc else {}

    prev_kpis = (prev_gsc or {}).get("kpis", {})
    gsc_payload = {
        "clicks": gsc_kpis.get("clicks"),
        "clicks_mom_pct": _mom_pct(gsc_kpis.get("clicks"), prev_kpis.get("clicks")),
        "impressions": gsc_kpis.get("impressions"),
        "impressions_mom_pct": _mom_pct(gsc_kpis.get("impressions"), prev_kpis.get("impressions")),
        "ctr": gsc_kpis.get("ctr"),
        "ctr_mom_pct": _mom_pct(gsc_kpis.get("ctr"), prev_kpis.get("ctr")),
        "avg_position": gsc_kpis.get("avg_position"),
        "avg_position_delta": None if gsc_kpis.get("avg_position") is None or prev_kpis.get("avg_position") is None else round(gsc_kpis.get("avg_position") - prev_kpis.get("avg_position"), 2),
    }

    rankings = marts.get("rankings") or {}
    cwv = marts.get("cwv") or {}
    analytics = marts.get("analytics") or {}

    enabled_sources = [
        name for name, cfg in project.get("sources", {}).items() if cfg.get("enabled")
    ]
    completeness = 0.0
    if enabled_sources:
        completeness = (1 - (len(missing_sources) / len(enabled_sources))) * 100

    payload = {
        "meta": {
            "project_key": project["project_key"],
            "client_name": project["client_name"],
            "period": period,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "timezone": project["timezone"],
            "report_language": project["report_language"],
        },
        "missing_sources": missing_sources,
        "warnings": warnings,
        "data_completeness_score": round(completeness, 1),
        "kpis": {
            "gsc": gsc_payload,
            "rankings": rankings,
            "cwv": cwv,
            "analytics": analytics,
        },
        "insights": {
            "top_pages": (gsc.get("top_pages") if gsc else []),
            "top_queries": (gsc.get("top_queries") if gsc else []),
            "winners_pages": [],
            "losers_pages": [],
            "winners_queries": [],
            "losers_queries": [],
        },
        "actions": [],
    }
    return payload
