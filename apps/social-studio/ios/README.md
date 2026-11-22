# Social Studio – iOS-App (SwiftUI)

Native Begleit-App zur Social-Studio-Web-UI: Skripte, Shotlisten/Perspektiven, Drehplan (Call Sheet),
Video-Upload, „Zum Schnitt freigeben“ und Freigaben mit Zeitstempel-Kommentaren – mobil, auch am Set.

> **Status: nicht kompiliert.** Der Code wurde in einer Linux-Umgebung ohne Swift-Toolchain
> geschrieben (SwiftUI gibt es nur auf Apple-Plattformen, der Download von swift.org war zudem
> blockiert). Geprüft wurden ausschließlich Syntax (tree-sitter-swift, alle Dateien fehlerfrei)
> sowie per Skript die 1:1-Abdeckung des Contracts (alle Felder, Optionalität, Enum-Werte) und
> die Lokalisierung (`tools/check_l10n.py`: Schlüssel, Platzhalter, Pluralformen, keine Hardcoded-Texte).
> **Typprüfung, Build, Tests und UI müssen auf einem Mac verifiziert werden** – siehe Checkliste unten.

## Voraussetzungen

- macOS mit **Xcode 15 oder neuer** (iOS 17 SDK, Swift 5.9+)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- Keine Drittanbieter-Abhängigkeiten

## Starten

```bash
cd apps/social-studio/ios
xcodegen generate          # erzeugt SocialStudio.xcodeproj + SocialStudio/Info.plist
open SocialStudio.xcodeproj
```

In Xcode unter *Signing & Capabilities* ein Team wählen (`DEVELOPMENT_TEAM` ist bewusst leer) und
ggf. die Bundle-ID `com.example.socialstudio` anpassen. Tests: ⌘U (Scheme `SocialStudio`).

Das `.xcodeproj` und die generierte `Info.plist` sind per `.gitignore` ausgeschlossen –
`project.yml` ist die Quelle.

## Architektur

```
SocialStudio/
  App/            SocialStudioApp (Einstieg), RootView (TabView + Fehler-Alert)
  Domain/
    Models.swift        Codable-Modelle 1:1 zu contracts/social_studio/v1.schema.json
    WorkspaceStore.swift @Observable, @MainActor – Zustand + ALLE Workflow-Aktionen
    Persistence.swift   JSON in Application Support, Videos in Application Support/SocialStudio/Media
    DateUtils.swift     Helfer für date (yyyy-MM-dd) / time (HH:mm) / Timecodes
  Features/
    Overview/   Übersicht: Kundenwechsler, Zähler pro Stufe, Freigaben, nächste Drehs, Aktivität
    Pipeline/   Liste nach Stufen + Filter-Chips, Content-Detail (Überblick/Skript/Shots/Medien), Anlegen/Bearbeiten
    Script/     Skript lesen/bearbeiten, einreichen, freigeben, Änderungen anfordern, neue Version, Review-Screen
    Shots/      Shotliste (Einstellungsgröße, Winkel, Bewegung, Format, Objektiv), Sortieren, „Am Set“-Modus
    Media/      Upload (Fotos/Dateien), Rohmaterial zum Schnitt freigeben, Schnitt starten, Video-Review
    Shoots/     Drehplan, Call Sheet (Ablauf, Karte, Team, Equipment-Checkliste, Shotlisten), Editor
    Approvals/  Freigaben-Eingang
    Settings/   Nutzer-Umschaltung (Rollen), Kunden, Team, Demo-Daten zurücksetzen
SocialStudioTests/  Unit-Tests der Domänenregeln gegen die gemeinsamen Seed-Daten
```

**Ein Datenvertrag für Web und iOS:**

| Quelle | Rolle |
|---|---|
| `contracts/social_studio/v1.schema.json` | SSOT des Datenmodells (camelCase-Felder) |
| `examples/social_studio/workspace.json` | Seed-/Demo-Daten – per `project.yml` ins App- und Test-Bundle **referenziert** (nicht kopiert) |
| `apps/social-studio/DOMAIN_RULES.md` | Verbindliche Übergänge (Pipeline, Skript-/Schnitt-Freigabe, Rollen) |

Abbildung im Code:
- `date`/`time`-Felder bleiben `String` (kein Zeitzonen-Drift beim Round-Trip), `dateTime` → `Date`,
  kodiert als ISO 8601 UTC mit `Z`; beim Lesen werden auch Sekundenbruchteile/Offsets akzeptiert.
- Optionale Contract-Felder sind Swift-Optionals und werden beim Speichern weggelassen (kein `null`).
- Neue IDs erfüllen das Contract-Pattern (`IDGenerator`, getestet).
- Swift-Namen weichen nur dort ab, wo Swift kollidiert: `ContentItem` (Contract `content`),
  `ScriptScene` (`scene`, Konflikt mit `SwiftUI.Scene`), `CameraMovement.staticShot` (= `"static"`),
  `MediaKind.finalCut` (= `"final"`). Die JSON-Werte sind identisch.

