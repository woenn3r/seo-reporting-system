# Runbook — cost spike / quota issues

## Symptom
- Provider quota exceeded (DataForSEO / PSI / CrUX)
- Unexpected cost increase

## Steps
1) Identify which source caused it (logs + payload warnings).
2) Apply safety toggles:
   - Disable source in `project.json` temporarily (enabled=false)
   - Reduce scope: fewer keywords / fewer locations / fewer pages
3) Ensure caching is enabled and key is stable (per month).
4) Re-run generate.

## Preventive controls (should be implemented)
- Budget limits per run
- Hard cap on keywords/pages per project
- Backoff + retry with quota awareness
