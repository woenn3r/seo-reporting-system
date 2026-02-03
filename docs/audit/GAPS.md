# Production Readiness Gaps

This list is strict: items are only marked complete if verified by local evidence or real environment runs. Anything requiring live keys or GitHub settings is marked NEEDS_INFO.

## MUST

1) Real credential verification per enabled source (NEEDS_INFO)
- Why: Production readiness requires real connectivity checks.
- How to verify: Run `seo-report doctor --project <real_project_key>` with real secrets present and enabled sources set to true.
- Owner action: Provide real secrets in `secrets/*.env`, enable the sources in the project pack, and run doctor without `--mock`.

2) Real report generation for a client month (NEEDS_INFO)
- Why: Level 3 readiness requires a successful real report.
- How to verify: `seo-report generate --project <real_project_key> --month <YYYY-MM>` and confirm output files are created.
- Owner action: Provide a real project pack and keys; confirm output files exist.

3) GitHub CI required checks enforcement (NEEDS_INFO)
- Why: Production enforcement depends on branch protection settings.
- How to verify: Confirm `ci / validate` is required in GitHub branch protection for `main`.
- Owner action: Verify settings in GitHub and keep them enforced.

## SHOULD

1) Real-data fixtures for a known customer (NEEDS_INFO)
- Why: Regression testing against a known dataset makes changes safer.
- How to verify: Store a known-good project pack and month payloads in a non-secret location.
- Owner action: Provide a sanitized project pack or archived payload snapshots.

2) Documented SLAs for external APIs (NEEDS_INFO)
- Why: Retry/backoff strategy depends on API limits.
- How to verify: Maintain a summary of rate limits and error handling in docs/runbook.
- Owner action: Add or confirm source limits in docs.

## NICE

1) Optional: automated golden update workflow (NEEDS_INFO)
- Why: Helps keep goldens updated via a controlled command.
- How to verify: Confirm `--update-goldens` is documented and used only intentionally.
- Owner action: Add a short section to docs or CI notes (if desired).

