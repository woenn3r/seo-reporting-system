from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

from app.core.config import REPO_ROOT
from app.render.report import render_report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--update-goldens", action="store_true")
    args = parser.parse_args()

    payload_path = REPO_ROOT / "examples" / "report_payload" / "sample_payload.json"
    payload = json.loads(payload_path.read_text(encoding="utf-8"))

    rendered = {}
    for lang, name in (("de", "sample_report_de.md"), ("en", "sample_report_en.md")):
        payload["meta"]["report_language"] = lang
        rendered[name] = render_report(payload)

    goldens_dir = REPO_ROOT / "examples" / "rendered"
    goldens_dir.mkdir(parents=True, exist_ok=True)

    if args.update_goldens:
        for name, content in rendered.items():
            (goldens_dir / name).write_text(content, encoding="utf-8")
        print("OK: goldens updated")
        return

    diffs = []
    for name, content in rendered.items():
        golden_path = goldens_dir / name
        if not golden_path.exists():
            diffs.append(f"Missing golden: {name}")
            continue
        golden = golden_path.read_text(encoding="utf-8")
        if golden != content:
            diff = difflib.unified_diff(
                golden.splitlines(),
                content.splitlines(),
                fromfile=f"golden/{name}",
                tofile=f"rendered/{name}",
                lineterm="",
            )
            diffs.append("\n".join(diff))

    if diffs:
        print("ERROR: render smoke test failed (golden diff)")
        print("\n\n".join(diffs))
        sys.exit(1)

    print("OK: render smoke test")


if __name__ == "__main__":
    main()
