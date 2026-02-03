# Language handling + deterministic actions (MVP)

## Language selection
- `report_language` is REQUIRED in `project.json` (`de` or `en`).
- `add-project` wizard MUST ask for language once and store it.
- `generate` supports optional override: `--lang de|en`.
  - Precedence: CLI flag > project.report_language.
  - If neither exists (should not happen), prompt user.

Template selection:
- de -> `configs/report_templates/monthly_de.md`
- en -> `configs/report_templates/monthly_en.md`

Payload:
- `meta.report_language` must reflect the language used for rendering.

## Deterministic actions (no LLM)
- The pipeline should generate `payload.actions[]` using:
  - `configs/report_rules/actions_v1.yaml`
  - project thresholds from `project.json.thresholds`
  - data from `payload.kpis`, `payload.insights`, `payload.missing_sources`, `payload.warnings`
- Note: `*_mom_pct` fields are fractions (e.g., `0.12` = 12%).
- Always return 5–8 actions:
  - Evaluate rules by `priority` desc
  - Add actions until `max_actions`
  - If fewer than `min_actions`, fill with fallback actions (e.g., ACT_TECH_HYGIENE)

Rendering:
- The report template simply prints `payload.actions[]` in the chosen language.
