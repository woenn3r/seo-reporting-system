# User Manual (idiotensicher)

Dieses System erzeugt einen **klassischen monatlichen SEO-Report**.  
Wichtig: Der Report darf **nie Zahlen erfinden**. Die Wahrheit ist immer `report_payload.json`.

---

## 0) Einmaliges Setup (Systemweit)

1) Secrets setzen (siehe `.env.example`)
   - GSC_AUTH_MODE + GSC_CREDENTIALS_JSON (Pflicht wenn GSC aktiv)
   - GOOGLE_API_KEY (PSI/CrUX)
   - DATAFORSEO_* (optional)
   - RYBBIT_* (optional)
   - NOTION_* (optional)

2) Preflight laufen lassen:
   - `seo-report doctor`
   - Mock: `seo-report doctor --mock`
   - Erwartung: Es wird geprüft, ob benötigte Secrets vorhanden sind und ob die aktivierten Quellen erreichbar sind.

3) Workspace setzen (außerhalb des Repos)
   - `export SEO_REPORT_WORKSPACE=~/seo-reporting-workspace`

---

## 1) Kunde/Projekt einmalig anlegen (Onboarding)

Command:
- `seo-report add-project`

Der Wizard fragt nur die Dinge ab, die **nicht automatisch** ableitbar sind.

Er schreibt:
- `workspace/projects/<project_key>/project.json`  (Contract-valid)
- `workspace/projects/<project_key>/keywords.csv`  (falls Rank-Tracking aktiviert)
- optional: `workspace/projects/<project_key>/pages.csv`

### Manuelle Inputs beim Onboarding (typisch)
- GSC Zugriff: Kunde muss euch zur Property hinzufügen (sonst kein Report).
- Keyword-Set: keywords.csv (nur wenn Rank-Tracking aktiv).
- Optional: pages.csv oder Sitemap-Import (falls ihr Page-Analysen erweitern wollt).

Details: `docs/03_onboarding_inputs.md`

---

## 2) Monatlichen Report generieren

Command:
- `seo-report generate --project <project_key> --month YYYY-MM`
  - Auto (Vormonat): `seo-report generate --project <project_key> --month auto`
  - Mock-Modus (ohne Keys): `seo-report generate --project <project_key> --month YYYY-MM --mock`
    - Fixtures liegen in `examples/fixtures/*.json`
  - Alle Projekte: `seo-report generate --all --month auto`
  - Backfill: `seo-report backfill --project <project_key> --from YYYY-MM --to YYYY-MM`

### Monatliche manuelle Inputs?
Normalerweise **keine**.  
Der Command darf **nur** nachfragen, wenn ein Required-Feld fehlt (z. B. `rybbit.enabled=true` aber `site_id` fehlt).

---

## 3) Output

Ausgabe in:
- `<output_path>/<YYYY-MM>/`

Minimum:
- `report_payload.json` (SSOT, Contract-valid)
- `report.md` (Template + Payload)
- `notion_fields.md` (optional)
- `actions_debug.json` (optional, list of actions only)

---

## 4) Wenn etwas fehlt / Fehler

- Bei fehlendem GSC Zugriff: `docs/runbooks/run_gsc_missing_access.md`
- Bei Fehlern im Generate-Lauf: `docs/runbooks/run_generate_failed.md`
- Bei unerwarteten Kosten/Quotas: `docs/runbooks/run_cost_spike.md`
