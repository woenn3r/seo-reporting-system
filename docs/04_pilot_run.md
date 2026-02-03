# Pilot Run Checklist (real data, no mocks)

Goal: generate a real monthly report (DE + EN) with live APIs and verify output paths.

## 1) Create project (non-interactive)

```bash
seo-report add-project \
  --key client_xyz \
  --client-name "Client XYZ" \
  --domain example.com \
  --canonical-origin https://www.example.com \
  --lang de \
  --enable-source gsc,pagespeed,crux,dataforseo,rybbit
```

Expected:
- `~/seo-reporting-workspace/projects/client_xyz/project.json` created.
- Output path is writable.

## 2) Configure env vars (no secrets in repo)

Put values in `.env` (repo root), `secrets/*.env`, or export in shell.

Required keys for enabled sources (from manifest):
- `GSC_AUTH_MODE`, `GSC_CREDENTIALS_JSON`
- `GOOGLE_API_KEY` (PSI/CrUX)
- `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`
- `RYBBIT_API_KEY`, `RYBBIT_API_BASE`

## 3) Doctor (real connectivity)

```bash
seo-report doctor --project client_xyz
```

Pass criteria:
- Status shows `configured=YES` and `connectivity=OK` for enabled sources.
- No stacktrace, actionable messages if any env var is missing.

## 4) Generate DE + EN (real data)

```bash
seo-report generate --project client_xyz --month 2026-01 --lang de
seo-report generate --project client_xyz --month 2026-01 --lang en
```

Pass criteria:
- Output path:
  - `~/seo-reporting-workspace/reports/client_xyz/2026-01/de/`
  - `~/seo-reporting-workspace/reports/client_xyz/2026-01/en/`
- Files exist for both languages:
  - `report.md`
  - `report_payload.json`
- Payload is not fixture data (values reflect real API responses).
- Warning may appear if run before the 5th of the month; generation still succeeds.

