from __future__ import annotations

import json
from pathlib import Path

import typer

from app.core.config import load_env, settings
from app.core.manifest import load_manifest, validate_manifest
from app.core.policy import load_policy, resolve_period, iter_periods
from app.core.doctor import run as doctor_run
from app.core.project import (
    prompt_project,
    write_project,
    project_path,
    build_project_payload,
    ensure_output_path_writable,
)
from app.core.registry import load_sources_registry
from app.core.pipeline import run as generate_run
from app.core.ops_insurance import snapshot as snapshot_run, explain_plan, audit_export

app = typer.Typer(help="SEO report generator CLI")


@app.callback(invoke_without_command=True)
def _init(ctx: typer.Context) -> None:
    load_env(settings().env_dir)
    manifest = load_manifest()
    validate_manifest(manifest)
    ctx.obj = {"manifest": manifest}


@app.command()
def doctor(
    project: str | None = typer.Option(None, help="Project key to validate"),
    mock: bool = typer.Option(False, help="Skip secrets checks (for mock mode)"),
) -> None:
    doctor_run(project, mock=mock)


@app.command("add-project")
def add_project(
    key: str | None = typer.Option(None, "--key", help="Project key"),
    client_name: str | None = typer.Option(None, "--client-name", help="Client name"),
    domain: str | None = typer.Option(None, "--domain", help="Domain (example.com)"),
    canonical_origin: str | None = typer.Option(
        None, "--canonical-origin", help="Canonical origin (https://www.example.com)"
    ),
    output_path: str | None = typer.Option(None, "--output-path", help="Output path root"),
    lang: str | None = typer.Option(None, "--lang", help="Report language (de|en)"),
    enable_source: str | None = typer.Option(
        None, "--enable-source", help="Comma list: gsc,pagespeed,crux,dataforseo,rybbit"
    ),
) -> None:
    if not key:
        payload = prompt_project()
        path = write_project(payload["project_key"], payload)
        typer.secho(f"Project created: {path}", fg=typer.colors.GREEN)
        return

    if not domain or not canonical_origin:
        typer.secho("ERROR: --domain and --canonical-origin are required with --key", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    enable_list = []
    if enable_source:
        enable_list = [item.strip() for item in enable_source.split(",") if item.strip()]
        registry_sources = set(load_sources_registry().get("sources", {}).keys())
        unknown = [item for item in enable_list if item not in registry_sources]
        if unknown:
            typer.secho(
                f"WARNING: unknown sources ignored: {', '.join(unknown)}",
                fg=typer.colors.YELLOW,
            )
            enable_list = [item for item in enable_list if item in registry_sources]

    payload = build_project_payload(
        project_key=key,
        client_name=client_name,
        domain=domain,
        canonical_origin=canonical_origin,
        output_path=output_path,
        report_language=lang,
        enabled_sources=enable_list,
    )
    try:
        ensure_output_path_writable(Path(payload["output_path"]).expanduser())
    except ValueError as exc:
        typer.secho(f"ERROR: {exc}", fg=typer.colors.RED)
        typer.secho(
            f"Hint: use --output-path {Path.home() / 'seo-reporting-workspace' / 'reports' / key}",
            fg=typer.colors.YELLOW,
        )
        raise typer.Exit(code=1)
    path = write_project(payload["project_key"], payload)
    typer.secho(f"Project created: {path}", fg=typer.colors.GREEN)


@app.command()
def generate(
    project: str | None = typer.Option(None, help="Project key"),
    all: bool = typer.Option(False, "--all", help="Generate for all projects"),
    month: str = typer.Option(..., help="YYYY-MM or auto"),
    mock: bool = typer.Option(False, help="Use mock fixtures instead of live APIs"),
    lang: str | None = typer.Option(None, "--lang", help="Override report language (de|en)"),
) -> None:
    policy = load_policy()

    if all:
        projects_dir = settings().workspace_dir / "projects"
        if not projects_dir.exists():
            raise typer.Exit(code=1)
        for project_dir in sorted(projects_dir.iterdir()):
            path = project_dir / "project.json"
            if not path.exists():
                continue
            project_lang = lang
            if not project_lang:
                try:
                    project_lang = json.loads(path.read_text(encoding="utf-8")).get("report_language", "de")
                except json.JSONDecodeError:
                    project_lang = "de"
            resolution = resolve_period(policy, month, project_lang)
            if resolution.warning:
                typer.secho(resolution.warning, fg=typer.colors.YELLOW)
            output_dir = generate_run(path, resolution.period, mock=mock, lang_override=lang)
            typer.secho(f"Report generated: {output_dir}", fg=typer.colors.GREEN)
        return

    if not project:
        raise typer.Exit(code=1)
    path = project_path(project)
    if not path.exists():
        raise typer.Exit(code=1)
    project_lang = lang
    if not project_lang:
        try:
            project_lang = json.loads(path.read_text(encoding="utf-8")).get("report_language", "de")
        except json.JSONDecodeError:
            project_lang = "de"
    resolution = resolve_period(policy, month, project_lang)
    if resolution.warning:
        typer.secho(resolution.warning, fg=typer.colors.YELLOW)
    output_dir = generate_run(path, resolution.period, mock=mock, lang_override=lang)
    typer.secho(f"Report generated: {output_dir}", fg=typer.colors.GREEN)


@app.command()
def backfill(
    project: str = typer.Option(..., help="Project key"),
    from_month: str = typer.Option(..., "--from", help="YYYY-MM start"),
    to_month: str = typer.Option(..., "--to", help="YYYY-MM end"),
    mock: bool = typer.Option(False, help="Use mock fixtures instead of live APIs"),
    lang: str | None = typer.Option(None, "--lang", help="Override report language (de|en)"),
) -> None:
    months = iter_periods(from_month, to_month)
    path = project_path(project)
    if not path.exists():
        raise typer.Exit(code=1)
    for period in months:
        output_dir = generate_run(path, period, mock=mock, lang_override=lang)
        typer.secho(f"Report generated: {output_dir}", fg=typer.colors.GREEN)


@app.command()
def snapshot(
    project: str = typer.Option(..., help="Project key"),
<<<<<<< HEAD
    month: str | None = typer.Option(None, help="YYYY-MM (optional)"),
    lang: str = typer.Option("de", "--lang", help="Report language (de|en)"),
    out: str = typer.Option("snapshot.json", "--out", help="Output file path"),
    mock: bool = typer.Option(False, help="Skip connectivity checks"),
) -> None:
    out_path = Path(out)
    if out_path.is_dir():
        out_path = out_path / "snapshot.json"
    snapshot_run(project, month, lang, out_path, mock=mock)
=======
    month: str | None = typer.Option(None, help="YYYY-MM or auto"),
    lang: str = typer.Option("de", "--lang", help="Report language (de|en)"),
    out: str = typer.Option("snapshot.json", "--out", help="Output file or directory"),
) -> None:
    out_path = Path(out)
    if out_path.is_dir() or out_path.suffix == "":
        out_path = out_path / "snapshot.json"
    snapshot_run(project, month, lang, out_path, mock=True)
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
    typer.secho(f"Snapshot written: {out_path}", fg=typer.colors.GREEN)


