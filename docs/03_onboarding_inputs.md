# Onboarding Inputs (was ist manuell, was automatisch?)

## Einmalig pro Projekt (manuell)
Diese Inputs werden in `workspace/projects/<project_key>/` abgelegt:

### project.json (Pflicht)
- project_key
- client_name
- domain
- timezone
- report_language
- output_path
- sources.*.enabled Flags (z. B. gsc, pagespeed, crux, dataforseo)

### keywords.csv (nur wenn Rank-Tracking aktiviert)
- keyword (Pflicht)
- optional: location / device / tags

### pages.csv (optional)
- url (Pflicht)
- optional: page_type / notes

## Systemweit (manuell, einmalig)
- Secrets / Credentials (über Secret Store oder env; nie committen)
- Wahl der Google Auth Methode (Service Account vs OAuth)
- Notion DB setup (falls genutzt)

## Automatisch (soll ohne manuelle Eingriffe laufen)
- Datenabruf für alle enabled sources
- payload build + warnings/missing_sources
- Report rendern aus Template + payload
- MoM deltas (Vormonat aus marts/raw)
