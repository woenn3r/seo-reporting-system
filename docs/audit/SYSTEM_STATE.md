# SYSTEM_STATE Audit

## 1) Executive Verdict
**READY_LEVEL2_ONLY**

Reasoning: Level 1 gates pass locally and CI workflow exists; Level 2 requirements are documented and doctor connectivity checks are implemented; Level 3 (real client run) is **NEEDS_INFO** because no verified real keys/run evidence is available in this repo.

---

## 2) Evidence Pack

### Local commands outputs summary (Section C)
- `python -m app.tools.validate_manifest` → `OK: manifest validated`
- `python -m app.tools.validate_contracts` → `OK: contracts + examples + registries + required docs validated.`
- `python -m app.tools.render_smoke_test` → `OK: render smoke test`
- `python -m app.tools.no_secrets` → `OK: no obvious secrets detected`
- `seo-report --help` → lists commands: doctor, add-project, generate, backfill
- `seo-report doctor --help` → includes `--mock` flag
- `seo-report generate --help` → includes `--month` and `--lang`
- `seo-report backfill --help` → includes `--from/--to`

### GitHub PR + run links (UNVERIFIED — gh CLI not available)
- gh CLI not available (`gh --version` failed). GitHub-derived items are **UNVERIFIED**.
- User-provided PR links (not verified here):
  - https://github.com/woenn3r/seo-reporting-system/pull/7
  - https://github.com/woenn3r/seo-reporting-system/pull/8
  - https://github.com/woenn3r/seo-reporting-system/pull/9

---

## 3) Scorecard (0–10)
- Scope & MVP: **9/10** (scope defined, but `docs/00_scope.md` contains CI trigger lines)
- Repo structure & SSOT: **8/10** (manifest OK, but docs mention `examples/fixtures` which no longer exists)
- Manifest wiring: **10/10** (`configs/system/system_manifest_v1.yaml` + validate_manifest)
- Contracts & IO: **10/10** (schemas + changelogs)
- CLI flows: **9/10** (commands present; add-project help not audited)
- Language support: **10/10** (policy + templates + report_language)
- Actions determinism: **10/10** (dedup + fixed fallbacks)
- Rendering robustness: **10/10** (sparse payload render tested)
- Policy auto month: **10/10** (policy file, CLI supports auto)
- CI gates: **7/10** (workflow exists; GitHub run status unverified)
- Security/secrets: **9/10** (.gitignore + no_secrets)

---

## 4) What changed recently (last 10 commits + files changed)
From `git log -n 10 --name-status`:

- 64c4151 docs: add contract changelogs
  - M app/core/doctor.py
  - A contracts/project_pack/changelog.md
  - A contracts/report_payload/changelog.md
- 376253d feat: add doctor connectivity checks
  - M app/core/doctor.py
  - M app/extractors/gsc.py
  - A app/tests/test_doctor_connectivity.py
- cc76460 feat: robust templates + sparse render smoke
  - M app/tools/render_smoke_test.py
  - M configs/report_templates/monthly_de.md
  - M configs/report_templates/monthly_en.md
  - A examples/report_payload/sparse_payload.json
- 9f85bce docs: add release audit master prompt
  - A docs/testing/release_audit_master_prompt.md
- 83f5652 feat: export actions debug payload
  - M app/core/pipeline.py
  - M docs/02_user_manual.md
- 8950b5a feat: add doctor --mock
  - M app/cli.py
  - M app/core/doctor.py
  - M docs/02_user_manual.md
- 09597b1 docs: add golden snapshots policy
  - A examples/rendered/README.md
- df8b47e chore: trigger PR checks 2
  - M docs/00_scope.md
- db6c6c7 Merge pull request #1 from woenn3r/test/enable-required-checks
- 55080f4 chore: trigger PR checks
  - M docs/00_scope.md

---

## 5) Open Items

### Blockers
- None.

### Risks
- **Doc mismatch:** `docs/02_user_manual.md` mentions fixtures in `examples/fixtures/*.json`, but fixtures live in `app/fixtures/`.
  - Evidence: `docs/02_user_manual.md` section “Mock‑Modus” vs `app/fixtures/`.
- **SSOT drift:** `docs/IMPLEMENTATION_LAST_STEPS_v1.yaml` optional path includes `examples/fixtures/` which no longer exists.
  - Evidence: `docs/IMPLEMENTATION_LAST_STEPS_v1.yaml` optional_paths.
- **CI status unverified:** No `gh` CLI; GitHub CI checks cannot be verified here.

### Missing Evidence / Needs Info
- **Real client run (Level 3):** Need a real client project pack + keys + successful report generation.

---

## 6) Copy/paste runbook

### Onboarding a new client
- Follow `docs/03_onboarding_inputs.md` and `docs/02_user_manual.md`.
- Command:
  - `seo-report add-project`

### Generating report for a month
- `seo-report generate --project <key> --month YYYY-MM`
- Auto month: `seo-report generate --project <key> --month auto`

### Backfill
- `seo-report backfill --project <key> --from YYYY-MM --to YYYY-MM`

### Updating goldens safely
- `python -m app.tools.render_smoke_test --update-goldens`
- Commit goldens as a separate commit (see `examples/rendered/README.md`).

### Diagnosing top 5 failures
- Missing GSC access: `docs/runbooks/run_gsc_missing_access.md`
- Generate failures: `docs/runbooks/run_generate_failed.md`
- Cost spikes / quotas: `docs/runbooks/run_cost_spike.md`
- Manifest wiring errors: run `python -m app.tools.validate_manifest`
- Contract drift: run `python -m app.tools.validate_contracts`

---

# Evidence References (by file)
- Manifest: `configs/system/system_manifest_v1.yaml` (paths + required_env_vars)
- Policy: `configs/system/reporting_policy_v1.yaml` (auto month + warning)
- Runbook: `configs/system/system_runbook_v1.yaml` (S5_DOCTOR includes connectivity checks)
- Actions rules: `configs/report_rules/actions_v1.yaml` (min/max + rule list)
- Templates: `configs/report_templates/monthly_de.md`, `configs/report_templates/monthly_en.md` (missing-safe macros)
- Contracts: `contracts/project_pack/v1.schema.json`, `contracts/report_payload/v1.schema.json`
- Changelogs: `contracts/project_pack/changelog.md`, `contracts/report_payload/changelog.md`
- Golden policy: `examples/rendered/README.md`
- Render diff gate: `app/tools/render_smoke_test.py`
- Doctor connectivity: `app/core/doctor.py`, `app/extractors/gsc.py`
- RTF integrity: `system_prompt_v1.1.rtf` (binary header `{\rtf`)