@app.command()
def explain(
    project: str = typer.Option(..., help="Project key"),
    month: str = typer.Option(..., help="YYYY-MM or auto"),
    lang: str = typer.Option("de", "--lang", help="Report language (de|en)"),
<<<<<<< HEAD
) -> None:
    result = explain_plan(project, month, lang)
=======
    out: str | None = typer.Option(None, "--out", help="Write explain.txt to file"),
) -> None:
    out_path = None
    if out:
        out_path = Path(out)
        if out_path.is_dir() or out_path.suffix == "":
            out_path = out_path / "explain.txt"
    result = explain_plan(project, month, lang, out_path=out_path)
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
    typer.echo(result.text)


@app.command("audit-export")
def audit_export_cmd(
    project: str = typer.Option(..., help="Project key"),
    month: str = typer.Option(..., help="YYYY-MM or auto"),
    lang: str = typer.Option("de", "--lang", help="Report language (de|en)"),
<<<<<<< HEAD
    out: str = typer.Option("audit_bundle", "--out", help="Output directory"),
    mock: bool = typer.Option(False, help="Skip connectivity checks"),
) -> None:
    out_dir = Path(out)
    audit_export(project, month, lang, out_dir, mock=mock)
    typer.secho(f"Audit bundle written: {out_dir}", fg=typer.colors.GREEN)
=======
    out: str | None = typer.Option(None, "--out", help="Output directory"),
) -> None:
    out_dir = Path(out) if out else None
    bundle_dir = audit_export(project, month, lang, out_dir)
    typer.secho(f"Audit bundle written: {bundle_dir}", fg=typer.colors.GREEN)
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
