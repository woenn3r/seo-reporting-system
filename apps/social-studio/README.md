# Social Studio – Produktions-App für Social-Media-Agenturen

Desktop-Web-UI + native iOS-App für den kompletten Produktionsprozess von Kurzvideos & Posts:
**Idee → Skript → Skript-Freigabe → Dreh → Schnitt → Schnitt-Freigabe → Geplant → Veröffentlicht.**

Aufbau angelehnt an Tools wie OpenSEO: linke Sidebar mit **Kunden-Umschalter** (wie der Projekt-Switcher),
gruppierte Navigation, Arbeitsbereiche als eigene Seiten. Die iOS-App ist die mobile Begleitung –
vor allem für Freigaben unterwegs und für die Arbeit **am Set**.

| Bereich | Web (Desktop) | iOS |
|---|---|---|
| Übersicht (Kennzahlen, Pipeline, Freigaben, Drehs, Aktivität) | ✅ | ✅ |
| Content-Pipeline (Kanban mit Drag & Drop, Liste, Suche) | ✅ | ✅ (Liste + Filter) |
| Skripte (Hook, Szenen mit Bild/VO/Text-Einblendung/Dauer, Caption, Hashtags, CTA, Versionen) | ✅ | ✅ |
| Skript-Freigabe (einreichen, freigeben, Änderungen mit Pflicht-Kommentar) | ✅ | ✅ |
| Shotlisten & Perspektiven (Einstellungsgröße, Perspektive, Bewegung, Format, Objektiv, Szene) | ✅ | ✅ inkl. „Am Set“-Modus |
| Drehplan / Call Sheet (Location, Crew, Ablauf, Equipment, Shotlisten, Drucken/PDF) | ✅ | ✅ |
| Video-Upload (Rohmaterial, Schnittversionen, Final, Thumbnail) | ✅ Drag & Drop | ✅ Fotos/Dateien |
| „Zum Schnitt freigeben“ + Schnitt-Queue | ✅ | ✅ |
| Video-Review mit Zeitstempel-Kommentaren, Marker auf der Zeitachse, Freigabe | ✅ | ✅ |
| Freigaben-Eingang (nur neueste Version pro Content) | ✅ | ✅ |
| Redaktionskalender (Posts, Drehs, Deadlines) | ✅ | – |
| Kunden (Kanäle, Content-Säulen, Tonalität), Team & Rollen | ✅ | ✅ (lesen/umschalten) |
| Kundenansicht (Rolle `client`: nur eigener Kunde, kein Rohmaterial, keine internen Notizen) | ✅ | ✅ |
| JSON-Export/-Import (gegen Contract validiert) | ✅ | – |
| **Sprachen Deutsch / English / Русский** (Umschalter, Datums-/Zahlenformate, Pluralformen) | ✅ | ✅ |

## Architektur & Single Source of Truth

```
contracts/social_studio/v1.schema.json   ← Datenmodell (SSOT, JSON Schema 2020-12)
examples/social_studio/workspace.json    ← Demo-/Seed-Daten (Web + iOS binden dieselbe Datei ein)
apps/social-studio/DOMAIN_RULES.md       ← verbindliche Workflow-Regeln (Pipeline, Freigaben, Rollen)
apps/social-studio/web/                  ← React + TypeScript + Vite
apps/social-studio/ios/                  ← SwiftUI (iOS 17+), XcodeGen
```

* **Aufbau und Erweiterung:** siehe [`ARCHITECTURE.md`](ARCHITECTURE.md) (Schichten, Sicherheitsnetze, Rezepte für neue Felder/Phasen/Rollen/Sprachen/Backend).
* **Web:** reine Domänenfunktionen in `web/src/domain/actions.ts` (immutable, testbar). Der Store
  validiert **jede** Änderung per AJV gegen das JSON Schema, bevor sie gespeichert wird – Daten, die den
  Contract verletzen, können aus der UI nicht entstehen. Persistenz: `localStorage` (Metadaten),
  IndexedDB (Video-/Bilddateien).
