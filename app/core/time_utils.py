from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import calendar


@dataclass(frozen=True)
class MonthRange:
    year: int
    month: int
    start: date
    end: date


def month_range(year: int, month: int) -> MonthRange:
    if month < 1 or month > 12:
        raise ValueError("month must be 1-12")
    start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day)
    return MonthRange(year=year, month=month, start=start, end=end)


def parse_period(period: str) -> MonthRange:
    parts = period.split("-")
    if len(parts) != 2:
        raise ValueError("period must be YYYY-MM")
    year = int(parts[0])
    month = int(parts[1])
    return month_range(year, month)


def prev_period(period: str) -> str:
    mr = parse_period(period)
    if mr.month == 1:
        return f"{mr.year - 1}-12"
    return f"{mr.year}-{mr.month - 1:02d}"


def next_period(period: str) -> str:
    mr = parse_period(period)
    if mr.month == 12:
        return f"{mr.year + 1}-01"
    return f"{mr.year}-{mr.month + 1:02d}"


def iter_months(start: str, end: str) -> list[str]:
    parse_period(start)
    parse_period(end)
    months = [start]
    cursor = start
    while cursor != end:
        cursor = next_period(cursor)
        months.append(cursor)
    return months
