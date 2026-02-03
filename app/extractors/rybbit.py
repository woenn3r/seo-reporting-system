from __future__ import annotations

import os
from typing import Any

import requests

from app.core.time_utils import parse_period
from app.extractors.base import RunContext, write_raw
from app.utils.fixtures import load_fixture


DEFAULT_BASE = ""


def fetch(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    if ctx.mock:
        return load_fixture("rybbit")

    token = os.environ.get("RYBBIT_API_KEY", "").strip()
    if not token:
        raise RuntimeError("RYBBIT_API_KEY missing")
    base = os.environ.get("RYBBIT_API_BASE", DEFAULT_BASE).strip()
    if not base:
        raise RuntimeError("RYBBIT_API_BASE missing")

    site_id = project.get("sources", {}).get("rybbit", {}).get("site_id")
    if not site_id:
        raise RuntimeError("sources.rybbit.site_id missing")

    period = parse_period(ctx.period)
    params = {"from": period.start.isoformat(), "to": period.end.isoformat()}
    url = f"{base.rstrip('/')}/sites/{site_id}/stats"
    res = requests.get(url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    res.raise_for_status()
    return res.json()


def run(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    data = fetch(project, ctx)
    write_raw("rybbit", ctx, data)
    return data
