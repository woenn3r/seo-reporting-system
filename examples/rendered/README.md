# Rendered Golden Snapshots

These files are **golden snapshots** for the report rendering output.
They are used to detect unintended layout/content drift.

## Policy
- CI runs `python -m app.tools.render_smoke_test` and **fails on diff**.
- Do **not** edit these files by hand.
- To intentionally update goldens, run:
  - `python -m app.tools.render_smoke_test --update-goldens`
- Commit golden updates as a **separate commit** in the PR.

## Files
- `sample_report_de.md`
- `sample_report_en.md`
