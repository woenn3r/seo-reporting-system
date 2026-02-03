from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import typer

from app.core.config import ensure_dirs
from app.core.lake import write_mart
from app.core.duckdb_store import store_gsc
from app.core.payload import build_payload
from app.core.actions import build_actions_debug
from app.core.manifest import load_manifest, hard_disabled_sources
from app.core.schemas import payload_schema_path, project_schema_path, validate_json
from app.extractors.base import RunContext
from app.extractors import gsc as gsc_extractor
from app.extractors import dataforseo as dataforseo_extractor
from app.extractors import pagespeed as pagespeed_extractor
from app.extractors import crux as crux_extractor
from app.extractors import rybbit as rybbit_extractor
from app.render.report import render_report
from app.transforms import gsc as gsc_transform
from app.transforms import rankings as rankings_transform
from app.transforms import cwv as cwv_transform
from app.transforms import analytics as analytics_transform
from app.exports.notion import export_notion_fields


def _load_project(path: Path) -> dict[str, Any]:
    project = json.loads(path.read_text(encoding="utf-8"))
    validate_json(project, project_schema_path(), str(path))
    return project


def _load_keywords(project_dir: Path) -> list[str]:
    path = project_dir / "keywords.csv"
    if not path.exists():
        return []
    keywords = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            kw = row.get("keyword")
            if kw:
                keywords.append(kw.strip())
    return keywords


def run(project_path: Path, period: str, mock: bool = False, lang_override: str | None = None) -> Path:
    project = _load_project(project_path)
    if lang_override:
        project["report_language"] = lang_override
    project_key = project["project_key"]
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    ctx = RunContext(project_key=project_key, period=period, run_id=run_id, mock=mock)
    hard_disabled = hard_disabled_sources(load_manifest())
    marts: dict[str, Any] = {}
    missing_sources: list[str] = []
    warnings: list[str] = []

    if project.get("sources", {}).get("gsc", {}).get("enabled") and "gsc" not in hard_disabled:
        gsc_raw = gsc_extractor.run(project, ctx)
        gsc_mart = gsc_transform.to_mart(gsc_raw)
        write_mart(project_key, period, "gsc_monthly", gsc_mart)
        store_gsc(project_key, period, gsc_mart)
        marts["gsc"] = gsc_mart

    if project.get("sources", {}).get("dataforseo", {}).get("enabled") and "dataforseo" not in hard_disabled:
        keywords = _load_keywords(project_path.parent)
        if keywords:
            df_raw = dataforseo_extractor.run(project, ctx, keywords)
            df_mart = rankings_transform.to_mart(df_raw, project.get("domain", ""))
            write_mart(project_key, period, "rankings_monthly", df_mart)
            marts["rankings"] = df_mart
        else:
            warnings.append("DataForSEO: keywords.csv missing or empty.")
            missing_sources.append("rankings")

    if project.get("sources", {}).get("pagespeed", {}).get("enabled") and "pagespeed" not in hard_disabled:
        pagespeed_extractor.run(project, ctx)

    if project.get("sources", {}).get("crux", {}).get("enabled") and "crux" not in hard_disabled:
        crux_raw = crux_extractor.run(project, ctx)
        cwv_mart = cwv_transform.from_crux(crux_raw)
        write_mart(project_key, period, "cwv_monthly", cwv_mart)
        marts["cwv"] = cwv_mart

    if project.get("sources", {}).get("rybbit", {}).get("enabled") and "rybbit" not in hard_disabled:
        rybbit_raw = rybbit_extractor.run(project, ctx)
        analytics_mart = analytics_transform.from_rybbit(rybbit_raw)
        write_mart(project_key, period, "analytics_monthly", analytics_mart)
        marts["analytics"] = analytics_mart

    payload = build_payload(project, period, marts, missing_sources, warnings)
    manifest = load_manifest()
    actions, actions_debug = build_actions_debug(payload, project, manifest)
    payload["actions"] = actions
    validate_json(payload, payload_schema_path(), "report_payload.json")

    output_root = Path(project["output_path"]).expanduser().resolve()
    language = project.get("report_language")
    output_dir = output_root / period / language if language else output_root / period
    ensure_dirs([output_dir])

    report_path = output_dir / "report.md"
    if report_path.exists():
        suffix = language if language else "default"
        typer.secho(
            f"WARNING: overwriting existing report for {period}/{suffix}",
            fg=typer.colors.YELLOW,
        )

    payload_path = output_dir / "report_payload.json"
    payload_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    report_md = render_report(payload)
    report_path.write_text(report_md, encoding="utf-8")

    (output_dir / "actions_debug.json").write_text(
        json.dumps(actions_debug, indent=2),
        encoding="utf-8",
    )

    notion_md = export_notion_fields(payload)
    (output_dir / "notion_fields.md").write_text(notion_md, encoding="utf-8")

    template_key = manifest.get("defaults", {}).get("template_by_language", {}).get(
        payload.get("meta", {}).get("report_language", "de")
    )
    template_path = manifest.get("paths", {}).get("templates", {}).get(template_key)
    template_trace = {
        "lang": payload.get("meta", {}).get("report_language", "de"),
        "template_key": template_key,
        "template_path": template_path,
        "output_filenames": [
            "report.md",
            "report_payload.json",
            "actions_debug.json",
            "notion_fields.md",
            "template_trace.json",
            "run_trace.json",
        ],
        "variable_sections": sorted(payload.keys()),
        "render_timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    (output_dir / "template_trace.json").write_text(
        json.dumps(template_trace, indent=2),
        encoding="utf-8",
    )

    run_trace = {
        "steps": [
            {"name": "load manifest", "status": "done"},
            {"name": "load project", "status": "done"},
            {"name": "extract sources", "status": "done"},
            {"name": "build payload", "status": "done"},
            {"name": "evaluate actions", "status": "done"},
            {"name": "render template", "status": "done"},
            {
                "name": "write outputs",
                "status": "done",
                "artifacts": [
                    str(output_dir / "report.md"),
                    str(output_dir / "report_payload.json"),
                    str(output_dir / "actions_debug.json"),
                    str(output_dir / "notion_fields.md"),
                    str(output_dir / "template_trace.json"),
                ],
            },
        ]
    }
    (output_dir / "run_trace.json").write_text(json.dumps(run_trace, indent=2), encoding="utf-8")

    return output_dir
