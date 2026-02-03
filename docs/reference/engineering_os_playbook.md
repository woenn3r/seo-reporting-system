# Engineering OS – Umfangreicher Fahrplan für Überblick, Qualität und „immer grün“ (Playbook)

**Ziel:** Ein System, das **Komplexität kontrollierbar** macht, **Verbindungen explizit** hält und durch **automatisierte Gates** garantiert, dass am Ende alles so ist wie es sein soll – unabhängig davon, *was* du als Nächstes baust.

> Leitprinzip: **Du vertraust nicht Menschen, dass sie nichts vergessen – du baust Prozesse & Automatisierung, die Vergessen unmöglich machen.**

---

## Inhaltsverzeichnis
1. [Die 6 Säulen (das Fundament)](#die-6-säulen-das-fundament)
2. [Glossar (Begriffe, die ihr einheitlich benutzt)](#glossar-begriffe-die-ihr-einheitlich-benutzt)
3. [Repo- & Architektur-Standards](#repo--architektur-standards)
4. [Single Source of Truth & Registries](#single-source-of-truth--registries)
5. [Contracts & Schemas (Schnittstellen)](#contracts--schemas-schnittstellen)
6. [Quality Gates & CI/CD](#quality-gates--cicd)
7. [Testing-System (Unit/Integration/Contract/E2E)](#testing-system-unitintegrationcontracte2e)
8. [Release-System & Rollbacks](#release-system--rollbacks)
9. [Observability, Alerts & Runbooks](#observability-alerts--runbooks)
10. [Operations: Reviews, Ownership, Drift-Checks](#operations-reviews-ownership-drift-checks)
11. [Security & Compliance (praktisch, nicht theoretisch)](#security--compliance-praktisch-nicht-theoretisch)
12. [Developer Experience (DX): Local Dev, Tooling, Onboarding](#developer-experience-dx-local-dev-tooling-onboarding)
13. [Der Fahrplan (Phase 0–6) mit Deliverables](#der-fahrplan-phase-06-mit-deliverables)
14. [Templates (PR, ADR, Runbook, Contract, Testplan)](#templates-pr-adr-runbook-contract-testplan)
15. [Master-Checklisten (was NIE fehlen darf)](#master-checklisten-was-nie-fehlen-darf)

---

## Die 6 Säulen (das Fundament)

### Säule 1: Architektur & Grenzen
- **Domain-first**: Module nach Zuständigkeiten, nicht nach Technik („utils“-Sumpf vermeiden).
- **Dependency Rules**: Abhängigkeitsrichtungen definieren und automatisch prüfen.
- **Public APIs** pro Modul (nur Exports über ein `index.ts` / `public.ts`).

### Säule 2: Single Source of Truth (SSOT)
- Zentrale Wahrheit für Routing/Registries/Schemas/Permissions/Feature Flags.
- **Generiere** abgeleitete Artefakte (Typen, Validatoren, Tests, Doku) statt sie manuell zu pflegen.

### Säule 3: Automatisierte Quality Gates
- „Nicht grün“ = nicht mergebar.
- Gates umfassen: format/lint, typecheck, tests, build, security, migrations, smoke.

### Säule 4: Release Engineering
- Reproduzierbare Builds, Versionierung, Changelog, Feature Flags.
- Rollout ≠ Release (Flags, progressive rollout).
- Rollback als Standardprozess.

### Säule 5: Observability
- Logs + Errors + Metrics + Traces (mindestens Logs+Errors+Metrics).
- Alerts nur auf SLO-relevante Signale.
- Runbooks zu jedem Alarm.

### Säule 6: Operating System (Prozess)
- Ownership (CODEOWNERS), PR-Templates, Definition of Done.
- ADRs für Entscheidungen.
- Regelmäßige Drift-Checks und Postmortems.

---

## Glossar (Begriffe, die ihr einheitlich benutzt)
- **Contract**: Formal definierte Schnittstelle (Schema/Types), inkl. Version.
- **SSOT**: Single Source of Truth (Registry/Manifest).
- **Gate**: Automatische Prüfung, die Merge/Deploy blockiert.
- **SLO**: Service Level Objective (z. B. 99.9% erfolgreiche Runs).
- **Runbook**: Schritt-für-Schritt-Anleitung bei Alarm/Incident.
- **Trunk-based**: Entwicklung auf main mit kurzen Branches & Flags.
- **Golden Test**: Vergleich von erwarteten Output-Artefakten (Snapshots/Fixtures).

---

## Repo- & Architektur-Standards

### Empfohlener Repo-Aufbau (Monorepo-freundlich)
```txt
/
  apps/                 # deploybare Apps: web, api, worker, cli
  packages/             # wiederverwendbare Domain-/Infra-Libs
  contracts/            # OpenAPI/JSON Schema/Zod-Schemas (SSOT für IO)
  registries/           # Manifest/Registry-Files (SSOT für Routing/Features)
  infra/                # IaC, deployment, env templates
  scripts/              # generators, migrations, tooling
  docs/
    architecture/
    decisions/          # ADRs
    runbooks/
  .github/              # CI, templates
```

### Modul-Regeln (damit Übersicht bleibt)
- Jedes Domain-Modul hat:
  - `README.md` (Zweck, Public API, Beispiele)
  - `public.ts` oder `index.ts` (einziger Export-Einstieg)
  - `__tests__/` + klare Teststrategie
  - `contracts/` oder Verweis auf zentrale `contracts/`
- **No cross-import**: Kein Import aus „internen“ Pfaden anderer Module.
- **Arch-Lint**: Tooling, das Import-Regeln prüft (z. B. dep-cruiser, eslint rules, tsconfig paths + boundaries).

---

## Single Source of Truth & Registries

### Prinzip
Wenn es „vergessen“ werden kann, muss es **aus einer Registry generierbar** sein.

### Typische Registries (Beispiele)
- `registries/routes.json` → Navigation + Sitemap + RBAC + Middleware
- `registries/features.yaml` → Feature Flags + rollout rules
- `registries/pipelines.yaml` → Job-Definitionen + QA + Exporte
- `contracts/` → Typen/Validatoren/OpenAPI → Consumer/Producer Tests

### Generator-Philosophie
- Registry/Contracts sind **handgeschrieben** (reviewed).
- Alles andere ist **generated** und wird **nicht manuell** editiert.
- Generated Files bekommen Header: `// AUTO-GENERATED – DO NOT EDIT`.

---

## Contracts & Schemas (Schnittstellen)

### Was muss als Contract definiert werden?
- API Request/Response (OpenAPI)
- Events/Queues (JSON Schema)
- Config/Registry-Format (JSON Schema)
- Datenbank-Migrationen & Models (z. B. Prisma schema + migrations)
- Exporte/Artefakte (z. B. Content/CSV/JSON)

### Contract-Versionierung
- Jede Breaking Change erhöht Major Version oder nutzt versioned endpoints/events:
  - `/v1/...` → `/v2/...`
  - `event.user.created.v1` → `event.user.created.v2`
- Contract-Changelog ist Pflicht (automatisierbar).

### Consumer-Driven Contract Tests (CDCT)
- Consumer definiert Erwartung, Producer muss erfüllen.
- Vorteil: „Verbindungen“ brechen nicht unbemerkt.

---

## Quality Gates & CI/CD

### Grundsatz
**CI ist dein Qualitätsmanager.** Menschen reviewen Logik & Design – die Maschine blockiert Abweichungen.

### Pflicht-Gates (PR)
1. Format (prettier) + Lint (eslint)
2. Typecheck (tsc)
3. Unit Tests
4. Integration Tests (db/redis mocks oder containers)
5. Contract Tests
6. Build (prod build)
7. Security: dependencies + secrets + SAST
8. Optional: Golden Tests (Generators/Exports)

### Pflicht-Gates (main / release)
9. Deploy to Staging
10. Smoke Tests (E2E minimal)
11. Optional: Performance Budget (Lighthouse/PSI), wenn Web relevant
12. Deploy to Prod + progressive rollout (Flags)

### Branch Protection
- Require status checks
- Require review from CODEOWNERS
- No direct push to main
- Signed commits (optional, aber gut)
- „Merge only when up to date“

---

## Testing-System (Unit/Integration/Contract/E2E)

### Die Pyramide (bewährt)
- **Unit**: schnell, viele, reine Logik
- **Integration**: Modul-Interaktionen, Datenflüsse, Nebenwirkungen
- **Contract**: Producer/Consumer kompatibel
- **E2E Smoke**: wenige, kritische Flows, stabil und kurz

### Test-Standards
- Jede Bugfix-PR braucht mind. einen Test, der den Bug vorher reproduziert hat.
- Jede neue Registry/Generator-Änderung braucht Golden Tests.
- Tests sind deterministisch: fixed clocks, seeded randomness, stable fixtures.

---

## Release-System & Rollbacks

### Zielbild
- Build-Artefakte sind **immutable** (ein Commit → ein Artefakt).
- Release ist nachvollziehbar (Version, Changelog, deploy notes).
- Rollback ist dokumentiert und schnell.

### Empfohlene Bausteine
- Conventional Commits → auto Changelog/Versioning
- Tags/Releases im Git
- Feature Flags (deploy anytime, release later)
- Progressive rollout (z. B. 1% → 10% → 50% → 100%)
- Rollback-Button/Command + Runbook

---

## Observability, Alerts & Runbooks

### Minimum-Standard
- **Structured logs** (JSON), immer mit correlation/request id
- **Error tracking** (stack traces, breadcrumbs)
- **Metrics**: error rate, latency, throughput, job success, queue depth
- **Dashboards** für Kernpfade
- **Alerts** nur auf SLO-Brüche (sonst Alarmmüdigkeit)

### Runbooks
Zu jedem Alert existiert ein Runbook mit:
- Symptoms
- Scope/Impact
- Quick Checks
- Mitigation Steps
- Root Cause Hinweise
- Rollback/Disable (Flag)
- Owner + Escalation

---

## Operations: Reviews, Ownership, Drift-Checks

### Ownership
- CODEOWNERS pro Domain/Package/Contract
- Contract-Änderungen brauchen Owner-Review zwingend

### Review-Regeln
- Review prüft: correctness, design, contracts, tests, observability, rollout risk
- Kleine PRs bevorzugen (besser reviewbar)

### Drift-Checks (regelmäßig)
- Dependencies update (security & compatibility)
- Docs outdated check (links, diagrams)
- Registry consistency check
- Dead code / unused flags cleanup
- Alert noise review

### Postmortems (ohne Schuld)
- Timeline, Root cause, Action items
- Action items führen zu neuen Gates/Tests/Runbooks (System verbessert sich)

---

## Security & Compliance (praktisch, nicht theoretisch)

### Pflichtstandards
- Secrets niemals im Repo (secret scanning in CI)
- Dependency scanning (CVEs) + Renovate/Dependabot
- SAST (Bandit/CodeQL/semgrep)
- RBAC / least privilege (Infra)
- Audit trails (Deployments, Admin actions)
- Data handling: PII classification + retention + backups

### Supply Chain
- Lockfiles verpflichtend
- Reproducible builds
- Optional: SBOM generation

---

## Developer Experience (DX): Local Dev, Tooling, Onboarding

### Local Dev: „One command to run“
- `make dev` oder `pnpm dev` startet alles notwendige
- `.env.example` + env validation (fail fast)
- Seed scripts für DB, fixtures
- Pre-commit hooks (format/lint/tests subset)

### Onboarding
- `docs/onboarding.md`: Setup steps + common pitfalls
- `docs/dev-workflow.md`: branch strategy, PR rules, releases
- „First PR“ checklist

---

# Der Fahrplan (Phase 0–6) mit Deliverables

## Phase 0 – Playbook Repo & Verbindlichkeit
**Deliverables**
- `docs/engineering-playbook.md` (dieses Dokument)
- `docs/architecture/overview.md` + Diagramme
- `docs/decisions/README.md` + ADR template
- PR/Issue/RFC templates in `.github/`

**Akzeptanzkriterien**
- Jeder kennt die Regeln, sie sind kurz und verbindlich.
- PR-Templates erzwingen die wichtigsten Checks.

---

## Phase 1 – Repo-Struktur, Modulgrenzen, Ownership
**Deliverables**
- Finaler Repo-Tree + Naming conventions
- `CODEOWNERS`
- Arch boundary checks (lint/dep rules)

**Akzeptanzkriterien**
- Cross-module imports werden automatisch geblockt.
- Jede Änderung hat einen klaren Owner.

---

## Phase 2 – Contracts & SSOT (Registry-getrieben)
**Deliverables**
- `contracts/` + Schema validation pipeline
- `registries/` + generators
- Generated artifacts + golden tests

**Akzeptanzkriterien**
- Neue Features werden über Registry/Contracts integriert.
- „Vergessen zu verbinden“ ist nicht mehr möglich, weil Generatoren es ableiten.

---

## Phase 3 – CI Quality Gates (harter Wächter)
**Deliverables**
- CI Pipeline mit required checks
- Branch protection
- Security scanning + secret scanning
- Build + test + contract + migrations checks

**Akzeptanzkriterien**
- main bleibt immer deploybar (green).
- Kein Merge ohne vollständige Gates.

---

## Phase 4 – Testsystem (Pyramide + Golden + CDCT)
**Deliverables**
- Unit/Integration/Contract/E2E Struktur
- Test utilities (fixtures, clocks, seeders)
- Golden tests für generator outputs

**Akzeptanzkriterien**
- Kritische Änderungen werden durch Tests abgesichert.
- Output-Artefakte ändern sich nur bewusst (reviewable diffs).

---

## Phase 5 – Release Engineering (Flags, progressive rollout, rollback)
**Deliverables**
- Versioning + changelog automation
- Staging + smoke tests
- Feature flags system
- Rollback runbooks + tooling

**Akzeptanzkriterien**
- Release ist nachvollziehbar und rückrollbar.
- Deployments sind langweilig (keine Überraschungen).

---

## Phase 6 – Observability & Operating Rhythm (dauerhaft sauber)
**Deliverables**
- Dashboards + SLOs + Alerts
- Runbooks
- Drift-check schedule
- Postmortem template + action item tracking

**Akzeptanzkriterien**
- Probleme werden früh erkannt.
- System verbessert sich kontinuierlich (Action items → neue Gates/Tests).

---

# Templates (PR, ADR, Runbook, Contract, Testplan)

## PR Template (Markdown)
```md
## Was ändert sich?
- …

## Warum?
- …

## Risiken / Rollout
- [ ] Feature Flag genutzt
- [ ] Progressive rollout geplant
- [ ] Rollback-Plan vorhanden

## Contracts / SSOT
- [ ] Contract/Schemas angepasst (falls IO betroffen)
- [ ] Registry/Manifest angepasst (falls Routing/Feature betroffen)

## Tests
- [ ] Unit
- [ ] Integration
- [ ] Contract (CDCT)
- [ ] Golden (Generator/Exports)
- [ ] E2E Smoke (falls relevant)

## Observability
- [ ] Logs/Correlation IDs
- [ ] Metrics/Alerts angepasst
- [ ] Runbook aktualisiert (falls kritisch)

## Definition of Done
- [ ] CI grün
- [ ] CODEOWNER review
- [ ] Docs/ADR aktualisiert (falls Entscheidung)
```

## ADR Template
```md
# ADR-XXXX: Titel

## Kontext
…

## Entscheidung
…

## Alternativen
…

## Konsequenzen / Tradeoffs
…

## Migrationsplan (falls nötig)
…

## Links
…
```

## Runbook Template
```md
# Runbook: <Alert Name>

## Symptome
…

## Impact / Scope
…

## Quick Checks (5 min)
1) …
2) …

## Mitigation (15–30 min)
1) …
2) …

## Rollback / Disable
- Flag: …
- Command/Link: …

## Root Cause Hinweise
…

## Owner / Escalation
- Primary: …
- Backup: …
```

## Contract Template (JSON Schema / Zod)
**Regel:** Jeder Contract hat Version, Owner, Changelog Referenz.
```txt
contracts/
  user.created/
    v1.schema.json
    v1.md           # Human readable
    changelog.md
```

## Testplan Template (pro Modul)
```md
# Testplan: <module>

## Unit
- …

## Integration
- …

## Contract
- …

## Golden
- …

## E2E Smoke
- …
```

---

# Master-Checklisten (was NIE fehlen darf)

## Master Checklist: Neues Feature
- [ ] Domain/Modul zugeordnet (Owner klar)
- [ ] Contract definiert/aktualisiert (Version geprüft)
- [ ] Registry/SSOT aktualisiert (wenn Verbindung nötig)
- [ ] Generator output aktualisiert + Golden tests
- [ ] Unit + Integration + Contract tests
- [ ] CI grün + required checks
- [ ] Observability (logs/metrics/errors) ok
- [ ] Feature flag (wenn riskant) + rollout plan
- [ ] Docs/ADR (wenn Entscheidung) + runbook (wenn kritisch)

## Master Checklist: Breaking Change
- [ ] Major version / v2 endpoint / v2 event
- [ ] Deprecation plan + timeline
- [ ] Consumer/Producer kompatibel (CDCT)
- [ ] Migration docs + rollback plan
- [ ] Staging soak test + progressive rollout

## Master Checklist: Incident Response
- [ ] Alert triage + impact assessment
- [ ] Mitigation (flag/rollback)
- [ ] Postmortem innerhalb 48–72h
- [ ] Action items (Gates/Tests/Runbooks) umgesetzt

---

## Anhang: „Perfekt läuft“ als Systemregel
> **Perfektion entsteht nicht durch mehr Regeln im Kopf, sondern durch:**
> 1) SSOT + Contracts (Verbindungen explizit)  
> 2) CI Gates (Automatisierung erzwingt Korrektheit)  
> 3) Observability + Runbooks (Betriebssicherheit)  
> 4) Ownership + Drift-Checks (langfristige Stabilität)

