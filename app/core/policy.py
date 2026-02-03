from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import yaml

from app.core.config import REPO_ROOT
from app.core.time_utils import iter_months, parse_period


POLICY_PATH = REPO_ROOT / "configs" / "system" / "reporting_policy_v1.yaml"


@dataclass(frozen=True)
class PeriodResolution:
    period: str
    warning: str | None


def load_policy() -> dict[str, Any]:
    if not POLICY_PATH.exists():
        raise FileNotFoundError(f"policy missing: {POLICY_PATH}")
    return yaml.safe_load(POLICY_PATH.read_text(encoding="utf-8"))


def resolve_period(policy: dict[str, Any], month_arg: str, language: str) -> PeriodResolution:
    if month_arg != "auto":
        parse_period(month_arg)
        return PeriodResolution(period=month_arg, warning=None)

    tz = policy.get("timezone", "UTC")
    now = datetime.now(ZoneInfo(tz))
    year = now.year
    month = now.month - 1
    if month == 0:
        month = 12
        year -= 1
    period = f"{year}-{month:02d}"

    warn_day = policy.get("period_rules", {}).get("auto_behavior", {}).get("warn_if_today_before_day", 5)
    warning = None
    if now.day < warn_day:
        key = "warning_message_de" if language == "de" else "warning_message_en"
        warning = policy.get("period_rules", {}).get("auto_behavior", {}).get(key)
    return PeriodResolution(period=period, warning=warning)


def iter_periods(from_month: str, to_month: str) -> list[str]:
    return iter_months(from_month, to_month)
