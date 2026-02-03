# Ops Insurance / Explainability Layer

<<<<<<< HEAD
Goal: A non-technical operator can understand what will run, why it will run, and export a sanitized bundle for troubleshooting.
=======
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
>>>>>>> 07da73a (add ops insurance commands and audit bundle)

## Commands

### 1) Snapshot (machine-readable)

```bash
<<<<<<< HEAD
seo-report snapshot --project <key> --month <YYYY-MM> --lang <de|en>
```

Output:
- `snapshot.json`
- Contains repo commit, manifest version, effective project config, enabled sources, required env vars, doctor status, template/ruleset selection, pipeline steps, output paths.

Optional:
- `--out <path>` to place `snapshot.json` in a custom location.
- `--mock` to skip connectivity checks.

### 2) Explain (deterministic plan, no network)

```bash
seo-report explain --project <key> --month <auto|YYYY-MM> --lang <de|en>
```

Output:
- Human-readable plan of what will run and why.
- Includes month resolution, template selection, enabled sources, output directory.

### 3) Audit Export (sanitized bundle)

```bash
seo-report audit-export --project <key> --month <auto|YYYY-MM> --lang <de|en> --out <dir>
```

Outputs (no secrets):
=======
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
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
- `snapshot.json`
- `explain.txt`
- `doctor.json`
- `redacted_project.json`
<<<<<<< HEAD
- `env_required.md` (present/missing only)
- `run_trace.json`
- `resolved_rules.json` / `resolved_rules.yaml`
- `template_manifest.json`

## ChatGPT handoff prompt (suggested)

Copy the entire audit-export folder contents into ChatGPT, then use:

```
You are the auditor for this SEO reporting system.
Input: snapshot.json, doctor.json, explain.txt, run_trace.json, redacted_project.json.
=======
- `env_required.md`
- `resolved_rules.json`
- `template_manifest.json`
- `run_trace.json`
- `actions_debug.json`
- `template_trace.json`

## ChatGPT handoff (verbatim prompt)

"You are the auditor for this SEO reporting system.
Input: snapshot.json, doctor.json, explain.txt, run_trace.json, actions_debug.json, template_trace.json, redacted_project.json.
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
Task:
1) List missing configuration/secrets and exact steps to fix.
2) Explain which sources are enabled/disabled and why.
3) Explain which rules fired (actions) and why (based on trace).
4) Explain which template/prompt was used and output paths generated.
5) Provide a final “ready for real client run?” decision and next steps.
<<<<<<< HEAD
Do NOT guess; use only provided artifacts.
```

Alternative prompt:

```
You are a troubleshooting assistant. Analyze the provided audit bundle files:
- snapshot.json, explain.txt, doctor.json, redacted_project.json, env_required.md,
  run_trace.json, resolved_rules.json, template_manifest.json.

Goals:
1) Identify configuration or connectivity issues.
2) Explain which sources/templating/rules are active.
3) Recommend the minimum steps to fix any failures.

Return a concise checklist.
```

## Troubleshooting decision tree

1) Doctor FAILS
- Check `doctor.json` and `env_required.md` for missing env vars.
- Add missing vars to `.env` or `secrets/*.env` and re-run `seo-report doctor`.

2) Explain looks wrong
- Confirm `project.json` fields in `redacted_project.json`.
- Verify language and month in `snapshot.json`.

3) Generate missing outputs
- Verify `output_dir` in `snapshot.json`.
- Check `run_trace.json` (if missing, run generate once).

4) Rules/Actions unexpected
- Inspect `resolved_rules.json` and `actions_debug.json` from the last run.
=======
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
>>>>>>> 07da73a (add ops insurance commands and audit bundle)
