# Changelog – social_studio contract

## v1 (2026-11-15)
- Initial contract for the Social Studio agency app (web UI + iOS app).
- Collections: `team`, `clients`, `contents` (pipeline), `scripts` (versioned, scenes), `shots`
  (framing/angle/movement/aspect ratio), `shoots` (call sheet), `media` (raw/cut/final/thumbnail with
  timestamped review comments), `activity`.
- Example / seed data: `examples/social_studio/workspace.json` (validated in CI by
  `app/tools/validate_contracts.py` and `app/tests/test_social_studio_contract.py`).
- Workflow semantics are defined in `apps/social-studio/DOMAIN_RULES.md`.
