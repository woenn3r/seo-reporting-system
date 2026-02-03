from __future__ import annotations

import json

import typer

from app.core.config import load_env, settings
from app.core.manifest import load_manifest, validate_manifest
from app.core.policy import load_policy, resolve_period, iter_periods
from app.core.doctor import run as doctor_run
from app.core.project import prompt_project, write_project, project_path
from app.core.pipeline import run as generate_run

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
def add_project() -> None:
    payload = prompt_project()
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
