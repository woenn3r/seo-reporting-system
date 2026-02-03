from __future__ import annotations

from typing import Any


def _kpis_from_response(resp: dict[str, Any]) -> dict[str, Any]:
    rows = resp.get("rows", [])
    if rows:
        row = rows[0]
        return {
            "clicks": row.get("clicks"),
            "impressions": row.get("impressions"),
            "ctr": row.get("ctr"),
            "avg_position": row.get("position"),
        }
    return {"clicks": None, "impressions": None, "ctr": None, "avg_position": None}


def _items_from_response(resp: dict[str, Any], key_name: str) -> list[dict[str, Any]]:
    rows = resp.get("rows", [])
    items = []
    for row in rows:
        keys = row.get("keys", [])
        value = keys[0] if keys else None
        items.append({
            key_name: value,
            "clicks": row.get("clicks"),
            "clicks_mom_pct": None,
            "impressions": row.get("impressions"),
            "ctr": row.get("ctr"),
            "avg_position": row.get("position"),
        })
    return items


def _normalize_items(items: list[dict[str, Any]], key_name: str) -> list[dict[str, Any]]:
    normalized = []
    for item in items:
        normalized.append({
            key_name: item.get(key_name),
            "clicks": item.get("clicks"),
            "clicks_mom_pct": item.get("clicks_mom_pct"),
            "impressions": item.get("impressions"),
            "ctr": item.get("ctr"),
            "avg_position": item.get("avg_position"),
        })
    return normalized


def to_mart(raw: dict[str, Any]) -> dict[str, Any]:
    # Mock format
    if "kpis" in raw and isinstance(raw["kpis"], dict) and "raw" not in raw:
        return {
            "kpis": raw["kpis"],
            "top_pages": _normalize_items(raw.get("top_pages", []), "url"),
            "top_queries": _normalize_items(raw.get("top_queries", []), "query"),
        }

    data = raw.get("raw", raw)
    kpis = _kpis_from_response(data.get("kpis", {}))
    top_pages = _items_from_response(data.get("pages", {}), "url")
    top_queries = _items_from_response(data.get("queries", {}), "query")
    return {"kpis": kpis, "top_pages": top_pages, "top_queries": top_queries}
