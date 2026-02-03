# Production Readiness Gaps

Notes:
- Only items that are not fully verified or not implemented are listed here.
- Estimates are rough engineering time.

## MUST

1) Real credential verification per enabled source (NEEDS_INFO)
- Priority: MUST
- Owner: Janik
- Estimate: 0.5–1 day (depends on client credentials)
- Why: Production readiness requires live API connectivity.
- How to verify: `seo-report doctor --project <real_project_key>` with real secrets and enabled sources.
- Action: Provide real secrets in `.env` or `secrets/*.env`, enable sources in project.json, run doctor.

2) Real report generation (NEEDS_INFO)
- Priority: MUST
- Owner: Janik
- Estimate: 0.5 day
- Why: Level-3 readiness requires a real report payload and md output.
- How to verify: `seo-report generate --project <real_project_key> --month <YYYY-MM> --lang de/en`.
- Action: Run generates on a real client and confirm payload is not fixture data.

## SHOULD

1) GSC OAuth flow not implemented
- Priority: SHOULD
- Owner: Dev
- Estimate: 1–2 days
- Why: `GSC_AUTH_MODE=oauth` currently raises `not implemented`.
- How to verify: Set `GSC_AUTH_MODE=oauth` and run doctor/generate.
- Action: Implement OAuth credentials flow or document as out of scope.

2) Notion source not in schema/registry (manifest-only)
- Priority: SHOULD
- Owner: Dev
- Estimate: 0.5–1 day
- Why: Manifest lists NOTION_* env vars but project schema/registry don’t include a notion source.
- How to verify: Project schema lacks `sources.notion`.
- Action: Either add Notion to schema/registry + extractor, or remove from manifest for v0.1.0.

## NICE

1) Optional: CI job matrix for Python 3.11–3.13
- Priority: NICE
- Owner: Dev
- Estimate: 0.5 day
- Why: Broader compatibility checks.
- How to verify: GitHub Actions matrix runs for 3.11–3.13.
- Action: Update `.github/workflows/ci.yml`.

