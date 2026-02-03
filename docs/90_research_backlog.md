# Research Backlog – SEO Reporting System (muss vor Implementierung geklärt werden)

> Ziel: Keine Annahmen im Code. Alles, was “niche” ist oder sich ändern kann, wird einmal recherchiert, dokumentiert, und als Contract/Tests fixiert.

## R1) Google Search Console (Search Analytics)
**Zu klären**
- Exakte request-body Felder (dimensions, filters, aggregationType, dataState)
- Pagination: rowLimit & startRow + Grenzen
- Data delay & “final” vs “fresh” (falls genutzt)
- Quotas / Load Quota (was ist “teuer”?)

**Output**
- `docs/research/gsc.md`
- `contracts/raw/gsc/searchanalytics.v1.schema.json` (minimal)
- GSC OAuth vs Service Account flow (current implementation uses service account JSON only)
- Mapping: raw → staging columns

## R2) DataForSEO SERP (Google Organic)
**Zu klären**
- Endpoint/Mode (live vs task; regular vs advanced)
- Kostenkontrolle: stop_crawl_on_match + depth + max_crawl_pages
- Match-Types & multi-target search mode
- Location/Language Codes + Locations sets

**Output**
- `docs/research/dataforseo_serp.md`
- `contracts/raw/dataforseo/serp.v1.schema.json` (minimal)
- `configs/locations_sets/*.yaml` Format + validator

## R3) PageSpeed Insights API (runPagespeed)
**Zu klären**
- Welche Felder brauchst du wirklich? (Lighthouse categories, audits, metrics)
- Mobile/desktop Strategy Parameter
- Quotas / Error modes / retries

**Output**
- `docs/research/pagespeed.md`
- `contracts/raw/psi/runpagespeed.v1.schema.json`

## R4) CrUX (History API bevorzugt)
**Zu klären**
- Welche metrics (LCP, INP, CLS) + FormFactor (PHONE/DESKTOP) Mapping
- Collection periods & Interpretation (28-day rolling average)
- Missing eligibility (NaN/null) Handling
- Rate limits

**Output**
- `docs/research/crux_history.md`
- `contracts/raw/crux/history.v1.schema.json`

## R5) Rybbit Analytics API
**Zu klären**
- Auth (Bearer), site_id mapping, endpoints für sessions/conversions
- Date range semantics + timezone parameter
- Rate limits & best practices (caching)

**Output**
- `docs/research/rybbit.md`
- `contracts/raw/rybbit/*.v1.schema.json`
- Rybbit API base + endpoints (current implementation assumes `/sites/{site_id}/stats` with `from/to` params; verify)

## R6) Notion Import (CSV/MD)
**Zu klären**
- CSV Import Constraints (encoding, header, property type mapping)
- Wie verhinderst du Duplikate? (Unique Key Pattern)
- Optional: Notion API später (Upsert)

**Output**
- `docs/research/notion_import.md`
- `registries/notion.yaml` (payload key → property mapping)

## R7) OpenAI Report Rendering
**Zu klären**
- Model choice + prompt format + guardrails
- Token limits & truncation strategy (payload summarization falls nötig)
- Determinism: temperature, retries, logging

**Output**
- `docs/research/openai_render.md`
- `configs/report_rules/default.yaml` + `configs/report_templates/monthly_de.md`

## R8) Zeit/Perioden-Logik (Monat, MoM, Timezone)
**Zu klären**
- Exakte month-window boundaries (e.g. 2026-01-01..2026-01-31) in project timezone
- GSC/Analytics nutzen ISO dates in UTC? -> unify
- DST edge cases

**Output**
- `docs/research/time_periods.md`
- Unit tests: time util “month_range()”, “prev_month()”
