from __future__ import annotations

import os
from typing import Any

import requests

from app.core.registry import load_notion_registry


NOTION_API_BASE = "https://api.notion.com"
NOTION_VERSION = "2022-06-28"


def export_notion_fields(payload: dict[str, Any]) -> str:
    registry = load_notion_registry()
    mappings = registry.get("mappings", {})

    lines = ["# Notion Field Pack", ""]
    for path, meta in mappings.items():
        value = _get(payload, path)
        name = meta.get("name")
        lines.append(f"- {name}: {value}")
    return "\n".join(lines) + "\n"


def sync_notion(payload: dict[str, Any]) -> dict[str, Any] | None:
    token = os.environ.get("NOTION_TOKEN", "").strip()
    database_id = os.environ.get("NOTION_DATABASE_ID", "").strip()
    if not token or not database_id:
        return None

    registry = load_notion_registry()
    mappings = registry.get("mappings", {})
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

    db_schema = _get_database_schema(database_id, headers)
    if db_schema is None:
        raise RuntimeError("Notion database schema fetch failed")

    properties = _build_properties(payload, mappings, db_schema)
    title_prop = _first_title_property(db_schema)
    period_prop = _mapping_name(mappings, "meta.period")

    existing = _find_existing_page(database_id, headers, title_prop, period_prop, payload, db_schema)
    if existing:
        page_id = existing
        res = requests.patch(
            f"{NOTION_API_BASE}/v1/pages/{page_id}",
            headers=headers,
            json={"properties": properties},
            timeout=30,
        )
        res.raise_for_status()
        return res.json()

    res = requests.post(
        f"{NOTION_API_BASE}/v1/pages",
        headers=headers,
        json={
            "parent": {"database_id": database_id},
            "properties": properties,
        },
        timeout=30,
    )
    res.raise_for_status()
    return res.json()


def _get_database_schema(database_id: str, headers: dict[str, str]) -> dict[str, Any] | None:
    try:
        res = requests.get(
            f"{NOTION_API_BASE}/v1/databases/{database_id}",
            headers=headers,
            timeout=30,
        )
        res.raise_for_status()
        return res.json().get("properties", {})
    except Exception:
        return None


def _build_properties(payload: dict[str, Any], mappings: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    props: dict[str, Any] = {}
    for path, meta in mappings.items():
        value = _get(payload, path)
        if value is None:
            continue
        name = meta.get("name")
        notion_type = _property_type(schema, name, meta.get("type"))
        if notion_type == "title":
            props[name] = {"title": [{"text": {"content": str(value)}}]}
        elif notion_type == "rich_text":
            props[name] = {"rich_text": [{"text": {"content": str(value)}}]}
        elif notion_type == "number":
            props[name] = {"number": value}
    return props


def _property_type(schema: dict[str, Any], name: str, declared: str | None) -> str:
    entry = schema.get(name, {})
    for key in ("title", "rich_text", "number", "select", "multi_select", "date"):
        if key in entry:
            return key
    if declared == "title_or_text":
        return "title"
    return declared or "rich_text"


def _first_title_property(schema: dict[str, Any]) -> str | None:
    for name, meta in schema.items():
        if "title" in meta:
            return name
    return None


def _mapping_name(mappings: dict[str, Any], path: str) -> str | None:
    meta = mappings.get(path)
    if not meta:
        return None
    return meta.get("name")


def _find_existing_page(
    database_id: str,
    headers: dict[str, str],
    title_prop: str | None,
    period_prop: str | None,
    payload: dict[str, Any],
    schema: dict[str, Any],
) -> str | None:
    if not title_prop or not period_prop:
        return None
    client = _get(payload, "meta.client_name")
    period = _get(payload, "meta.period")
    if not client or not period:
        return None
    title_filter = {"property": title_prop, "title": {"equals": str(client)}}
    period_type = _property_type(schema, period_prop, None)
    if period_type == "title":
        period_filter = {"property": period_prop, "title": {"equals": str(period)}}
    else:
        period_filter = {"property": period_prop, "rich_text": {"equals": str(period)}}
    body = {"filter": {"and": [title_filter, period_filter]}}
    try:
        res = requests.post(
            f"{NOTION_API_BASE}/v1/databases/{database_id}/query",
            headers=headers,
            json=body,
            timeout=30,
        )
        res.raise_for_status()
        data = res.json()
        results = data.get("results", [])
        if results:
            return results[0].get("id")
    except Exception:
        return None
    return None


def _get(obj: dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur
