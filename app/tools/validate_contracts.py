from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from app.core.config import REPO_ROOT


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _validate(instance: dict, schema: dict, name: str) -> None:
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(instance), key=lambda e: e.path)
    if errors:
        msg = "\n".join([f"- {name}: {list(e.path)}: {e.message}" for e in errors[:50]])
        raise SystemExit(f"Schema validation failed:\n{msg}")


def main() -> None:
    project_schema = _load_json(REPO_ROOT / "contracts/project_pack/v1.schema.json")
    payload_schema = _load_json(REPO_ROOT / "contracts/report_payload/v1.schema.json")

    project = _load_json(REPO_ROOT / "examples/project_pack/sample_project.json")
    payload = _load_json(REPO_ROOT / "examples/report_payload/sample_payload.json")

    _validate(project, project_schema, "examples/project_pack/sample_project.json")
    _validate(payload, payload_schema, "examples/report_payload/sample_payload.json")

    for p in (REPO_ROOT / "registries").rglob("*.yaml"):
        yaml.safe_load(p.read_text(encoding="utf-8"))

    required = [
        "docs/00_scope.md",
        "docs/01_masterplan.md",
        "docs/02_user_manual.md",
        "docs/03_onboarding_inputs.md",
        "configs/report_templates/monthly_de.md",
        "configs/report_templates/monthly_en.md",
        "configs/report_rules/actions_v1.yaml",
        "configs/system/system_manifest_v1.yaml",
        "configs/system/reporting_policy_v1.yaml",
        "configs/system/system_runbook_v1.yaml",
    ]
    for r in required:
        if not (REPO_ROOT / r).exists():
            raise SystemExit(f"Missing required file: {r}")

    print("OK: contracts + examples + registries + required docs validated.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
