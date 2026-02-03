# Runbook — GSC missing access

## Symptom
- Generate fails for GSC source, or payload has missing_source: gsc

## Steps
1) Check `project.json`: gsc.enabled must be true and property/url must match.
2) Run: `seo-report doctor --project <key>` (should test GSC access).
3) Ask client to grant access:
   - Add your Google account / service account email as a user to the GSC property.
4) Re-run: `seo-report generate --project <key> --month YYYY-MM`

## Expected outcome
- GSC data is present in payload, missing_sources does not include gsc.
