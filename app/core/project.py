from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import typer

from app.core.config import settings, ensure_dirs
from app.core.registry import load_sources_registry
from app.core.schemas import project_schema_path, validate_json
from app.core.policy import load_policy


def project_dir(project_key: str) -> Path:
    return settings().workspace_dir / "projects" / project_key


def project_path(project_key: str) -> Path:
    return project_dir(project_key) / "project.json"


def write_project(project_key: str, payload: dict[str, Any]) -> Path:
    path = project_path(project_key)
    ensure_dirs([path.parent])
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def prompt_project() -> dict[str, Any]:
    sources_registry = load_sources_registry()
    sources_defaults = {
        key: val.get("enabled_by_default", False)
        for key, val in sources_registry.get("sources", {}).items()
    }

    policy = load_policy()
    supported_languages = policy.get("language_rules", {}).get("supported_languages", ["de", "en"])
    default_tz = policy.get("timezone", "Europe/Helsinki")

    project_key = typer.prompt("Project key (lowercase, no spaces)")
    client_name = typer.prompt("Client name")
    domain = typer.prompt("Domain (example.com)")
    canonical_origin = typer.prompt("Canonical origin (https://www.example.com)")
    output_path = typer.prompt("Output path (report output root)")
    timezone = typer.prompt("Timezone (IANA, e.g. Europe/Berlin)", default=default_tz)
    report_language = typer.prompt("Report language", default=supported_languages[0])
    if report_language not in supported_languages:
        raise typer.Exit(code=1)

    sources = {}
    sources["gsc"] = {
        "enabled": typer.confirm("Enable GSC source?", default=sources_defaults.get("gsc", True)),
        "property": typer.prompt("GSC property (sc-domain:example.com)")
    }
    sources["dataforseo"] = {
        "enabled": typer.confirm("Enable DataForSEO?", default=sources_defaults.get("dataforseo", False)),
        "locations_set": typer.prompt("DataForSEO locations_set", default="de_core"),
    }
    sources["pagespeed"] = {
        "enabled": typer.confirm("Enable PageSpeed Insights?", default=sources_defaults.get("pagespeed", True)),
    }
    sources["crux"] = {
        "enabled": typer.confirm("Enable CrUX?", default=sources_defaults.get("crux", True)),
        "mode": typer.prompt("CrUX mode (history/daily)", default="history"),
    }
    sources["rybbit"] = {
        "enabled": typer.confirm("Enable Rybbit?", default=sources_defaults.get("rybbit", False)),
    }

    thresholds = {
        "mom_drop_clicks_pct": float(typer.prompt("MoM drop clicks threshold (fraction, e.g. 0.2 = 20%)", default="0.2")),
        "mom_drop_impressions_pct": float(typer.prompt("MoM drop impressions threshold (fraction, e.g. 0.2 = 20%)", default="0.2")),
        "keyword_drop_positions": float(typer.prompt("Keyword drop positions threshold", default="3")),
        "inp_regression_ms": float(typer.prompt("INP regression threshold (ms)", default="50")),
    }

    payload = {
        "project_key": project_key,
        "client_name": client_name,
        "domain": domain,
        "canonical_origin": canonical_origin,
        "output_path": output_path,
        "timezone": timezone,
        "report_language": report_language,
        "sources": sources,
        "thresholds": thresholds,
    }
    validate_json(payload, project_schema_path(), "project.json")
    return payload
