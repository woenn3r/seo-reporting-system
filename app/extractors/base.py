from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import settings, ensure_dirs


@dataclass(frozen=True)
class RunContext:
    project_key: str
    period: str
    run_id: str
    mock: bool


def raw_dir(source: str, ctx: RunContext) -> Path:
    return settings().workspace_dir / "lake" / "raw" / source / ctx.project_key / ctx.period


def write_raw(source: str, ctx: RunContext, payload: dict[str, Any]) -> Path:
    path = raw_dir(source, ctx) / f"{ctx.run_id}.json"
    ensure_dirs([path.parent])
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path
