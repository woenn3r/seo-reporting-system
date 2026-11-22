# Changelog – social_studio contract

## v1 (2026-11-15)
- Initial contract for the Social Studio agency app (web UI + iOS app).
- Collections: `team`, `clients`, `contents` (pipeline), `scripts` (versioned, scenes), `shots`
  (framing/angle/movement/aspect ratio), `shoots` (call sheet), `media` (raw/cut/final/thumbnail with
  timestamped review comments), `activity`.
- Example / seed data: `examples/social_studio/workspace.json` (validated in CI by
  `app/tools/validate_contracts.py` and `app/tests/test_social_studio_contract.py`).
- Workflow semantics are defined in `apps/social-studio/DOMAIN_RULES.md`.

## v1.1 (2026-11-22) – additive, backwards compatible
- `activity.params` (optional): language-neutral event data (`event`, `title`, `version`, `stage`,
  `fileName`, `date`) so clients can render the activity feed in the viewer's UI language (de/en/ru).
  `message` stays required as a human-readable fallback; entries without `params` render `message`.
- `schemaVersion` stays `1` (no breaking change).
