from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from app.core.config import REPO_ROOT


def load_locations_set(name: str) -> dict[str, Any]:
    path = REPO_ROOT / "configs" / "locations_sets" / f"{name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"locations_set not found: {name}")
    return yaml.safe_load(path.read_text(encoding="utf-8"))
