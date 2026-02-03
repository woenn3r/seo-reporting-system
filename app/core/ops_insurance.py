from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import REPO_ROOT
from app.core.manifest import load_manifest, required_env_vars
from app.core.policy import load_policy, resolve_period
from app.core.project import project_path
from app.core.registry import load_sources_registry


@dataclass(frozen=True)
class ExplainResult:
    text: str
    output_path: Path | None


def _git_commit() -> str | None:
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


def _repo_version() -> str | None:
    pyproject = REPO_ROOT / "pyproject.toml"
    if not pyproject.exists():
        return None
    for line in pyproject.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("version"):
            parts = line.split("=", 1)
            if len(parts) == 2:
                return parts[1].strip().strip('"')
    return None


def _output_dir(project: dict[str, Any], period: str, language: str | None) -> Path:
    output_root = Path(project["output_path"]).expanduser().resolve()
    if language:
        return output_root / period / language
    return output_root / period


def _template_selection(manifest: dict[str, Any], language: str) -> dict[str, Any]:
    mapping = manifest.get("defaults", {}).get("template_by_language", {})
    template_key = mapping.get(language)
    templates = manifest.get("paths", {}).get("templates", {})
    return {
        "template_key": template_key,
        "template_path": templates.get(template_key),
        "lang": language,
    }


def _period_resolution(policy: dict[str, Any], month: str, language: str) -> dict[str, Any]:
    resolution = resolve_period(policy, month, language)
    reasoning = None
    if month == "auto":
        tz = policy.get("timezone", "UTC")
        warn_day = policy.get("period_rules", {}).get("auto_behavior", {}).get("warn_if_today_before_day", 5)
        reasoning = f"auto => previous month based on timezone {tz}, warn_if_today_before_day {warn_day}"
    return {
        "input": month,
        "resolved": resolution.period,
        "warning": resolution.warning,
        "reasoning": reasoning,
    }


def _effective_project(project: dict[str, Any]) -> dict[str, Any]:
    effective = dict(project)
    effective["output_path"] = str(Path(project["output_path"]).expanduser().resolve())
    return effective


def _sources_status(project: dict[str, Any], env_map: dict[str, list[str]]) -> list[dict[str, Any]]:
    registry = load_sources_registry()
    sources = []
    for name in sorted(registry.get("sources", {}).keys()):
        enabled = bool(project.get("sources", {}).get(name, {}).get("enabled", False))
        required = env_map.get(name, [])
        sources.append(
            {
                "source": name,
                "enabled": enabled,
                "required_env_vars": required,
            }
        )
    return sources


def _doctor_expectations(project: dict[str, Any], env_map: dict[str, list[str]]) -> list[dict[str, Any]]:
    checks = {
        "gsc": "list accessible sites",
        "pagespeed": "runPagespeed (single request)",
        "crux": "queryHistoryRecord (single request)",
        "dataforseo": "user_data endpoint",
        "rybbit": "me endpoint",
    }
    rows = []
    for source, keys in env_map.items():
        enabled = bool(project.get("sources", {}).get(source, {}).get("enabled", False))
        rows.append(
            {
                "source": source,
                "configured": enabled,
                "secrets_required": keys,
                "connectivity_check": checks.get(source, "n/a"),
            }
        )
    return rows


def _pipeline_steps(
    period: str | None,
    language: str | None,
    mock: bool,
    output_dir: Path | None,
) -> list[dict[str, Any]]:
    outputs = []
    if output_dir and period:
        outputs = [
            str(output_dir / "report.md"),
            str(output_dir / "report_payload.json"),
            str(output_dir / "actions_debug.json"),
            str(output_dir / "notion_fields.md"),
            str(output_dir / "template_trace.json"),
            str(output_dir / "run_trace.json"),
        ]
    return [
        {"name": "load manifest", "inputs": ["configs/system/system_manifest_v1.yaml"], "outputs": [], "mode": "mock" if mock else "real"},
        {"name": "load project", "inputs": ["workspace/projects/<project_key>/project.json"], "outputs": [], "mode": "mock" if mock else "real"},
        {"name": "extract sources", "inputs": ["enabled sources"], "outputs": [], "mode": "mock" if mock else "real"},
        {"name": "build payload", "inputs": ["raw marts"], "outputs": [], "mode": "mock" if mock else "real"},
        {"name": "evaluate actions", "inputs": ["payload", "rules"], "outputs": [], "mode": "mock" if mock else "real"},
        {"name": "render template", "inputs": ["template", "payload"], "outputs": [], "mode": "mock" if mock else "real"},
        {"name": "write outputs", "inputs": [], "outputs": outputs, "mode": "mock" if mock else "real"},
    ]