* **iOS:** `WorkspaceStore` (`@Observable`, `@MainActor`) implementiert dieselben Regeln; Persistenz als
  JSON in *Application Support*, Videos im App-Container. Details: [`ios/README.md`](ios/README.md).
* **Tests:**
  * Python (`app/tests/test_social_studio_contract.py`): Schema-Validität + referentielle Integrität der Seed-Daten.
  * Web (`npm test`): alle Workflow-Übergänge, Versionierung, Sichtbarkeit; jeder Zwischenzustand wird gegen das Schema geprüft.
  * iOS (`SocialStudioTests`): Domänenregeln + verlustfreier JSON-Roundtrip der Seed-Daten.
  * CI (`.github/workflows/ci.yml`): Job `social-studio-web` (Typecheck, Tests, Build) + Contract-Check im bestehenden `validate`-Job.

## Mehrsprachigkeit (de / en / ru)

* **Eine Quelle für beide Apps:** `apps/social-studio/i18n/` – `common.<lang>.json` (Fachbegriffe, Status,
  Fehlermeldungen, Aktivitäten), `web.<lang>.json` (Web-UI), `ios.<lang>.json` (iOS-UI). Flache Schlüssel,
  Platzhalter `{name}`, Pluralformen als Objekt (`one/other`; Russisch `one/few/many/other`).
* **Sprachwahl:** Startet in der Browser-/Systemsprache, falls de/en/ru, sonst Englisch; umschaltbar
  (Web: Sidebar und Einstellungen, iOS: Einstellungen), wird gespeichert. Datum, Uhrzeit, relative Zeiten,
  Dateigrößen und Wochentage folgen der Sprache (de-DE / en-GB / ru-RU).
* **Aktivitäten** werden sprachneutral gespeichert (`activity.params`, Contract v1.1) und in der Sprache des
  Betrachters angezeigt – eine Freigabe, die auf Russisch erteilt wurde, liest ein deutscher Kollege auf Deutsch.
* **Nicht übersetzt** werden Inhalte, die Nutzer selbst eingeben (Titel, Skripttexte, Kommentare) – auch die
  Demo-Daten sind deshalb deutsch.
* **Absicherung:** Tests prüfen, dass alle Sprachen exakt dieselben Schlüssel, Platzhalter und Pluralformen
  haben, jeder Enum-Wert übersetzt ist und keine Komponente harten Text enthält (`web/src/i18n/i18n.test.ts`,
  läuft in CI auch für die iOS-Dateien); dazu `ios/tools/check_l10n.py` und XCTests für iOS.
* **Neue Texte hinzufügen:** Schlüssel in **allen drei** Dateien eines Namespace ergänzen – sonst schlägt der Test fehl.
  In TypeScript ist ein unbekannter Schlüssel ein Compiler-Fehler.

## Lokal mit OrbStack (oder Docker Desktop)

Voraussetzung: OrbStack läuft. Alle Befehle im Ordner `apps/social-studio/`:

```bash
docker compose up web-dev                         # Entwicklung mit Live-Reload → http://localhost:5173
docker compose up --build web                     # Produktions-Build hinter nginx → http://localhost:8080

docker compose --profile test build check         # Typecheck + Unit-Tests + Build (Build bricht bei Fehlern ab)
docker compose --profile test run --rm e2e        # Browser-Tests gegen den nginx-Build
docker compose --profile test run --rm contracts  # Datenvertrag + Demo-Daten (Python)
docker compose down                               # alles stoppen
```

Die Browser-Tests (`web/e2e/`) prüfen: den kompletten Produktionsablauf (Skript → Freigabe → Shot →
Rohmaterial → Schnitt → Video-Kommentar mit Zeitstempel → Freigabe → Persistenz) **in allen drei Sprachen**,
Drag & Drop, die Kundenansicht (kein Rohmaterial, keine fremden Kunden), dass jede Seite inkl. Dialogen und
Fehlermeldungen vollständig in der gewählten Sprache ist, den Sprachwechsel, und dass auf dem Handy nichts überläuft.

