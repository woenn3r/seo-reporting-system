from __future__ import annotations

import sys

from app.core.manifest import load_manifest, validate_manifest


def main() -> None:
    manifest = load_manifest()
    validate_manifest(manifest)
    print("OK: manifest validated")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