def snapshot(
    project_key: str,
    month: str | None,
    language: str,
    out_path: Path,
    mock: bool = False,
) -> Path:
    manifest = load_manifest()
    env_map = required_env_vars(manifest)
    project = json.loads(project_path(project_key).read_text(encoding="utf-8"))
    effective_project = _effective_project(project)

    period_resolution = None
    output_dir = None
    policy = load_policy()
    if month:
        period_resolution = _period_resolution(policy, month, language)
        output_dir = _output_dir(effective_project, period_resolution["resolved"], language)

    template = _template_selection(manifest, language)
    rules_path = manifest.get("paths", {}).get("rules", {}).get("actions_v1")

    data = {
        "meta": {
            "repo_version": _repo_version(),
            "git_commit": _git_commit(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "manifest_version": manifest.get("version"),
        },
        "project": effective_project,
        "period_resolution": period_resolution,
        "sources": _sources_status(effective_project, env_map),
        "doctor_expectations": _doctor_expectations(effective_project, env_map),
        "templates": template,
        "rulesets": {
            "files": [rules_path],
            "thresholds": effective_project.get("thresholds", {}),
        },
        "pipeline": _pipeline_steps(
            period_resolution["resolved"] if period_resolution else None,
            language,
            mock,
            output_dir,
        ),
        "output_layout": {
            "output_dir": str(output_dir) if output_dir else None,
            "lang": language,
        },
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return out_path


def explain_plan(
    project_key: str,
    month: str,
    language: str,
    out_path: Path | None = None,
) -> ExplainResult:
    manifest = load_manifest()
    env_map = required_env_vars(manifest)
    project = json.loads(project_path(project_key).read_text(encoding="utf-8"))
    effective_project = _effective_project(project)
    policy = load_policy()
    period_resolution = _period_resolution(policy, month, language)
    output_dir = _output_dir(effective_project, period_resolution["resolved"], language)
    template = _template_selection(manifest, language)

    enabled_sources = [
        name for name, cfg in effective_project.get("sources", {}).items() if cfg.get("enabled")
    ]
    disabled_sources = [
        name for name, cfg in effective_project.get("sources", {}).items() if not cfg.get("enabled")
    ]

    lines = [
        f"Project: {project_key}",
        f"Month input: {month}",
        f"Resolved period: {period_resolution['resolved']}",
    ]
    if period_resolution.get("warning"):
        lines.append(f"Warning: {period_resolution['warning']}")
    if period_resolution.get("reasoning"):
        lines.append(f"Reasoning: {period_resolution['reasoning']}")

    lines.extend(
        [
            f"Language: {language}",
            f"Output layout: {output_dir}",
            "Overwrite policy: each run overwrites files in the same <period>/<lang> folder",
            f"Template: {template.get('template_key')} ({template.get('template_path')})",
            "Output files: report.md, report_payload.json, actions_debug.json, notion_fields.md, template_trace.json, run_trace.json",
            f"Enabled sources: {', '.join(enabled_sources) if enabled_sources else 'none'}",
            f"Disabled sources: {', '.join(disabled_sources) if disabled_sources else 'none'}",
            "Required env vars per enabled source:",
        ]
    )

    for source in enabled_sources:
        keys = env_map.get(source, [])
        lines.append(f"- {source}: {', '.join(keys) if keys else 'none'}")

    text = "\n".join(lines)
    if out_path:
        out_path.write_text(text, encoding="utf-8")
    return ExplainResult(text=text, output_path=out_path)


def audit_export(
    project_key: str,
    month: str,
    language: str,
    out_dir: Path | None,
    mock: bool = False,
) -> Path:
    manifest = load_manifest()
    env_map = required_env_vars(manifest)
    project = json.loads(project_path(project_key).read_text(encoding="utf-8"))
    effective_project = _effective_project(project)
    policy = load_policy()
    period_resolution = _period_resolution(policy, month, language)
    output_dir = _output_dir(effective_project, period_resolution["resolved"], language)

    bundle_dir = out_dir or (output_dir / "audit_bundle")
    bundle_dir.mkdir(parents=True, exist_ok=True)

    snapshot(
        project_key,
        month,
        language,
        bundle_dir / "snapshot.json",
        mock=mock,
    )

    explain_plan(project_key, month, language, out_path=bundle_dir / "explain.txt")

    doctor = _doctor_status_expected(effective_project, env_map, mock=mock)
    (bundle_dir / "doctor.json").write_text(json.dumps(doctor, indent=2), encoding="utf-8")

    redacted = _redact_project(effective_project)
    (bundle_dir / "redacted_project.json").write_text(json.dumps(redacted, indent=2), encoding="utf-8")

    env_doc = _env_required_doc(env_map, effective_project)
    (bundle_dir / "env_required.md").write_text(env_doc, encoding="utf-8")

    rules_path = manifest.get("paths", {}).get("rules", {}).get("actions_v1")
    rules_payload = {
        "rules_files": [rules_path],
        "thresholds": effective_project.get("thresholds", {}),
    }
    (bundle_dir / "resolved_rules.json").write_text(json.dumps(rules_payload, indent=2), encoding="utf-8")

    template_manifest = {
        "templates": manifest.get("paths", {}).get("templates", {}),
        "selected": _template_selection(manifest, language),
    }
    (bundle_dir / "template_manifest.json").write_text(
        json.dumps(template_manifest, indent=2), encoding="utf-8")

    run_trace_path = output_dir / "run_trace.json"
    if run_trace_path.exists():
        bundle_dir.joinpath("run_trace.json").write_text(
            run_trace_path.read_text(encoding="utf-8"), encoding="utf-8"
        )
    else:
        planned = {
            "status": "planned",
            "steps": _pipeline_steps(period_resolution["resolved"], language, mock, output_dir),
            "artifacts": [
                str(output_dir / "report.md"),
                str(output_dir / "report_payload.json"),
                str(output_dir / "actions_debug.json"),
                str(output_dir / "notion_fields.md"),
                str(output_dir / "template_trace.json"),
            ],
        }
        (bundle_dir / "run_trace.json").write_text(json.dumps(planned, indent=2), encoding="utf-8")

    for name in ["actions_debug.json", "template_trace.json"]:
        src = output_dir / name
        dst = bundle_dir / name
        if src.exists():
            dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            dst.write_text(json.dumps({"status": "missing", "expected_path": str(src)}, indent=2), encoding="utf-8")

    return bundle_dir


def _doctor_status_expected(
    project: dict[str, Any],
    env_map: dict[str, list[str]],
    mock: bool,
) -> dict[str, Any]:
    rows = []
    for source, keys in env_map.items():
        enabled = bool(project.get("sources", {}).get(source, {}).get("enabled", False))
        present = {key: bool(os.environ.get(key, "")) for key in keys}
        rows.append(
            {
                "source": source,
                "configured": enabled,
                "secrets_present": all(present.values()) if enabled else False,
                "connectivity": "NOT_RUN",
                "required_env_vars": keys,
                "present": present,
            }
        )
    return {"project_key": project.get("project_key"), "mock": mock, "sources": rows}


def _redact_project(project: dict[str, Any]) -> dict[str, Any]:
    def redact_value(key: str, value: Any) -> Any:
        if isinstance(value, str) and any(token in key.lower() for token in ["token", "password", "key", "secret", "credential"]):
            return "<REDACTED>"
        if isinstance(value, str) and _looks_like_secret(value):
            return "<REDACTED>"
        return value

    def walk(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: walk(redact_value(k, v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [walk(item) for item in obj]
        return obj

    return walk(project)


def _looks_like_secret(value: str) -> bool:
    lowered = value.lower()
    if "private_key" in lowered or "client_secret" in lowered:
        return True
    if "-----begin" in lowered:
        return True
    if len(value) > 64 and any(ch.isdigit() for ch in value) and any(ch.isalpha() for ch in value):
        return True
    return False


def _env_required_doc(env_map: dict[str, list[str]], project: dict[str, Any]) -> str:
    lines = ["# Required env vars", "", "Set in .env (repo root) or secrets/*.env", ""]
    for source, keys in env_map.items():
        enabled = bool(project.get("sources", {}).get(source, {}).get("enabled", False))
        if not enabled:
            continue
        lines.append(f"## {source}")
        for key in keys:
            lines.append(f"- {key}")
        lines.append("")
    return "\n".join(lines)
