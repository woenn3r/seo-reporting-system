# Release Audit (v0.1.0)

Status: GREEN (local mock readiness)

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

## 2) Workspace Bootstrap (script)

Command:

```bash
./scripts/bootstrap_local.sh client_abc
```

Observed output:

```
OK: project.json ready at: /Users/janikahler/seo-reporting-workspace/projects/client_abc/project.json
OK: output_path: /Users/janikahler/seo-reporting-workspace/reports/client_abc
```

Pass criteria:
- `project.json` exists in the workspace project folder.
- Output path points to `~/seo-reporting-workspace/reports/<project_key>`.

## 3) Full Check (script)

Command:

```bash
./scripts/check_all.sh
```

Observed output (abridged):

```
OK: manifest validated
OK: contracts + examples + registries + required docs validated.
OK: render smoke test
Source status:
- gsc: configured=YES secrets=NO connectivity=SKIPPED (mock mode)
- pagespeed: configured=YES secrets=NO connectivity=SKIPPED (mock mode)
- crux: configured=YES secrets=NO connectivity=SKIPPED (mock mode)
- dataforseo: configured=NO secrets=NO connectivity=SKIPPED (source disabled)
- rybbit: configured=NO secrets=NO connectivity=SKIPPED (source disabled)
OK: mock mode, secrets/connectivity checks skipped.
Hinweis: In den ersten Tagen des Monats können Daten (z. B. GSC) noch unvollständig sein. Empfohlen: Generierung ab dem 5.
WARNING: overwriting existing report for 2026-01/de
Report generated: /Users/janikahler/seo-reporting-workspace/reports/client_abc/2026-01/de
Note: During the first days of the month, data (e.g., GSC) may still be incomplete. Recommended: generate from the 5th onward.
WARNING: overwriting existing report for 2026-01/en
Report generated: /Users/janikahler/seo-reporting-workspace/reports/client_abc/2026-01/en
OK: full check finished
...
Ran 11 tests in 0.107s
OK
```

Pass criteria:
- Unit tests pass.
- Manifest, contracts, and render smoke test pass.
- Mock doctor/generate succeed.

Coverage confirmation:
- `scripts/check_all.sh` runs `python -m unittest -v`, `validate_manifest`, `validate_contracts`, `render_smoke_test`.

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

## 5) Real-Data Readiness (manual verification)

Commands (requires real keys and enabled sources):

```bash
seo-report doctor --project <real_project_key>
seo-report generate --project <real_project_key> --month <YYYY-MM> --lang de
seo-report generate --project <real_project_key> --month <YYYY-MM> --lang en
```

Pass criteria:
- `doctor` reports OK for enabled sources.
- Output exists under `<output_path>/<YYYY-MM>/<lang>/`.
- `report_payload.json` is not fixture data.

Fail criteria:
- Any connectivity FAIL for an enabled source.

