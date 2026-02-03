from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
import typer

from app.core.manifest import load_manifest, required_env_vars, hard_disabled_sources
from app.core.schemas import validate_json, project_schema_path
from app.core.project import project_path
from app.extractors import gsc as gsc_extractor


@dataclass(frozen=True)
class SourceStatus:
    configured: bool
    secrets_present: bool
    connectivity: str
    message: str


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


def _source_enabled(project: dict[str, Any], source: str, hard_disabled: set[str]) -> bool:
    if source in hard_disabled:
        return False
    return bool(project.get("sources", {}).get(source, {}).get("enabled", False))


def evaluate(project_key: str | None = None, mock: bool = False) -> dict[str, Any]:
    errors: list[str] = []
    manifest = load_manifest()
    env_map = required_env_vars(manifest)
    hard_disabled = hard_disabled_sources(manifest)
    status_rows: dict[str, SourceStatus] = {}

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

    if project:
        output_path = Path(project.get("output_path", "")).expanduser()
        if not output_path.exists():
            try:
                output_path.mkdir(parents=True, exist_ok=True)
            except OSError:
                errors.append(f"Output path not writable: {output_path}")
        if not mock:
            if _source_enabled(project, "gsc", hard_disabled):
                msg = _check_gsc_auth()
                if msg:
                    errors.append(f"GSC auth: {msg}")
        status_rows.update(_evaluate_sources(project, env_map, mock, errors, hard_disabled))
    else:
        # Global sanity check
        if not mock and _has_value("GSC_CREDENTIALS_JSON"):
            msg = _check_gsc_auth()
            if msg:
                errors.append(f"GSC auth: {msg}")

    return {
        "project_key": project_key,
        "mock": mock,
        "errors": errors,
        "status": {k: v.__dict__ for k, v in status_rows.items()},
        "required_env_vars": env_map,
    }


def run(project_key: str | None = None, mock: bool = False) -> None:
    result = evaluate(project_key, mock=mock)
    status_rows = {k: SourceStatus(**v) for k, v in result.get("status", {}).items()}

    _print_status(status_rows, mock)

    errors = result.get("errors", [])
    if errors:
        for err in errors:
            typer.secho(f"ERROR: {err}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    if mock:
        typer.secho("OK: mock mode, secrets/connectivity checks skipped.", fg=typer.colors.GREEN)
    else:
        typer.secho("OK: required secrets present for enabled sources.", fg=typer.colors.GREEN)


def _evaluate_sources(
    project: dict[str, Any],
    env_map: dict[str, list[str]],
    mock: bool,
    errors: list[str],
    hard_disabled: set[str],
) -> dict[str, SourceStatus]:
    rows: dict[str, SourceStatus] = {}

    def secrets_present_for(keys: list[str]) -> bool:
        return all(_has_value(k) for k in keys)

    def status(source: str, configured: bool, keys: list[str], check_fn) -> None:
        if source in hard_disabled:
            rows[source] = SourceStatus(False, False, "SKIPPED", "hard-disabled")
            return
        if not configured:
            rows[source] = SourceStatus(False, False, "SKIPPED", "source disabled")
            return

        if mock:
            rows[source] = SourceStatus(True, False, "SKIPPED", "mock mode")
            return

        missing = [key for key in keys if not _has_value(key)]
        if missing:
            missing_list = ", ".join(missing)
            msg = (
                f"missing env: {missing_list} "
                "(set in repo .env or secrets/*.env, or export in shell)"
            )
            rows[source] = SourceStatus(True, False, "FAIL", msg)
            errors.append(f"{source}: missing env: {missing_list}")
            return

        ok, message = check_fn()
        if ok:
            rows[source] = SourceStatus(True, True, "OK", message)
        else:
            rows[source] = SourceStatus(True, True, "FAIL", message)
            errors.append(f"{source}: {message}")

    status(
        "gsc",
        _source_enabled(project, "gsc", hard_disabled),
        env_map.get("gsc", []),
        lambda: _check_gsc_connectivity(),
    )
    status(
        "pagespeed",
        _source_enabled(project, "pagespeed", hard_disabled),
        env_map.get("pagespeed", []),
        lambda: _check_pagespeed_connectivity(project),
    )
    status(
        "crux",
        _source_enabled(project, "crux", hard_disabled),
        env_map.get("crux", []),
        lambda: _check_crux_connectivity(project),
    )
    status(
        "dataforseo",
        _source_enabled(project, "dataforseo", hard_disabled),
        env_map.get("dataforseo", []),
        lambda: _check_dataforseo_connectivity(),
    )
    status(
        "rybbit",
        _source_enabled(project, "rybbit", hard_disabled),
        env_map.get("rybbit", []),
        lambda: _check_rybbit_connectivity(),
    )
    return rows


def _print_status(rows: dict[str, SourceStatus], mock: bool) -> None:
    if not rows:
        return
    typer.secho("Source status:", fg=typer.colors.CYAN)
    for source, row in rows.items():
        status = row.connectivity
        msg = row.message
        configured = "YES" if row.configured else "NO"
        secrets = "YES" if row.secrets_present else "NO"
        typer.echo(f"- {source}: configured={configured} secrets={secrets} connectivity={status} ({msg})")


def _check_gsc_connectivity() -> tuple[bool, str]:
    try:
        gsc_extractor.list_sites()
        return True, "list sites ok"
    except Exception as exc:
        return False, f"{exc}"


def _check_pagespeed_connectivity(project: dict[str, Any]) -> tuple[bool, str]:
    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return False, "GOOGLE_API_KEY missing"
    url = project.get("canonical_origin")
    try:
        res = requests.get(
            "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
            params={"url": url, "strategy": "mobile", "key": api_key},
            timeout=30,
        )
        res.raise_for_status()
        return True, "runPagespeed ok"
    except Exception as exc:
        return False, f"{exc}"


def _check_crux_connectivity(project: dict[str, Any]) -> tuple[bool, str]:
    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return False, "GOOGLE_API_KEY missing"
    origin = project.get("canonical_origin")
    try:
        res = requests.post(
            f"https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key={api_key}",
            json={"origin": origin},
            timeout=30,
        )
        res.raise_for_status()
        return True, "crux query ok"
    except Exception as exc:
        return False, f"{exc}"


def _check_dataforseo_connectivity() -> tuple[bool, str]:
    login = os.environ.get("DATAFORSEO_LOGIN", "").strip()
    password = os.environ.get("DATAFORSEO_PASSWORD", "").strip()
    if not login or not password:
        return False, "DATAFORSEO_LOGIN/PASSWORD missing"
    base = os.environ.get("DATAFORSEO_API_BASE", "https://api.dataforseo.com")
    try:
        res = requests.get(f"{base}/v3/appendix/user_data", auth=(login, password), timeout=30)
        res.raise_for_status()
        return True, "user_data ok"
    except Exception as exc:
        return False, f"{exc}"


def _check_rybbit_connectivity() -> tuple[bool, str]:
    token = os.environ.get("RYBBIT_API_KEY", "").strip()
    base = os.environ.get("RYBBIT_API_BASE", "").strip()
    if not token or not base:
        return False, "RYBBIT_API_KEY/RYBBIT_API_BASE missing"
    try:
        res = requests.get(
            f"{base.rstrip('/')}/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        res.raise_for_status()
        return True, "rybbit me ok"
    except Exception as exc:
        return False, f"{exc}"
