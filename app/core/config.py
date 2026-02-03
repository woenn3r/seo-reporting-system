from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    workspace_dir: Path
    env_dir: Path


def load_env(env_dir: Path | None = None) -> None:
    """Load .env files from repo root and secrets directory (local only)."""
    load_dotenv(REPO_ROOT / ".env", override=False)

    env_dir = env_dir or (REPO_ROOT / "secrets")
    if not env_dir.exists():
        return
    for env_file in sorted(env_dir.glob("*.env")):
        load_dotenv(env_file, override=False)


def resolve_workspace() -> Path:
    from os import environ

    raw = environ.get("SEO_REPORT_WORKSPACE", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return Path.home().joinpath("seo-reporting-workspace").resolve()


def settings() -> Settings:
    env_dir = REPO_ROOT / "secrets"
    return Settings(workspace_dir=resolve_workspace(), env_dir=env_dir)


def ensure_dirs(paths: Iterable[Path]) -> None:
    for p in paths:
        p.mkdir(parents=True, exist_ok=True)
