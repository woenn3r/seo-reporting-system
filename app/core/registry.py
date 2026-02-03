from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from app.core.config import REPO_ROOT


def load_yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def registries_dir() -> Path:
    return REPO_ROOT / "registries"


def load_sources_registry() -> dict[str, Any]:
    return load_yaml(registries_dir() / "sources.yaml")


def load_metrics_registry() -> dict[str, Any]:
    return load_yaml(registries_dir() / "metrics.yaml")


def load_notion_registry() -> dict[str, Any]:
    return load_yaml(registries_dir() / "notion_properties.yaml")
