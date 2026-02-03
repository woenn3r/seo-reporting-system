from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import typer

from app.core.manifest import load_manifest, required_env_vars
from app.core.schemas import validate_json, project_schema_path
from app.core.project import project_path


def _has_value(key: str) -> bool:
    return bool(os.environ.get(key, "").strip())


def _check_gsc_auth() -> str | None:
    mode = os.environ.get("GSC_AUTH_MODE", "service_account").strip()
    raw = os.environ.get("GSC_CREDENTIALS_JSON", "").strip()
    if not raw:
        return "GSC_CREDENTIALS_JSON missing"
    if mode not in {"service_account", "oauth"}:
        return "GSC_AUTH_MODE must be service_account|oauth"
    p = Path(raw)
    if p.exists():
        try:
            json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return "GSC_CREDENTIALS_JSON file is not valid JSON"
        return None
    try:
        json.loads(raw)
    except json.JSONDecodeError:
        return "GSC_CREDENTIALS_JSON must be a file path or JSON string"
    return None


def _source_enabled(project: dict[str, Any], source: str) -> bool:
    return bool(project.get("sources", {}).get(source, {}).get("enabled", False))


def run(project_key: str | None = None, mock: bool = False) -> None:
    errors: list[str] = []
    manifest = load_manifest()
    env_map = required_env_vars(manifest)

    if project_key:
        path = project_path(project_key)
        if not path.exists():
            typer.secho(f"ERROR: project not found: {path}", fg=typer.colors.RED)
            raise typer.Exit(code=1)
        project = json.loads(path.read_text(encoding="utf-8"))
        try:
            validate_json(project, project_schema_path(), str(path))
        except ValueError as exc:
            errors.append(str(exc))
    else:
        project = None

    def need_env(key: str, reason: str) -> None:
        if not _has_value(key):
            errors.append(f"{reason}: {key} missing")

    if project:
        output_path = Path(project.get("output_path", "")).expanduser()
        if not output_path.exists():
            try:
                output_path.mkdir(parents=True, exist_ok=True)
            except OSError:
                errors.append(f"Output path not writable: {output_path}")
        if not mock:
            if _source_enabled(project, "gsc"):
                msg = _check_gsc_auth()
                if msg:
                    errors.append(f"GSC auth: {msg}")
                for key in env_map.get("gsc", []):
                    need_env(key, "GSC")
            if _source_enabled(project, "dataforseo"):
                for key in env_map.get("dataforseo", []):
                    need_env(key, "DataForSEO")
            if _source_enabled(project, "pagespeed"):
                for key in env_map.get("pagespeed", []):
                    need_env(key, "PageSpeed Insights")
            if _source_enabled(project, "crux"):
                for key in env_map.get("crux", []):
                    need_env(key, "CrUX")
            if _source_enabled(project, "rybbit"):
                for key in env_map.get("rybbit", []):
                    need_env(key, "Rybbit")
    else:
        # Global sanity check
        if not mock and _has_value("GSC_CREDENTIALS_JSON"):
            msg = _check_gsc_auth()
            if msg:
                errors.append(f"GSC auth: {msg}")

    if errors:
        for err in errors:
            typer.secho(f"ERROR: {err}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    typer.secho("OK: required secrets present for enabled sources.", fg=typer.colors.GREEN)
