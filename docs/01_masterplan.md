# SEO Reporting System – Masterplan (End-to-End)

## 0) Ziel (in 1 Satz)
Ein Befehl wie `seo-report generate --project client_abc --month 2026-01` erzeugt **reproduzierbar**:
- `report_payload.json` (Single Source of Truth)
- `notion_fields.md` (+ optional CSV)
- `report.md` (aus Template + Rules, ohne Halluzination)
und schreibt alles in den richtigen Kundenordner.

> Leitprinzip: **Nicht Menschen müssen alles richtig verbinden – das System macht Vergessen unmöglich** (SSOT + Contracts + Generatoren + Gates).

---

## 1) Scope & Nicht-Ziele
### Muss (MVP)
- Project Packs (`project.json`, `keywords.csv`, optional `pages.csv`) pro Kunde
- Quellen: GSC, DataForSEO SERP, PageSpeed Insights, CrUX (History bevorzugt), optional Rybbit
- Data Lake: raw → staging → marts → `report_payload.json`
- Report Rendering (OpenAI) **nur** aus Payload + Rules/Template
- Idempotent: gleicher Monat + gleiche Inputs → gleicher Output (raw bleibt auditierbar)

### Kann später
- FastAPI Mini-API Trigger
- Mehr Templates (EN/DE), mehr Report-Typen
- UI / Dashboard

### Explizite Nicht-Ziele (damit es schnell & sicher bleibt)
- Kein “Auto-Interpretieren” der Zahlen durch die Pipeline
- Keine deep BI-Layer / Metrics-Store im MVP
- Keine direkte Integration in dein Hauptsystem (nur Output-Pfad)

---

## 2) System-Architektur (einfach, robust, auditierbar)

### 2.1 Repo-/Ordnerstruktur
```
seo-reporting-system/
  app/
    cli/
    core/
    extractors/
    transforms/
    render/
    exports/
  configs/
    locations_sets/
    report_rules/
    report_templates/
  contracts/
  registries/
  workspace/
    projects/
      <project_key>/
        project.json
        keywords.csv
        pages.csv
    cache/
    lake/
      raw/
      staging/
      marts/
  logs/
```

### 2.2 Data Flow (Pipeline)
1) **Input**: Project Pack + Secrets (global, nicht im Pack)
2) **Extract**: APIs → `lake/raw/<source>/<project>/<month>/<run_id>.json`
3) **Normalize**: raw → DuckDB Tables (staging)
4) **Marts**: staging → monatliche Aggregationen (`mart_*_monthly.json`)
5) **Payload**: `report_payload.json` (fixes Schema)
6) **Exports**: `notion_fields.md/csv`, `report.md`

### 2.3 “SSOT” im Reporting-System
- **SSOT #1**: `project.json` (pro Kunde)
- **SSOT #2**: `contracts/` (Schemas für Input/Output)
- **SSOT #3**: `registries/` (welche Quellen/Steps existieren + Mapping)
- Alles andere **generated** oder abgeleitet.

---

## 3) “Vergessen unmöglich” – Guardrails für deinen Dev

### 3.1 Hard Contracts (Versioned)
- `contracts/project_pack/v1/project.schema.json`
- `contracts/report/v1/report_payload.schema.json`
- (optional) Raw/normalized/marts schemas pro Quelle

**Regel:** Jede IO-Änderung = Contract-Änderung + Changelog + Tests.

### 3.2 Registries statt “Hand-Connecten”
- `registries/sources.yaml`: Quellen + Extractor + Required Credentials + Output Contracts
- `registries/pipeline.yaml`: Steps + Reihenfolge + Inputs/Outputs
- `registries/metrics.yaml`: KPI Keys + Berechnung + Rundung/Formatierung
- `registries/notion.yaml`: Payload-Key → Notion Property Name/Type

**Regel:** Neues Feature = Registry-Eintrag + Generator erzeugt die “Wiring” Files.

### 3.3 Generatoren
Generatoren erzeugen:
- Pydantic Models aus JSON Schemas
- CLI Wizard Prompts (required fields)
- Default config scaffolds
- Golden-Test Snapshots

### 3.4 CI Quality Gates (nicht verhandelbar)
PR blockiert, wenn:
- Formatter/Lint/Typecheck fail
- Unit/Integration fail
- Contract Validation fail (Schemas vs Beispiele)
- Golden Tests fail (Generator outputs diff)
- Secret scanning / dependency scanning fail

---

## 4) Source-by-Source Design (was genau gezogen wird)

### 4.1 GSC (Performance Truth)
- Monats-KPIs: clicks/impressions/ctr/avg_position
- Top Pages + Top Queries
- Paging: rowLimit (25k) + startRow increments
- Hinweis: Daten sind reporttauglich, aber nicht “Rank Tracking exakt”.

### 4.2 DataForSEO SERP (Ranking Truth fürs Keyword-Set)
- Für jedes Keyword: Position **deiner Domain** (und optional Competitors)
- Kostenkontrolle: “stop_crawl_on_match” + depth/max_crawl_pages

