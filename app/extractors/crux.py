from __future__ import annotations

import os
from typing import Any

import requests

from app.extractors.base import RunContext, write_raw
from app.utils.fixtures import load_fixture


CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord"


def fetch(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    if ctx.mock:
        return load_fixture("crux")

    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY missing")

    url = project.get("canonical_origin")
    payload = {"origin": url}
    res = requests.post(f"{CRUX_ENDPOINT}?key={api_key}", json=payload, timeout=60)
    res.raise_for_status()
    return res.json()


def run(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    data = fetch(project, ctx)
    write_raw("crux", ctx, data)
    return data
