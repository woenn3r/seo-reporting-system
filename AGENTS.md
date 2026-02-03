# AGENTS

## Architecture principles (non-negotiable)
- **SSOT:** `contracts/`, `registries/`, `configs/` are authoritative. Do not duplicate these definitions elsewhere.
- **Manifest-driven wiring:** the app MUST load `configs/system/system_manifest_v1.yaml` at startup and **fail fast** if any referenced file is missing or invalid.
- **Policy-driven periods:** period handling MUST follow `configs/system/reporting_policy_v1.yaml` (`--month auto` => previous calendar month, plus early-month warning).
- **Payload-first:** `report.md` MUST be derived strictly from `report_payload.json` (no hidden state, no extra queries during render).
- **Deterministic:** same inputs + same month => same outputs (idempotent regeneration for the same period).
- **Explicit missing data:** populate `missing_sources[]`, `warnings[]`, and `data_completeness_score`; never invent numbers.

## MVP / Definition of Done (DoD)
MVP is done when the following are true for at least one real project (and for mock mode):
1) `seo-report doctor --project <key>` passes (schema, secrets presence, light connectivity checks).
2) `seo-report add-project` creates a schema-valid project pack.
3) `seo-report generate --project <key> --month YYYY-MM` produces:
   - `<output_path>/<YYYY-MM>/report_payload.json` (schema-valid)
   - `<output_path>/<YYYY-MM>/report.md` (rendered from template + payload)
4) `seo-report generate --all --month auto` works (previous month) and produces outputs for all active projects.
5) CI blocks PRs if contracts/templates/rules drift without updates.

## Process rules
- **Contracts are SSOT:** if behavior changes, update JSON Schema + examples + tests (PR must include all).
- **Registries drive wiring:** add source/metric/field in registry first; then generator / models update; then tests.
- **No assumptions:** if an API/spec is unclear, add an item to `docs/90_research_backlog.md` (or `configs/system/system_runbook_v1.yaml` notes) before implementing.
- **Secrets never committed:** use `secrets/*.env` locally; keep `.env.example` in repo.
- **Language support:** `project.report_language` is required (`de|en`). `generate --lang` may override per run.
- **PR discipline:** changes must follow `.github/pull_request_template.md` checklist (contracts/manifest/examples/docs).
