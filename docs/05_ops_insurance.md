# Ops Insurance / Explainability Layer

## Reconnect APIs (quick checklist)

Set env vars in `.env` (repo root), `secrets/*.env`, or export in shell:

- GSC:
  - `GSC_AUTH_MODE`
  - `GSC_CREDENTIALS_JSON`
- PageSpeed / CrUX:
  - `GOOGLE_API_KEY`
- DataForSEO (optional):
  - `DATAFORSEO_LOGIN`
  - `DATAFORSEO_PASSWORD`
- Rybbit (optional):
  - `RYBBIT_API_KEY`
  - `RYBBIT_API_BASE`

## Commands

### 1) Snapshot (machine-readable)

```bash
seo-report snapshot --project <key> --month <auto|YYYY-MM> --lang <de|en> --out <file_or_dir>
```

### 2) Explain (human plan)

```bash
seo-report explain --project <key> --month <auto|YYYY-MM> --lang <de|en> --out <file>
```

### 3) Audit export (ChatGPT handoff bundle)

```bash
seo-report audit-export --project <key> --month <auto|YYYY-MM> --lang <de|en> [--out <dir>]
```

Files written into `audit_bundle/`:
- `snapshot.json`
- `explain.txt`
- `doctor.json`
- `redacted_project.json`
- `env_required.md`
- `resolved_rules.json`
- `template_manifest.json`
- `run_trace.json`
- `actions_debug.json`
- `template_trace.json`

## ChatGPT handoff (verbatim prompt)

"You are the auditor for this SEO reporting system.
Input: snapshot.json, doctor.json, explain.txt, run_trace.json, actions_debug.json, template_trace.json, redacted_project.json.
Task:
1) List missing configuration/secrets and exact steps to fix.
2) Explain which sources are enabled/disabled and why.
3) Explain which rules fired (actions) and why (based on trace).
4) Explain which template/prompt was used and output paths generated.
5) Provide a final “ready for real client run?” decision and next steps.
Do NOT guess; use only provided artifacts."

## Troubleshooting decision tree

1) Doctor errors
- Open `doctor.json` and `env_required.md`.
- Add missing env vars and re-run `seo-report doctor`.

2) Explain output looks wrong
- Verify `project.json` fields in `redacted_project.json`.
- Check `snapshot.json` for period/language resolution.

3) Missing outputs
- Check `run_trace.json` for expected outputs.
- Run `seo-report generate` for the same period/language.

4) Rules/actions unexpected
- Inspect `actions_debug.json` for per-rule evaluation and inclusion.
