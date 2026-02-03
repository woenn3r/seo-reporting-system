from __future__ import annotations

import os
from typing import Any

import requests

from app.extractors.base import RunContext, write_raw
from app.utils.fixtures import load_fixture


PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def fetch(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    if ctx.mock:
        return load_fixture("pagespeed")

    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY missing")

    url = project.get("canonical_origin")
    results: dict[str, Any] = {}
    for strategy in ("mobile", "desktop"):
        params = {"url": url, "strategy": strategy, "key": api_key}
        res = requests.get(PSI_ENDPOINT, params=params, timeout=60)
        res.raise_for_status()
        results[strategy] = res.json()
    return results


def run(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    data = fetch(project, ctx)
    write_raw("pagespeed", ctx, data)
    return data
