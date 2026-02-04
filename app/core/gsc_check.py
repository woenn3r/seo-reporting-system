from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from app.core.time_utils import parse_period


GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
GSC_SITES_ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites"
GSC_QUERY_ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites/{site_url}/searchAnalytics/query"


@dataclass(frozen=True)
class CheckResult:
    exit_code: int
    messages: list[str]


def run_gsc_check(project: dict[str, Any], month: str | None) -> CheckResult:
    messages: list[str] = []

    creds_info = _resolve_credentials()
    if not creds_info:
        return CheckResult(2, [
            "ERROR: missing GSC credentials (set GSC_AUTH_MODE and GSC_CREDENTIALS_JSON)",
        ])

    try:
        creds = service_account.Credentials.from_service_account_info(creds_info, scopes=GSC_SCOPES)
        creds.refresh(Request())
    except Exception:
        return CheckResult(2, [
            "ERROR: invalid GSC credentials (check GSC_CREDENTIALS_JSON path or JSON string)",
        ])

    token = creds.token
    if not token:
        return CheckResult(3, ["ERROR: could not obtain access token from GSC credentials"])

    headers = {"Authorization": f"Bearer {token}"}

    sites = _sites_list(headers)
    if not sites:
        return CheckResult(3, ["ERROR: sites.list failed (check service account access)"])
    messages.append("OK: sites.list reachable")

    site_urls = [s.get("siteUrl") for s in sites]
    configured = project.get("sources", {}).get("gsc", {}).get("property")
    if configured not in site_urls:
        hint = _property_mismatch_hint(configured, site_urls)
        return CheckResult(3, [
            f"ERROR: property not accessible: {configured}",
            hint,
            "Fix: add the service account email to that exact property in GSC",
        ])
    messages.append(f"OK: property accessible: {configured}")

    if month:
        try:
            period = parse_period(month)
            start_date = period.start.isoformat()
            end_date = period.end.isoformat()
        except Exception:
            return CheckResult(2, ["ERROR: invalid month format (expected YYYY-MM)"])

        ok = _search_analytics(headers, configured, start_date, end_date)
        if not ok:
            return CheckResult(3, ["ERROR: searchanalytics.query failed (check permissions)"])
        messages.append("OK: searchanalytics query reachable (rows may be empty)")

    messages.insert(0, "OK: credentials valid")
    return CheckResult(0, messages)


def _resolve_credentials() -> dict[str, Any] | None:
    mode = os.environ.get("GSC_AUTH_MODE", "service_account").strip()
    raw = os.environ.get("GSC_CREDENTIALS_JSON", "").strip()
    if not raw or mode != "service_account":
        return None

    path = Path(raw)
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _sites_list(headers: dict[str, str]) -> list[dict[str, Any]] | None:
    try:
        res = requests.get(GSC_SITES_ENDPOINT, headers=headers, timeout=30)
        res.raise_for_status()
        data = res.json()
        return data.get("siteEntry", [])
    except Exception:
        return None


def _search_analytics(headers: dict[str, str], site_url: str, start_date: str, end_date: str) -> bool:
    try:
        res = requests.post(
            GSC_QUERY_ENDPOINT.format(site_url=site_url),
            headers=headers,
            json={"startDate": start_date, "endDate": end_date},
            timeout=30,
        )
        res.raise_for_status()
        _ = res.json()
        return True
    except Exception:
        return False


def _property_mismatch_hint(configured: str, site_urls: list[str]) -> str:
    if configured.startswith("sc-domain:"):
        domain = configured.replace("sc-domain:", "")
        for url in site_urls:
            if url and domain in url:
                return "Hint: property mismatch (configured sc-domain vs url-prefix)"
        return "Hint: service account not added to that sc-domain property"
    if configured.startswith("http"):
        for url in site_urls:
            if url and url.startswith("sc-domain:"):
                return "Hint: property mismatch (configured url-prefix vs sc-domain)"
        return "Hint: service account not added to that url-prefix property"
    return "Hint: property not found in sites.list"
