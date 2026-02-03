from __future__ import annotations

import json
import os
from typing import Any

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from app.core.time_utils import parse_period
from app.extractors.base import RunContext, write_raw
from app.utils.fixtures import load_fixture


GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
GSC_ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites/{site_url}/searchAnalytics/query"


def _load_credentials() -> service_account.Credentials:
    mode = os.environ.get("GSC_AUTH_MODE", "service_account").strip()
    if mode != "service_account":
        raise RuntimeError("GSC_AUTH_MODE oauth not implemented yet")
    raw = os.environ.get("GSC_CREDENTIALS_JSON", "").strip()
    if not raw:
        raise RuntimeError("GSC_CREDENTIALS_JSON missing")
    if os.path.exists(raw):
        info = json.loads(open(raw, "r", encoding="utf-8").read())
    else:
        info = json.loads(raw)
    return service_account.Credentials.from_service_account_info(info, scopes=GSC_SCOPES)


def _post(site_url: str, payload: dict[str, Any]) -> dict[str, Any]:
    creds = _load_credentials()
    creds.refresh(Request())
    headers = {"Authorization": f"Bearer {creds.token}"}
    url = GSC_ENDPOINT.format(site_url=site_url)
    res = requests.post(url, json=payload, headers=headers, timeout=60)
    res.raise_for_status()
    return res.json()


def fetch(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    if ctx.mock:
        return load_fixture("gsc")

    site_url = project["sources"]["gsc"]["property"]
    period = parse_period(ctx.period)
    start_date = period.start.isoformat()
    end_date = period.end.isoformat()

    kpis_payload = {
        "startDate": start_date,
        "endDate": end_date,
    }
    kpis = _post(site_url, kpis_payload)

    pages_payload = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["page"],
        "rowLimit": 250,
    }
    pages = _post(site_url, pages_payload)

    queries_payload = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["query"],
        "rowLimit": 250,
    }
    queries = _post(site_url, queries_payload)

    return {
        "raw": {
            "kpis": kpis,
            "pages": pages,
            "queries": queries,
        }
    }


def run(project: dict[str, Any], ctx: RunContext) -> dict[str, Any]:
    data = fetch(project, ctx)
    write_raw("gsc", ctx, data)
    return data
