# Ops Insurance / Explainability Layer

Goal: A non-technical operator can understand what will run, why it will run, and export a sanitized bundle for troubleshooting.

## Commands

### 1) Snapshot (machine-readable)

```bash
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
- `snapshot.json`
- `explain.txt`
- `doctor.json`
- `redacted_project.json`
- `env_required.md` (present/missing only)
- `run_trace.json`
- `resolved_rules.json` / `resolved_rules.yaml`
- `template_manifest.json`

## ChatGPT handoff prompt (suggested)

Copy the entire audit-export folder contents into ChatGPT, then use:

```
You are the auditor for this SEO reporting system.
Input: snapshot.json, doctor.json, explain.txt, run_trace.json, redacted_project.json.
Task:
1) List missing configuration/secrets and exact steps to fix.
2) Explain which sources are enabled/disabled and why.
3) Explain which rules fired (actions) and why (based on trace).
4) Explain which template/prompt was used and output paths generated.
5) Provide a final “ready for real client run?” decision and next steps.
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
