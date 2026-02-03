#!/usr/bin/env bash
set -euo pipefail

# assumes venv is active
python -m unittest -v
python -m app.tools.validate_manifest
python -m app.tools.validate_contracts
python -m app.tools.render_smoke_test

# optional smoke generation (requires workspace + project.json)
if [ -f "${HOME}/seo-reporting-workspace/projects/client_abc/project.json" ]; then
  seo-report doctor --project client_abc --mock
  seo-report generate --project client_abc --month auto --mock --lang de
  seo-report generate --project client_abc --month auto --mock --lang en
fi

echo "OK: full check finished"
