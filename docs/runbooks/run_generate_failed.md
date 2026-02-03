# Runbook: Generate failed

## Symptoms
- `seo-report generate` exits non-zero

## Quick checks
1) `seo-report doctor --project <key>`
2) Check logs (run_id) in `logs/`

## Common fixes
- Missing GSC property access
- Quota exceeded (retry later, reduce keyword set, enable caching)

## Escalation
- Owner: Engineering
