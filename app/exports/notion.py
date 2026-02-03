from __future__ import annotations

from typing import Any

from app.core.registry import load_notion_registry


def export_notion_fields(payload: dict[str, Any]) -> str:
    registry = load_notion_registry()
    mappings = registry.get("mappings", {})

    lines = ["# Notion Field Pack", ""]
    for path, meta in mappings.items():
        value = _get(payload, path)
        name = meta.get("name")
        lines.append(f"- {name}: {value}")
    return "\n".join(lines) + "\n"


def _get(obj: dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur
