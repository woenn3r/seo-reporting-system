from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.core.config import REPO_ROOT, settings
from app.core.manifest import load_manifest, required_env_vars
from app.core.policy import load_policy, resolve_period
from app.core.project import project_path
from app.core.doctor import evaluate as doctor_evaluate
from app.core.actions import _load_rules


@dataclass(frozen=True)
class ExplainResult:
    plan: dict[str, Any]
    text: str


def _git_rev() -> str | None:
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return res.stdout.strip()
    except Exception:
        return None


def _template_selection(manifest: dict[str, Any], language: str) -> dict[str, Any]:
    mapping = manifest.get("defaults", {}).get("template_by_language", {})
    template_key = mapping.get(language)
    templates = manifest.get("paths", {}).get("templates", {})
    return {
        "template_key": template_key,
        "template_path": templates.get(template_key),
        "lang": language,
    }


def _output_dir(project: dict[str, Any], period: str, language: str | None) -> Path:
    output_root = Path(project["output_path"]).expanduser().resolve()
    if language:
        return output_root / period / language
    return output_root / period


def explain_plan(project_key: str, month: str, language: str) -> ExplainResult:
    policy = load_policy()
    manifest = load_manifest()
    path = project_path(project_key)
    project = json.loads(path.read_text(encoding="utf-8"))

    resolution = resolve_period(policy, month, language)
    template = _template_selection(manifest, language)
    enabled_sources = [
        name
        for name, cfg in project.get("sources", {}).items()
        if cfg.get("enabled")
    ]

    steps = _steps_overview(enabled_sources)

    plan = {
        "project_key": project_key,
        "month_input": month,
        "period": resolution.period,
        "warning": resolution.warning,
        "language": language,
        "template": template,
        "enabled_sources": enabled_sources,
        "output_dir": str(_output_dir(project, resolution.period, language)),
        "steps": steps,
    }

    lines = [
        f"Project: {project_key}",
        f"Month input: {month}",
        f"Resolved period: {resolution.period}",
    ]
    if resolution.warning:
        lines.append(f"Warning: {resolution.warning}")
    lines.extend(
        [
            f"Language: {language}",
            f"Template: {template.get('template_key')} ({template.get('template_path')})",
            f"Enabled sources: {', '.join(enabled_sources) if enabled_sources else 'none'}",
            f"Output dir: {plan['output_dir']}",
            "Steps:",
        ]
    )
    for step in steps:
        lines.append(f"- {step}")

    return ExplainResult(plan=plan, text="\n".join(lines))


def snapshot(
    project_key: str,
    month: str | None,
    language: str,
    out_path: Path,
    mock: bool = False,
) -> Path:
    manifest = load_manifest()
    env_map = required_env_vars(manifest)
    path = project_path(project_key)
    project = json.loads(path.read_text(encoding="utf-8"))

    status = doctor_evaluate(project_key, mock=mock)
    policy = load_policy()

    period = None
    output_dir = None
    steps = _steps_overview(
        [name for name, cfg in project.get("sources", {}).items() if cfg.get("enabled")]
    )

    if month:
        resolution = resolve_period(policy, month, language)
        period = resolution.period
        output_dir = str(_output_dir(project, period, language))
    else:
        resolution = None

    template = _template_selection(manifest, language)
    rules_path = manifest.get("paths", {}).get("rules", {}).get("actions_v1")

    snapshot_data = {
        "repo": {
            "path": str(REPO_ROOT),
            "commit": _git_rev(),
        },
        "manifest": {
            "version": manifest.get("version"),
            "path": str(REPO_ROOT / "configs/system/system_manifest_v1.yaml"),
        },
        "project": project,
        "enabled_sources": [
            name
            for name, cfg in project.get("sources", {}).items()
            if cfg.get("enabled")
        ],
        "required_env_vars": env_map,
        "doctor": status,
        "template": template,
        "ruleset": {
            "actions_v1": rules_path,
        },
        "pipeline_steps": steps,
        "policy": {
            "month_input": month,
            "resolved_period": period,
            "warning": resolution.warning if resolution else None,
        },
        "output_dir": output_dir,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(snapshot_data, indent=2), encoding="utf-8")
    return out_path


def audit_export(
    project_key: str,
    month: str,
    language: str,
    out_dir: Path,
    mock: bool = False,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    env_map = required_env_vars(manifest)
    path = project_path(project_key)
    project = json.loads(path.read_text(encoding="utf-8"))

    explain = explain_plan(project_key, month, language)
    snapshot_path = snapshot(project_key, month, language, out_dir / "snapshot.json", mock=mock)

    (out_dir / "explain.txt").write_text(explain.text, encoding="utf-8")

    doctor_status = doctor_evaluate(project_key, mock=mock)
    (out_dir / "doctor.json").write_text(json.dumps(doctor_status, indent=2), encoding="utf-8")

    redacted = _redact_project(project)
    (out_dir / "redacted_project.json").write_text(json.dumps(redacted, indent=2), encoding="utf-8")

    env_doc = _env_required_doc(env_map)
    (out_dir / "env_required.md").write_text(env_doc, encoding="utf-8")

    rules, limits = _load_rules(manifest)
    rules_payload = {
        "limits": limits,
        "rules": [rule.__dict__ for rule in rules],
    }
    (out_dir / "resolved_rules.json").write_text(json.dumps(rules_payload, indent=2), encoding="utf-8")
    (out_dir / "resolved_rules.yaml").write_text(yaml.safe_dump(rules_payload, sort_keys=False), encoding="utf-8")

    template_manifest = {
        "defaults": manifest.get("defaults", {}),
        "templates": manifest.get("paths", {}).get("templates", {}),
        "selected": _template_selection(manifest, language),
    }
    (out_dir / "template_manifest.json").write_text(json.dumps(template_manifest, indent=2), encoding="utf-8")

    run_trace = _resolve_run_trace(project, month, language)
    (out_dir / "run_trace.json").write_text(json.dumps(run_trace, indent=2), encoding="utf-8")

    return out_dir


def _steps_overview(enabled_sources: list[str]) -> list[str]:
    sources = ", ".join(enabled_sources) if enabled_sources else "none"
    return [
        "load manifest",
        "load project",
        "validate contracts",
        f"extract sources: {sources}",
        "build payload",
        "evaluate actions",
        "render template",
        "write outputs",
    ]


def _redact_project(project: dict[str, Any]) -> dict[str, Any]:
    def redact_value(key: str, value: Any) -> Any:
        if isinstance(value, str) and any(token in key.lower() for token in ["token", "password", "key", "secret", "credential"]):
            return "<REDACTED>"
        return value

    def walk(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: walk(redact_value(k, v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [walk(item) for item in obj]
        return obj

    return walk(project)


def _env_required_doc(env_map: dict[str, list[str]]) -> str:
    lines = ["# Required env vars", "", "(present/missing only; values redacted)", ""]
    for source, keys in env_map.items():
        lines.append(f"## {source}")
        for key in keys:
            present = bool(os.environ.get(key, ""))
            status = "present" if present else "missing"
            lines.append(f"- {key}: {status}")
        lines.append("")
    return "\n".join(lines)


def _resolve_run_trace(project: dict[str, Any], month: str, language: str) -> dict[str, Any]:
    policy = load_policy()
    resolution = resolve_period(policy, month, language)
    output_dir = _output_dir(project, resolution.period, language)
    trace_path = output_dir / "run_trace.json"
    if trace_path.exists():
        return json.loads(trace_path.read_text(encoding="utf-8"))

    return {
        "status": "missing",
        "note": "run_trace.json not found; run generate to produce it",
        "expected_path": str(trace_path),
    }
