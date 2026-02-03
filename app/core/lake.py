from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import settings, ensure_dirs


def mart_dir(project_key: str, period: str) -> Path:
    return settings().workspace_dir / "lake" / "marts" / project_key / period


def write_mart(project_key: str, period: str, name: str, payload: dict[str, Any]) -> Path:
    path = mart_dir(project_key, period) / f"{name}.json"
    ensure_dirs([path.parent])
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def load_mart(project_key: str, period: str, name: str) -> dict[str, Any] | None:
    path = mart_dir(project_key, period) / f"{name}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
