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

## Architektur & Single Source of Truth

```
contracts/social_studio/v1.schema.json   ← Datenmodell (SSOT, JSON Schema 2020-12)
examples/social_studio/workspace.json    ← Demo-/Seed-Daten (Web + iOS binden dieselbe Datei ein)
apps/social-studio/DOMAIN_RULES.md       ← verbindliche Workflow-Regeln (Pipeline, Freigaben, Rollen)
apps/social-studio/web/                  ← React + TypeScript + Vite
apps/social-studio/ios/                  ← SwiftUI (iOS 17+), XcodeGen
```

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

## Web-App starten

Voraussetzung: Node.js 22.12+ (oder 24+).

```bash
cd apps/social-studio/web
npm ci
npm run dev        # http://localhost:5173
npm test           # Domänen-Tests
npm run build      # Typecheck + Produktions-Build nach dist/
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
