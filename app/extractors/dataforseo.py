from __future__ import annotations

import os
from typing import Any

import requests

from app.core.locations import load_locations_set
from app.extractors.base import RunContext, write_raw
from app.utils.fixtures import load_fixture


DEFAULT_BASE = "https://api.dataforseo.com"


def _auth() -> tuple[str, str]:
    login = os.environ.get("DATAFORSEO_LOGIN", "").strip()
    password = os.environ.get("DATAFORSEO_PASSWORD", "").strip()
    if not login or not password:
        raise RuntimeError("DATAFORSEO_LOGIN/PASSWORD missing")
    return login, password


def fetch(project: dict[str, Any], ctx: RunContext, keywords: list[str]) -> dict[str, Any]:
    if ctx.mock:
        return load_fixture("dataforseo")

    locations_set = project["sources"]["dataforseo"]["locations_set"]
    locations = load_locations_set(locations_set).get("locations", [])
    if not locations:
        raise RuntimeError(f"locations_set empty: {locations_set}")

    base = os.environ.get("DATAFORSEO_API_BASE", DEFAULT_BASE)
    url = f"{base}/v3/serp/google/organic/live/advanced"

    tasks = []
    for kw in keywords:
        loc = locations[0]
        task = {
            "keyword": kw,
            "location_name": loc.get("location_name"),
            "language_code": loc.get("language_code", "en"),
            "device": project.get("sources", {}).get("dataforseo", {}).get("device_set", "desktop"),
            "depth": 100,
            "max_crawl_pages": 1,
            "search_engine": "google",
            "calculate_rectangles": False,
            "load_resources": False,
        }
        tasks.append(task)

    auth = _auth()
    res = requests.post(url, auth=auth, json=tasks, timeout=60)
    res.raise_for_status()
    return res.json()


def run(project: dict[str, Any], ctx: RunContext, keywords: list[str]) -> dict[str, Any]:
    data = fetch(project, ctx, keywords)
    write_raw("dataforseo", ctx, data)
    return data