Hinweise:
* Die App speichert im Browser (localStorage/IndexedDB) – Daten auf `:5173` und `:8080` sind getrennt.
  „Einstellungen → Auf Demo-Daten zurücksetzen“ setzt zurück.
* Die **iOS-App** läuft nicht in Docker: Dafür braucht es Xcode auf dem Mac (siehe `ios/README.md`).
* Das Playwright-Image (`Dockerfile`, CI) und `@playwright/test` in `web/package.json` müssen dieselbe Version haben.

## Web-App starten (ohne Docker)

Voraussetzung: Node.js 22.12+ (oder 24+).

```bash
cd apps/social-studio/web
npm ci
npm run dev        # http://localhost:5173
npm test           # Domänen-Tests
npm run build      # Typecheck + Produktions-Build nach dist/
npm run e2e        # Browser-Tests (baut + startet die App selbst; einmalig: npx playwright install chromium)
```

Links unten in der Sidebar lässt sich der **Demo-Nutzer** umschalten (z. B. „Paul Wagner – Kunde“), um die
Kundenansicht zu sehen. *Einstellungen → Auf Demo-Daten zurücksetzen* stellt den Ausgangszustand her.

## iOS-App starten

Siehe [`ios/README.md`](ios/README.md) (macOS + Xcode 15+, `brew install xcodegen`, `xcodegen generate`).

## Ehrlicher Stand / Grenzen dieser Version

Dies ist ein **funktionsfähiger Prototyp ohne Server**. Bewusst noch nicht enthalten:

1. **Kein Backend, keine Synchronisation:** Web und iOS speichern lokal auf dem jeweiligen Gerät. Team-Arbeit
   über mehrere Geräte erfordert ein Backend (API + Datenbank). Der Contract ist dafür als API-Format gedacht.
2. **Keine echte Anmeldung:** Der Nutzer-Umschalter ist eine Demo. Rollen/Sichtbarkeit sind nur clientseitig
   umgesetzt – **kein Zugriffsschutz**. Für Kundenzugänge braucht es serverseitige Autorisierung.
3. **Video-Speicher:** Browser-Speicher (IndexedDB) ist pro Browser begrenzt und nicht für mehrere GB Rohmaterial
   gedacht. Produktiv: Objekt-Speicher (z. B. S3-kompatibel) mit fortsetzbaren Multipart-Uploads, Proxy-/Vorschau-
   Transcoding und signierten URLs.
4. **iOS-Code nicht kompiliert:** In der Entwicklungsumgebung gab es keine Swift-Toolchain. Build und Tests müssen
   auf einem Mac laufen (Checkliste in `ios/README.md`).
5. **Kein Auto-Publishing:** Veröffentlichen auf Instagram/TikTok/YouTube/LinkedIn ist manuell
   („Als veröffentlicht markieren“). Plattform-APIs haben eigene Freigabe-/Review-Prozesse.
6. Equipment-Häkchen im Call Sheet sind eine lokale Packhilfe und werden nicht gespeichert (nicht im Contract).

## Nächste sinnvolle Schritte (Vorschlag)

1. Backend-Entscheidung (z. B. Supabase/Postgres + Storage oder eigene API) und Auth mit Rollen inkl. Kundenportal.
2. Upload-Pipeline für große Videos (resumable, Proxy-Transcoding, Thumbnails).
3. Benachrichtigungen (E-Mail/Push), wenn etwas zur Freigabe bereitliegt oder Änderungen angefordert wurden.
4. Gemeinsame Sync-Schicht für Web + iOS auf Basis des Contracts (Versionierung `schemaVersion`).
5. Optional: Planungs-/Publishing-Integrationen, Reporting (Reichweite pro Content-Säule).
