from __future__ import annotations

from typing import Any


def _parse_mock(raw: dict[str, Any]) -> list[dict[str, Any]]:
    return raw.get("results", [])


def _parse_live(raw: dict[str, Any], domain: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    tasks = raw.get("tasks", [])
    for task in tasks:
        task_data = task.get("result", [])
        if not task_data:
            continue
        items = task_data[0].get("items", [])
        keyword = task_data[0].get("keyword") or task.get("data", {}).get("keyword")
        for item in items:
            item_domain = item.get("domain") or item.get("root_domain")
            if item_domain and domain in item_domain:
                results.append({
                    "keyword": keyword,
                    "position": item.get("rank_absolute") or item.get("rank_group"),
                    "delta": None,
                })
                break
    return results


def to_mart(raw: dict[str, Any], domain: str) -> dict[str, Any]:
    if "results" in raw:
        records = _parse_mock(raw)
    else:
        records = _parse_live(raw, domain)

    top3 = sum(1 for r in records if r.get("position") and r.get("position") <= 3)
    top10 = sum(1 for r in records if r.get("position") and r.get("position") <= 10)
    top20 = sum(1 for r in records if r.get("position") and r.get("position") <= 20)

    movers = [
        {
            "keyword": r.get("keyword"),
            "position": r.get("position"),
            "delta": r.get("delta"),
        }
        for r in records[:20]
    ]

    return {
        "kw_top3": top3 if records else None,
        "kw_top10": top10 if records else None,
        "kw_top20": top20 if records else None,
        "movers": movers,
    }