### 4.3 PageSpeed Insights (Lab)
- Standard-Calls mobile/desktop
- Speichere die ganze JSON Response (Audit), normalisiere nur benötigte Felder in staging/marts.

### 4.4 CrUX (Field, real users)
- Bevorzugt: **CrUX History API** für Trends/Time series
- Monatsreport: nimm die “most recent” Periode im Monat oder nutze “collection periods” zur Trenddarstellung.
- Edge: Eligibility kann fehlen → markiere im Payload als warning + missing.

### 4.5 Rybbit (Analytics optional)
- Monat: sessions, conversions, conversion rate (falls verfügbar)
- Muss sauber auf Zeitzone/Date ranges gemappt werden.

---

## 5) Monatsreport – Payload Design (wichtigster Contract)
### 5.1 Payload Prinzip
- **Alle Zahlen im Report kommen aus report_payload.json**
- Fehlende Daten → `missing_sources[]` + `warnings[]`
- `data_completeness_score` (0–100) wird automatisch berechnet.

### 5.2 Pflichtbereiche (MVP)
- meta: client, period, generatedAt, timezone
- kpis: GSC KPIs + MoM
- rankings: Top3/10/20 + Movers
- cwv: LCP/INP/CLS p75 + status
- insights: top pages/queries, winners/losers (rule-based)
- actions: 5–10 next actions (strict rule-engine, keine AI)

---

## 6) Implementations-Phasen (0–6) – konkret für dieses Projekt

> Jede Phase endet mit “mergeable, green, documented”.

### Phase 0 – Repo + Verbindlichkeit (1 Tag)
- Repo scaffold + One-command local run
- PR/ADR/Runbook Templates
- Definition of Done + CODEOWNERS
- Minimal “hello pipeline” CLI

**Exit:** `seo-report --help` läuft, CI läuft, Templates erzwingen Checks.

### Phase 1 – Architektur & Modulgrenzen (1–2 Tage)
- Module: `cli`, `core`, `extractors`, `transforms`, `render`, `exports`
- Boundary lint (kein cross-import)
- “core” enthält Orchestrator + State Machine (run_id, month, project)

**Exit:** Neue Files müssen in ein Modul passen; boundaries sind enforced.

### Phase 2 – Contracts + Registries + Generatoren (2–4 Tage)
- JSON Schemas v1: project.json, report_payload.json
- Registry v1: sources/pipeline/metrics/notion
- Generator: pydantic models + default configs + golden tests

**Exit:** “Vergessen zu verbinden” ist praktisch unmöglich.

### Phase 3 – CI Gates + Security (1–2 Tage)
- Required checks, secret scanning, dependency scanning, SAST
- Pre-commit hooks
- Versioned artifacts build

**Exit:** main ist immer grün & deploybar.

### Phase 4 – Testsystem (2–4 Tage, parallel möglich)
- Unit: KPI/MoM Berechnungen, rounding, rule-engine
- Integration: DuckDB pipeline, file IO
- Contract tests: payload matches schema
- API tests: VCR cassettes (record/replay) + rate limit handling tests

**Exit:** Änderungen sind reviewbar & sicher.

### Phase 5 – Release Engineering (1–2 Tage)
- Versioning + changelog
- Packaging: `pipx install` oder `uv tool install` (CLI)
- Rollback: “last known good” binary + runbook

**Exit:** Releases sind langweilig.

### Phase 6 – Observability + Operating Rhythm (laufend)
- Structured logs (run_id, project, month)
- Runbooks: “GSC auth broken”, “quota exceeded”, “data missing”
- Drift checks: dependency update + docs freshness + registry consistency

**Exit:** Betriebssicher, weniger Überraschungen.

---

## 7) Dev Execution Checklist (No Excuses)
**Jeder PR muss enthalten:**
- Contract impact? → Schema + changelog + tests
- Registry impact? → generator run + golden tests updated
- Deterministic tests (fixed clocks)
- Docs/ADR (wenn Entscheidung)
- Runbook/Alert (wenn neues Failure Mode)

---

## 8) Risiken & typische Fehler (und wie wir sie verhindern)
- **Fehlende GSC Property Rechte** → Onboarding checklist + explicit preflight check
- **Zeit-/Zeitzonen-Mapping falsch** → zentrale date utils + tests
- **API Quotas/Rate limits** → throttling + caching + incremental fetch
- **Daten fehlen (CrUX eligibility)** → payload warnings statt “faken”
- **Doppelte Notion Imports** → period+project unique key im Export, optional “upsert” später
- **Kostenexplosion SERP** → stop-on-match + depth caps + keyword hygiene

---

## 9) Definition of Done (MVP)
- Für 1 Projekt kann `seo-report generate --month YYYY-MM` laufen (ohne manuelle Schritte)
- Outputs: payload + notion_fields + report.md im output_path
- Payload validiert gegen Schema
- MoM korrekt (oder `null` + warning wenn Vormonat fehlt)
- CI: grün, required checks aktiv, secret scanning aktiv

