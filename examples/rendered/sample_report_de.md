







# SEO Monatsreport – Client ABC GmbH (2026-01)

*Erstellt am:* 2026-02-02T12:00:00+00:00  
*Projekt:* client_abc · *Zeitzone:* Europe/Helsinki

---

## Executive Summary (max. 6 Punkte)


- **Klicks:** 1234 (MoM: 8.2%)
- **Impressionen:** 45678 (MoM: 5.1%)
- **CTR:** 2.7% (MoM: 2.0%)
- **Ø Position:** 18.4 (Δ: -0.6)

- **Datenlage:** Eingeschränkt – fehlende Quellen: rankings


---

## KPI-Übersicht (GSC)

| KPI | Wert (Monat) | MoM % |
|---|---:|---:|
| Klicks | 1234 | 8.2% |
| Impressionen | 45678 | 5.1% |
| CTR | 2.7% | 2.0% |
| Ø Position | 18.4 | -0.6 (Δ) |

---

## Top Pages (Top 10)


| URL | Klicks | MoM % | Impressionen | CTR | Ø Pos |
|---|---:|---:|---:|---:|---:|

| https://www.example.com/leistungen/ | 340 | — | — | — | — |



---

## Top Queries (Top 10)


| Query | Klicks | MoM % | Impressionen | CTR | Ø Pos |
|---|---:|---:|---:|---:|---:|

| seo agentur | 210 | — | — | — | — |



---

## Gewinner / Verlierer (Pages)






*Keine Gewinner/Verlierer-Listen verfügbar.*



---

## Performance (Core Web Vitals)


| Metrik | Wert (p75) |
|---|---:|
| LCP | 2500 ms |
| INP | 180 ms |
| CLS | 0.08 |
| Status | needs_improvement |


---

## Maßnahmen (5–8)



### 1. Datenquellen reparieren (Zugriff/Keys)  (critical)

**Warum:** Mindestens eine Datenquelle fehlt oder ist nicht abrufbar: rankings. Ohne diese Daten ist der Report nur eingeschränkt aussagekräftig.


**Datenbezug:** missing_sources, warnings



### 2. Klick-Rückgang analysieren (Ursachen eingrenzen)  (critical)

**Warum:** Klicks sind gegenüber dem Vormonat deutlich gefallen (MoM: 0.082). Prüfe zuerst die Verlierer-Seiten/Queries und Änderungen an Snippets/Indexierung.


**Datenbezug:** kpis.gsc.clicks_mom_pct, insights.losers_pages, insights.losers_queries



### 3. CTR optimieren (Snippets & Intent)  (warn)

**Warum:** CTR ist niedrig (0.027) bei gleichzeitig hohem Impressions-Volumen. Priorisiere Seiten/Queries mit vielen Impressionen und optimiere Title/Meta/USP.


**Datenbezug:** kpis.gsc.ctr, kpis.gsc.impressions, insights.top_pages, insights.top_queries



### 4. Core Web Vitals verbessern (Performance-Regression)  (warn)

**Warum:** CWV Status ist nicht 'good' (needs_improvement). Priorisiere INP/LCP/CLS-Fixes auf den wichtigsten Seiten (Top Pages).


**Datenbezug:** kpis.cwv.status, kpis.cwv.lcp_p75_ms, kpis.cwv.inp_p75_ms, kpis.cwv.cls_p75, insights.top_pages



### 5. Technische Hygiene (Indexierung & interne Qualitätssignale)  (info)

**Warum:** Standard-Checks: Indexierbarkeit wichtiger Seiten, Canonicals, 404/Redirect-Ketten, Sitemap/Robots, interne Verlinkung auf Kernseiten.


**Datenbezug:** meta.period





---

## Datenlage & Hinweise

**Data completeness score:** 82.5


**Fehlende Quellen:** rankings



**Warnings:**

- CrUX: Field data not available for all pages.

