from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from app.core.config import REPO_ROOT


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_json(instance: dict[str, Any], schema_path: Path, name: str) -> None:
    schema = load_json(schema_path)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(instance), key=lambda e: e.path)
    if errors:
        msg = "\n".join([f"- {name}: {list(e.path)}: {e.message}" for e in errors[:50]])
        raise ValueError(f"Schema validation failed:\n{msg}")


def project_schema_path() -> Path:
    return REPO_ROOT / "contracts/project_pack/v1.schema.json"


def payload_schema_path() -> Path:
    return REPO_ROOT / "contracts/report_payload/v1.schema.json"
