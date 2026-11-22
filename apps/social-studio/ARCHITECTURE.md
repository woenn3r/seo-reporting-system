# Social Studio – Architektur & Erweiterung

Ziel dieses Dokuments: Änderungen sollen an **einer** definierten Stelle beginnen und von Tests abgefangen
werden, wenn eine zweite Stelle vergessen wurde.

## Schichten

```
contracts/social_studio/v1.schema.json     Datenmodell (SSOT) – Web und iOS lesen/schreiben exakt dieses Format
apps/social-studio/DOMAIN_RULES.md         Regeln (Übergänge, Rechte, Integrität) – verbindlich für beide Clients
apps/social-studio/i18n/*.json             Texte de/en/ru (common = Fachbegriffe/Fehler/Aktivitäten, web, ios)

web/src/domain/     reine Logik, keine UI, kein i18n, kein Speicher
  types.ts            TypeScript-Spiegel des Contracts (Enums als const-Arrays)
  actions.ts          alle schreibenden Regeln: (workspace, ctx) → neuer workspace; wirft DomainError(key, params)
  permissions.ts      Rollen-/Rechte-Matrix – von Aktionen erzwungen und von der UI abgefragt
  selectors.ts        lesende Regeln: Sichtbarkeit pro Rolle, Freigaben-Eingang, Queues
  integrity.ts        Verweisprüfung (was das JSON Schema nicht ausdrücken kann)
  validate.ts         Schema-Validierung (AJV) gegen den Contract
web/src/i18n/       Übersetzen, Formatieren (Datum/Zahl je Sprache), Fehler- und Aktivitätstexte
web/src/store/      Zustand + Persistenz hinter Schnittstellen (persistence.ts)
web/src/components, pages   Darstellung; ruft nur domain/-Aktionen über store.run() auf
web/e2e/            Browser-Tests (Playwright)

ios/SocialStudio/Domain     Models (Codable ↔ Contract), WorkspaceStore (Regeln), Localization, Persistence
ios/SocialStudio/Features   SwiftUI-Views
```

Abhängigkeiten zeigen nur nach unten: `pages → components → store → domain`. `domain/` importiert nichts
aus den anderen Ordnern – deshalb ist die Logik ohne Browser testbar und auf einen Server übertragbar.

## Sicherheitsnetze

| Netz | Fängt ab |
|---|---|
| TypeScript: Übersetzungsschlüssel und `ErrorKey` sind Typen | unbekannter Schlüssel, Fehlermeldung ohne Übersetzung |
| `store.commit()` prüft **jede** Änderung gegen Schema + Integrität | Daten, die den Contract verletzen, werden nie gespeichert |
| `actions.test.ts` (jede Aktion → `valid()`) | Regel-, Rechte- und Integritätsfehler |
| `i18n.test.ts` | fehlende Sprache/Schlüssel/Platzhalter/Pluralform (auch für iOS), harter Text in Komponenten |
| `e2e/` | kompletter Ablauf in 3 Sprachen, Rollen per URL, Mobil-Layout, Regressionen |
| `test_social_studio_contract.py` | Demo-Daten passen zu Schema + Integrität |
| iOS: `check_l10n.py`, XCTests | fehlende Schlüssel, Regelabweichungen (XCTests erst auf dem Mac ausführbar) |

## Rezepte

### Neues Feld (z. B. `content.budget`)
1. `contracts/.../v1.schema.json` (optional = abwärtskompatibel) + `changelog.md`, ggf. Demo-Daten.
2. `web/src/domain/types.ts`; in `actions.ts` zum Patch-Typ und – wenn optional – zur `*_OPTIONAL`-Liste.
3. iOS `Models.swift` (optional → `String?`).
4. UI-Feld + Übersetzungsschlüssel in **allen drei** Sprachen (Test schlägt sonst fehl).

### Neue Pipeline-Phase
1. Enum `stage` im Contract, `STAGES` in `types.ts` (Reihenfolge = Pipeline-Reihenfolge), `Stage` in Swift.
2. `stage.<name>` in `common.{de,en,ru}.json`, Farbe in `web/src/domain/labels.ts` (`STAGE_TONE`).
3. Falls eine Aktion automatisch dorthin führen soll: `setStage(...)` in der passenden Aktion + Zeile in
   `DOMAIN_RULES.md` + Test. Board, Filter, Übersicht und Kalender übernehmen die Phase automatisch.

### Neue Rolle oder geändertes Recht
1. Enum `role` im Contract, `ROLES` in `types.ts`, `role.<name>` in `common.*.json`.
2. Rechte in `permissions.ts` (`ROLE_PERMISSIONS`) vergeben – Aktionen und UI folgen automatisch.
3. Dieselbe Matrix in iOS (`WorkspaceStore`/Permissions) und in `DOMAIN_RULES.md`.

### Neue Aktion (z. B. „Content duplizieren“)
1. Regel in `DOMAIN_RULES.md` beschreiben.
2. Funktion in `actions.ts`: `authorize(...)`, validieren, neuen Workspace zurückgeben, `log(...)` mit einem
   Event. Neues Event → Enum `activity.params.event` im Contract + `activity.<event>` in `common.*.json`.
3. Test in `actions.test.ts` (inkl. „Kunde darf nicht“), Button in der UI über `run(...)`, iOS-Gegenstück.

### Neue Sprache
1. `common.<lang>.json`, `web.<lang>.json`, `ios.<lang>.json` anlegen (alle Schlüssel).
2. `LANGS` + `LOCALE` in `web/src/i18n/index.ts`, `lang.<code>` in common, `REQUIRED_PLURALS` im Test;
   iOS: `AppLanguage` + Pluralregel in `Localization.swift`, `CFBundleLocalizations` in `project.yml`.

### Backend anbinden (geplanter nächster Schritt)
Die App spricht mit dem Speicher nur über `web/src/store/persistence.ts`:
* `WorkspaceRepository` (laden, speichern, auf fremde Änderungen hören) – heute `localStorage`.
* `MediaStorage` (Dateien ablegen/holen/löschen) – heute IndexedDB.

Vorgehen:
1. Server hält dasselbe JSON-Format (Contract) und **erzwingt dieselben Regeln**: `domain/` ist reines
   TypeScript ohne Browser-APIs und kann serverseitig (Node/Edge-Funktion) unverändert laufen. Client-Prüfungen
   bleiben als Komfort, sind aber kein Schutz.
2. `WorkspaceRepository` gegen die API implementieren; `subscribe()` an Server-Push (Realtime/WebSocket) hängen.
3. `MediaStorage` gegen Objekt-Speicher mit fortsetzbaren Uploads implementieren.
4. Demo-Nutzerumschalter (`setCurrentUser`) durch echte Anmeldung ersetzen; `ctx.actorId` kommt dann aus der Sitzung.

Bekannte Grenze: Der Store arbeitet heute synchron mit dem ganzen Workspace als ein Dokument. Für mehrere
gleichzeitige Nutzer muss der Server Aktionen einzeln entgegennehmen (nicht den ganzen Workspace überschreiben)
und die Oberfläche auf optimistische Updates mit Fehler-Rückweg umgestellt werden – `run()` ist dafür die
einzige Stelle, die angepasst werden muss, weil keine Komponente den Zustand direkt verändert.
