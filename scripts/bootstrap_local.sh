#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="${HOME}/seo-reporting-workspace"
PROJECT_KEY="${1:-client_abc}"

mkdir -p "${WORKSPACE}/projects/${PROJECT_KEY}"
mkdir -p "${WORKSPACE}/reports/${PROJECT_KEY}"

cp "${REPO_ROOT}/examples/project_pack/sample_project.json" \
  "${WORKSPACE}/projects/${PROJECT_KEY}/project.json"

export PROJECT_KEY="${PROJECT_KEY}"
python - <<'PY'
import json
from pathlib import Path
project_key = __import__("os").environ.get("PROJECT_KEY", "client_abc")
p = Path.home() / "seo-reporting-workspace" / "projects" / project_key / "project.json"
data = json.loads(p.read_text(encoding="utf-8"))
data["project_key"] = project_key
data["output_path"] = str(Path.home() / "seo-reporting-workspace" / "reports" / project_key)
p.write_text(json.dumps(data, indent=2), encoding="utf-8")
print("OK: project.json ready at:", p)
print("OK: output_path:", data["output_path"])
PY
