from __future__ import annotations

from typing import Any

from jinja2 import Environment, FileSystemLoader

from app.core.config import REPO_ROOT
from app.core.manifest import load_manifest, template_for_language


def render_report(payload: dict[str, Any]) -> str:
    manifest = load_manifest()
    language = payload.get("meta", {}).get("report_language", "de")
    template_path = template_for_language(manifest, language)

    env = Environment(
        loader=FileSystemLoader(str(REPO_ROOT)),
        autoescape=False,
    )

    template = env.get_template(str(template_path.relative_to(REPO_ROOT)))
    return template.render(**payload)
