# Release Audit (v0.1.0)

Status: GREEN

This checklist is copy/paste ready. Run in repo root.

## 1) Environment + Install

Commands:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

Pass criteria:
- `pip install` completes with exit code 0.

## 2) System Gates (must be green)

Commands:

```bash
python -m app.tools.validate_manifest
python -m app.tools.validate_contracts
python -m app.tools.render_smoke_test
python -m app.tools.no_secrets
```

Expected output (pass):
- Each command prints `OK` and returns exit code 0.

Fail criteria:
- Any non-zero exit code or validation error.

## 3) Workspace Bootstrap

Commands:

```bash
mkdir -p ~/seo-reporting-workspace/projects/client_abc
cp examples/project_pack/sample_project.json \
  ~/seo-reporting-workspace/projects/client_abc/project.json
```

Pass criteria:
- `project.json` exists in the workspace project folder.

## 4) CLI Help Smoke

Commands:

```bash
seo-report --help
seo-report doctor --help
seo-report generate --help
seo-report backfill --help
```

Pass criteria:
- Help pages render and exit code is 0.

## 5) Mock Runs (no keys)

Commands:

```bash
seo-report doctor --project client_abc --mock
seo-report generate --project client_abc --month auto --mock --lang de
seo-report generate --project client_abc --month auto --mock --lang en
```

Expected output (pass):
- `doctor` prints per-source status and notes that connectivity checks are skipped in mock mode.
- `generate` prints the output path under:
  `~/seo-reporting-workspace/reports/client_abc/<YYYY-MM>/<lang>/`

Fail criteria:
- Any non-zero exit code.
- Language runs overwrite each other.

## 6) Output Verification (no overwrites)

Expected files (both must exist simultaneously):

```text
~/seo-reporting-workspace/reports/client_abc/<YYYY-MM>/de/report.md
~/seo-reporting-workspace/reports/client_abc/<YYYY-MM>/de/report_payload.json
~/seo-reporting-workspace/reports/client_abc/<YYYY-MM>/en/report.md
~/seo-reporting-workspace/reports/client_abc/<YYYY-MM>/en/report_payload.json
```

Pass criteria:
- Both language folders exist with their own artifacts.

## 7) Unit Test (overwrite protection)

Command:

```bash
python -m unittest app.tests.test_output_language_paths
```

Pass criteria:
- Exit code 0.

## 8) Real-Data Readiness (manual verification)

Commands (requires real keys and enabled sources):

```bash
seo-report doctor --project <real_project_key>
seo-report generate --project <real_project_key> --month <YYYY-MM>
```

Pass criteria:
- `doctor` reports OK for enabled sources.
- `generate` creates `report.md` + `report_payload.json` in the language subfolder.

Fail criteria:
- Any connectivity FAIL for an enabled source.

