from __future__ import annotations

from pathlib import Path
from typing import Any

import duckdb

from app.core.config import settings, ensure_dirs


def _db_path() -> Path:
    path = settings().workspace_dir / "lake" / "warehouse.duckdb"
    ensure_dirs([path.parent])
    return path


def store_gsc(project_key: str, period: str, mart: dict[str, Any]) -> None:
    path = _db_path()
    con = duckdb.connect(str(path))
    con.execute(
        "CREATE TABLE IF NOT EXISTS gsc_kpis (project_key TEXT, period TEXT, clicks DOUBLE, impressions DOUBLE, ctr DOUBLE, avg_position DOUBLE)"
    )
    con.execute(
        "INSERT INTO gsc_kpis VALUES (?, ?, ?, ?, ?, ?)",
        [
            project_key,
            period,
            mart.get("kpis", {}).get("clicks"),
            mart.get("kpis", {}).get("impressions"),
            mart.get("kpis", {}).get("ctr"),
            mart.get("kpis", {}).get("avg_position"),
        ],
    )

    con.execute(
        "CREATE TABLE IF NOT EXISTS gsc_top_pages (project_key TEXT, period TEXT, url TEXT, clicks DOUBLE, impressions DOUBLE)"
    )
    for row in mart.get("top_pages", []):
        con.execute(
            "INSERT INTO gsc_top_pages VALUES (?, ?, ?, ?, ?)",
            [project_key, period, row.get("url"), row.get("clicks"), row.get("impressions")],
        )

    con.execute(
        "CREATE TABLE IF NOT EXISTS gsc_top_queries (project_key TEXT, period TEXT, query TEXT, clicks DOUBLE, impressions DOUBLE)"
    )
    for row in mart.get("top_queries", []):
        con.execute(
            "INSERT INTO gsc_top_queries VALUES (?, ?, ?, ?, ?)",
            [project_key, period, row.get("query"), row.get("clicks"), row.get("impressions")],
        )

    con.close()
