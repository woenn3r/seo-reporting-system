from __future__ import annotations

import re
import sys
from pathlib import Path


PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"AIza[0-9A-Za-z\-_]{20,}"),
    re.compile(r"ya29\.[0-9A-Za-z\-_]+"),
    re.compile(r"xox[baprs]-[0-9A-Za-z-]+"),
]


def main() -> None:
    root = Path(".")
    errors = []
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        if any(part.startswith(".git") for part in path.parts):
            continue
        if "secrets" in path.parts:
            continue
        if path.name.startswith(".env"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for pattern in PATTERNS:
            if pattern.search(text):
                errors.append(f"Potential secret in {path}")
                break
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print("OK: no obvious secrets detected")


if __name__ == "__main__":
    main()
