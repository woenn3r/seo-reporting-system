from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from app.core.config import REPO_ROOT


MANIFEST_PATH = REPO_ROOT / "configs" / "system" / "system_manifest_v1.yaml"


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"manifest missing: {MANIFEST_PATH}")
    return yaml.safe_load(MANIFEST_PATH.read_text(encoding="utf-8"))


def validate_manifest(manifest: dict[str, Any]) -> None:
    paths = manifest.get("paths", {})
    for section in ("contracts", "templates", "rules", "registries"):
        entries = paths.get(section, {})
        for key, rel in entries.items():
            _assert_file(rel, f"{section}.{key}")

    policy_path = REPO_ROOT / "configs" / "system" / "reporting_policy_v1.yaml"
    runbook_path = REPO_ROOT / "configs" / "system" / "system_runbook_v1.yaml"
    if not policy_path.exists():
        raise FileNotFoundError(f"policy missing: {policy_path}")
    if not runbook_path.exists():
        raise FileNotFoundError(f"runbook missing: {runbook_path}")


def _assert_file(rel: str, label: str) -> None:
    path = REPO_ROOT / rel
    if not path.exists():
        raise FileNotFoundError(f"manifest missing file for {label}: {rel}")
    if path.suffix.lower() in {".yaml", ".yml"}:
        yaml.safe_load(path.read_text(encoding="utf-8"))
    elif path.suffix.lower() == ".json":
        json.loads(path.read_text(encoding="utf-8"))


def template_for_language(manifest: dict[str, Any], language: str) -> Path:
    mapping = manifest.get("defaults", {}).get("template_by_language", {})
    template_key = mapping.get(language)
    if not template_key:
        raise ValueError(f"unsupported language: {language}")
    templates = manifest.get("paths", {}).get("templates", {})
    rel = templates.get(template_key)
    if not rel:
        raise ValueError(f"template not found for language: {language}")
    return REPO_ROOT / rel


def actions_rules_path(manifest: dict[str, Any]) -> Path:
    rel = manifest.get("paths", {}).get("rules", {}).get("actions_v1")
    if not rel:
        raise FileNotFoundError("actions_v1 missing from manifest")
    return REPO_ROOT / rel


def required_env_vars(manifest: dict[str, Any]) -> dict[str, list[str]]:
    return manifest.get("required_env_vars", {})


def hard_disabled_sources(manifest: dict[str, Any]) -> set[str]:
    return set(manifest.get("hard_disabled_sources", []))
