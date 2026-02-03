from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT


def load_fixture(name: str) -> dict[str, Any]:
    path = REPO_ROOT / "app" / "fixtures" / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"Fixture missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))