Workflow-Logik liegt ausschließlich in `WorkspaceStore` (Views rufen nur Aktionen auf). Ungültige
Übergänge werfen `DomainError` mit deutscher Meldung, die als Alert erscheint.

## Sprachen (Deutsch, English, Русский)

- **Quelle:** gemeinsame JSON-Dateien in `apps/social-studio/i18n/` – `common.<lang>.json`
  (Fachbegriffe, Status, Fehlermeldungen, Aktivitäten; identisch mit der Web-App) und
  `ios.<lang>.json` (iOS-Oberflächentexte). Beide werden per `project.yml` referenziert (nicht kopiert)
  in App- und Test-Bundle aufgenommen.
- **Laufzeit:** `Domain/Localization.swift` – `L10n.t("key", ["param": …])`, Plurale über
  `L10n.tp("key", count:)` mit CLDR-Regeln (Russisch: one/few/many). Fehlender Schlüssel → Deutsch →
  Schlüssel selbst (+ Assertion in DEBUG).
- **Umschalten:** *Mehr → Sprache*. Wirkt sofort auf die ganze App inkl. Datums-, Zahl- und
  Dateigrößenformaten (`de_DE` / `en_GB` / `ru_RU`); gespeichert in `UserDefaults`. Standard beim
  ersten Start: erste unterstützte Systemsprache, sonst Englisch.
- **Aktivitäten** werden strukturiert gespeichert (`activity.params`, Contract v1.1) und in der Sprache
  des Betrachters angezeigt; `message` enthält zusätzlich den Text in der Sprache des Autors (Fallback).
- **Fehlermeldungen** (`DomainError`) tragen nur Schlüssel + Parameter und werden beim Anzeigen übersetzt.
- **Nicht übersetzt** werden Nutzerinhalte (Titel, Skripttexte, Demo-Daten aus `workspace.json` sind deutsch).
- **Prüfen:** `python3 apps/social-studio/ios/tools/check_l10n.py` (läuft ohne Xcode) und
  `LocalizationTests` (⌘U).

## Rollen (Demo)

Unter *Mehr → Angemeldet als* lässt sich der Nutzer wechseln. Kunden-Nutzer sehen nur ihren Kunden,
kein Rohmaterial, keine internen Notizen (Brand-Notizen, Shot-Notizen) und können nur
freigeben/Änderungen anfordern/kommentieren. **Das ist keine Sicherheitsgrenze** – alle Daten liegen
lokal auf dem Gerät. Echte Zugriffskontrolle braucht ein Backend mit Authentifizierung.

## Bekannte Einschränkungen / offene Punkte

- **Kein Backend / keine Synchronisation:** Daten und Videos liegen nur lokal; Web-App und iOS-App
  teilen sich das Datenmodell, aber (noch) keinen Server. Für echten Teambetrieb nötig: Auth,
  API, Objekt-Storage mit resumable Uploads (große Rohdateien!), Push-Benachrichtigungen.
- Videos werden beim Upload in den App-Container kopiert – bei großen Rohdateien kostet das
  Gerätespeicher. Seed-Medien sind reine Metadaten („Datei nur als Metadaten vorhanden“).
- Equipment-Pack-Checkliste im Call Sheet ist bewusst nur temporär (nicht im Contract).
- Kamera-Aufnahme direkt in der App ist nicht umgesetzt (Usage-Descriptions sind vorbereitet).
- Kein App-Icon / keine Asset-Catalogs.

## Auf dem Mac zu verifizieren

1. `xcodegen generate` läuft durch; Seed-Datei erscheint unter *Copy Bundle Resources* beider Targets.
2. Build ohne Fehler (iOS 17 Simulator). Besonders prüfen, da ungetestet:
   `PickedMovie` (Transferable/`FileRepresentation`), `.fileImporter`, `VideoPlayer`,
   `@Observable` + `@Environment(WorkspaceStore.self)`, `FlowLayout` (Layout-Protokoll).
3. ⌘U: alle `WorkspaceStoreTests` und `LocalizationTests` grün (u. a. Seed-Round-Trip ohne Datenverlust).
4. Manuell: Video aus Fotos und aus Dateien hochladen, Rohmaterial → „Zum Schnitt freigeben“,
   Schnitt hochladen → erscheint in Freigaben → Zeitstempel-Kommentar → Freigeben.
5. Rollenwechsel auf „Paul Wagner (Kunde)“: nur Studio Puls sichtbar, kein Rohmaterial.
6. App neu starten → Änderungen bleiben erhalten; „Demo-Daten zurücksetzen“ stellt Seed wieder her.
7. Dynamic Type (größte Stufe) und VoiceOver in Pipeline, Shotliste und Am-Set-Modus.
8. Sprache unter *Mehr → Sprache* auf English und Русский stellen: alle Tabs, Sheets, Alerts und
   Datumsangaben wechseln sofort; russische Texte auf Abschneiden prüfen (längere Wörter), v. a. im
   segmentierten Picker der Content-Detailansicht und im Formatwähler der Shotliste.
