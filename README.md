# SEO Reporting System (MVP) — Classic Monthly SEO Report (DE/EN)

This repo implements a **simple, classic monthly SEO report generator**:
- **Input:** `project.json` (project pack) + enabled integrations
- **SSOT output:** `report_payload.json`
- **Human report:** `report.md` rendered deterministically from template + payload (no LLM required)

## What this is / is not
✅ IS:
- A reproducible monthly SEO report (typical agency format)
- Deterministic + payload-first + schema-validated
- Bilingual (DE/EN) via templates + action texts

❌ IS NOT:
- A full SEO audit suite
- A backlink platform, content planner, or BI dashboard

---

## Quickstart (local)

### 1) Workspace (outside repo)
Set a workspace folder for project packs + generated reports:
```bash
export SEO_REPORT_WORKSPACE=~/seo-reporting-workspace
```

### 2) Install
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

### 3) Add a project (wizard)
```bash
seo-report add-project
```
You will be asked once for **report language** (`de` or `en`) and stored in the project pack.

### 4) Preflight
```bash
seo-report doctor --project <project_key>
```

### 5) Generate report (explicit month)
```bash
seo-report generate --project <project_key> --month 2026-01
```

### 6) Generate report (auto previous month)
```bash
seo-report generate --project <project_key> --month auto
```

### 7) Generate for all projects
```bash
seo-report generate --all --month auto
```

### 8) Backfill (range)
```bash
seo-report backfill --project <project_key> --from 2025-07 --to 2026-01
```

---

## Language handling (DE/EN)
- `project.json` contains `report_language: de|en` (required).
- Optional per-run override:
```bash
seo-report generate --project <key> --month 2026-01 --lang en
```
Template mapping:
- `de` => `configs/report_templates/monthly_de.md`
- `en` => `configs/report_templates/monthly_en.md`

---

## Period rules (important)
Period handling follows `configs/system/reporting_policy_v1.yaml`:
- `--month auto` => **previous calendar month**
- If run before the configured safe day (default: 5th), show a warning that data may be incomplete.

Recommended monthly schedule:
- Run on **day 5 at 07:00** (Europe/Helsinki), for **auto previous month**.

---

## Integrations (MVP)
MVP requires:
- **Google Search Console** (enabled in project)
Optional (one is enough):
- **PageSpeed Insights** OR **CrUX**

Other integrations (DataForSEO, Rybbit, Notion) can stay disabled for v1 and be added later.

---

## Files you must not edit manually
- Anything marked `AUTO-GENERATED – DO NOT EDIT` (generated from registries/manifest)

---

## Repo structure (high level)
- `contracts/` — JSON Schemas (SSOT for IO)
- `configs/` — templates, deterministic rules, system config (manifest/policy/runbook)
- `registries/` — source/metric definitions (SSOT for wiring)
- `docs/` — operating manual + runbooks
- `.github/` — CI gates + PR checklist

---

## Safety / Secrets
- Never commit secrets or tokens.
- Use local `secrets/*.env` and keep `.env.example` in the repo.
