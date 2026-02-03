{# 
Jinja2 Template: monthly_de.md
Expected payload structure: meta, kpis, insights (optional), actions (optional), missing_sources, warnings.
Conventions:
- *_mom_pct fields are fractions (e.g., -0.12 = -12%).
#}

{% macro fmt_num(x, decimals=0) -%}
{%- if x is none -%}—{%- else -%}{{ x|round(decimals) }}{%- endif -%}
{%- endmacro %}

{% macro fmt_pct(x, decimals=1) -%}
{%- if x is none -%}—{%- else -%}{{ (x*100)|round(decimals) }}%{%- endif -%}
{%- endmacro %}

{% macro fmt_ms(x) -%}
{%- if x is none -%}—{%- else -%}{{ x|round(0) }} ms{%- endif -%}
{%- endmacro %}

# SEO Monatsreport – {{ meta.client_name }} ({{ meta.period }})

*Erstellt am:* {{ meta.generated_at }}  
*Projekt:* {{ meta.project_key }} · *Zeitzone:* {{ meta.timezone }}

---

## Executive Summary (max. 6 Punkte)

{% set g = kpis.gsc if kpis is defined and kpis.gsc is defined else {} %}
- **Klicks:** {{ fmt_num(g.clicks) }} (MoM: {{ fmt_pct(g.clicks_mom_pct) }})
- **Impressionen:** {{ fmt_num(g.impressions) }} (MoM: {{ fmt_pct(g.impressions_mom_pct) }})
- **CTR:** {{ fmt_pct(g.ctr, 2) }} (MoM: {{ fmt_pct(g.ctr_mom_pct) }})
- **Ø Position:** {{ fmt_num(g.avg_position, 2) }} (Δ: {{ fmt_num(g.avg_position_delta, 2) }})
{% if missing_sources and missing_sources|length > 0 %}
- **Datenlage:** Eingeschränkt – fehlende Quellen: {{ missing_sources|join(", ") }}
{% endif %}

---

## KPI-Übersicht (GSC)

| KPI | Wert (Monat) | MoM % |
|---|---:|---:|
| Klicks | {{ fmt_num(g.clicks) }} | {{ fmt_pct(g.clicks_mom_pct) }} |
| Impressionen | {{ fmt_num(g.impressions) }} | {{ fmt_pct(g.impressions_mom_pct) }} |
| CTR | {{ fmt_pct(g.ctr, 2) }} | {{ fmt_pct(g.ctr_mom_pct) }} |
| Ø Position | {{ fmt_num(g.avg_position, 2) }} | {{ fmt_num(g.avg_position_delta, 2) }} (Δ) |

---

## Top Pages (Top 10)

{% if insights is defined and insights.top_pages is defined and insights.top_pages|length > 0 %}
| URL | Klicks | MoM % | Impressionen | CTR | Ø Pos |
|---|---:|---:|---:|---:|---:|
{% for p in insights.top_pages[:10] %}
| {{ p.url|default("—") }} | {{ fmt_num(p.clicks) }} | {{ fmt_pct(p.clicks_mom_pct) }} | {{ fmt_num(p.impressions) }} | {{ fmt_pct(p.ctr, 2) }} | {{ fmt_num(p.avg_position, 2) }} |
{% endfor %}
{% else %}
*Keine Top-Page Daten verfügbar (Quelle deaktiviert, kein Zugriff oder keine Daten).*
{% endif %}

---

## Top Queries (Top 10)

{% if insights is defined and insights.top_queries is defined and insights.top_queries|length > 0 %}
| Query | Klicks | MoM % | Impressionen | CTR | Ø Pos |
|---|---:|---:|---:|---:|---:|
{% for q in insights.top_queries[:10] %}
| {{ q.query|default("—") }} | {{ fmt_num(q.clicks) }} | {{ fmt_pct(q.clicks_mom_pct) }} | {{ fmt_num(q.impressions) }} | {{ fmt_pct(q.ctr, 2) }} | {{ fmt_num(q.avg_position, 2) }} |
{% endfor %}
{% else %}
*Keine Query-Daten verfügbar (Quelle deaktiviert, kein Zugriff oder keine Daten).*
{% endif %}

---

## Gewinner / Verlierer (Pages)

{% if insights is defined and insights.winners_pages is defined and insights.winners_pages|length > 0 %}
### Gewinner (Top 5 nach Klicks-Δ)
| URL | Klicks-Δ | MoM % |
|---|---:|---:|
{% for p in insights.winners_pages[:5] %}
| {{ p.url|default("—") }} | {{ fmt_num(p.clicks_delta) }} | {{ fmt_pct(p.clicks_mom_pct) }} |
{% endfor %}
{% endif %}

{% if insights is defined and insights.losers_pages is defined and insights.losers_pages|length > 0 %}
### Verlierer (Top 5 nach Klicks-Δ)
| URL | Klicks-Δ | MoM % |
|---|---:|---:|
{% for p in insights.losers_pages[:5] %}
| {{ p.url|default("—") }} | {{ fmt_num(p.clicks_delta) }} | {{ fmt_pct(p.clicks_mom_pct) }} |
{% endfor %}
{% endif %}

{% if not (insights is defined and ((insights.winners_pages is defined and insights.winners_pages|length>0) or (insights.losers_pages is defined and insights.losers_pages|length>0))) %}
*Keine Gewinner/Verlierer-Listen verfügbar.*
{% endif %}

---

## Performance (Core Web Vitals)

{% set c = kpis.cwv if kpis is defined and kpis.cwv is defined else none %}
{% if c %}
| Metrik | Wert (p75) |
|---|---:|
| LCP | {{ fmt_ms(c.lcp_p75_ms) }} |
| INP | {{ fmt_ms(c.inp_p75_ms) }} |
| CLS | {{ fmt_num(c.cls_p75, 3) }} |
| Status | {{ c.status|default("—") }} |
{% else %}
*Keine CWV-Daten verfügbar (Pagespeed/CrUX deaktiviert, kein Zugriff oder keine Daten).*
{% endif %}

---

## Maßnahmen (5–8)

{% if actions is defined and actions|length > 0 %}
{% for a in actions[:8] %}
### {{ loop.index }}. {{ a.title }}  {% if a.severity %}({{ a.severity }}){% endif %}

**Warum:** {{ a.reason }}

{% if a.data_refs is defined and a.data_refs|length > 0 %}
**Datenbezug:** {{ a.data_refs|join(", ") }}
{% endif %}

{% endfor %}
{% else %}
*Noch keine automatisch abgeleiteten Maßnahmen vorhanden (actions[] leer).*
{% endif %}

---

## Datenlage & Hinweise

**Data completeness score:** {{ fmt_num(data_completeness_score, 2) }}

{% if missing_sources and missing_sources|length > 0 %}
**Fehlende Quellen:** {{ missing_sources|join(", ") }}
{% else %}
**Fehlende Quellen:** keine
{% endif %}

{% if warnings and warnings|length > 0 %}
**Warnings:**
{% for w in warnings %}
- {{ w }}
{% endfor %}
{% else %}
**Warnings:** keine
{% endif %}
