# Social Studio – Domänenregeln (verbindlich für Web & iOS)

Datenmodell: `contracts/social_studio/v1.schema.json` (SSOT).
Demo-/Seed-Daten: `examples/social_studio/workspace.json` (wird von Web und iOS direkt eingebunden).

Beide Clients implementieren **dieselben** Übergänge. Ändert sich eine Regel, wird sie hier,
in `apps/social-studio/web/src/domain/actions.ts` und in
`apps/social-studio/ios/SocialStudio/Domain/WorkspaceStore.swift` angepasst (+ Tests).

## Pipeline (Content.stage)

| # | stage           | Anzeige (DE)        | typische Aktion, die hierhin führt              |
|---|-----------------|---------------------|-------------------------------------------------|
| 0 | `idea`          | Idee                | Content angelegt                                |
| 1 | `script`        | Skript              | Skript angelegt / Änderungen angefordert        |
| 2 | `script_review` | Skript-Freigabe     | Skript eingereicht                              |
| 3 | `shoot`         | Dreh                | Skript freigegeben                              |
| 4 | `edit`          | Schnitt             | Rohmaterial zum Schnitt freigegeben / Schnitt-Änderungen angefordert |
| 5 | `cut_review`    | Schnitt-Freigabe    | Schnittversion hochgeladen                      |
| 6 | `scheduled`     | Geplant             | Schnitt freigegeben                             |
| 7 | `published`     | Veröffentlicht      | manuell „Als veröffentlicht markieren“          |

* Manuelles Verschieben (Kanban / Menü) ist jederzeit in jede Stufe erlaubt.
* Automatische Übergänge durch Workflow-Aktionen setzen die Stufe **nur nach vorne**
  (Ausnahme: „Änderungen angefordert“ setzt bewusst zurück auf `script` bzw. `edit`).

## Skript-Freigabe (Script.status)

| Aktion               | erlaubt aus                        | neuer Status         | Content.stage                       |
|----------------------|------------------------------------|----------------------|-------------------------------------|
| Bearbeiten           | `draft`, `changes_requested`       | unverändert          | –                                   |
| Neue Version         | `approved`, `in_review` (nur von der aktuellen Version) | `draft`, version + 1 | war sie `script_review`: zurück auf `script` (es wartet nichts mehr auf Freigabe) |
| Zur Freigabe senden  | `draft`, `changes_requested` (nicht leer: Hook oder mindestens eine Szene mit Text) | `in_review` | vorwärts auf `script_review` |
| Freigeben            | `in_review`                        | `approved`           | vorwärts auf `shoot`                |
| Änderungen anfordern | `in_review` (Kommentar Pflicht)    | `changes_requested`  | zurück auf `script`                 |

`hook` ist laut Contract ein Pflichtfeld, darf aber leer (`""`) sein. Optionale Felder werden weggelassen statt
leer gespeichert; Texte werden getrimmt. Wird eine Szene gelöscht, verlieren Shots ihren Verweis (`sceneId`) darauf.

Es gibt pro Content genau **ein** aktuelles Skript (höchste `version`). „Neue Version“ erzeugt
einen neuen Datensatz (neue ID), die alte Version bleibt als Historie erhalten.

## Medien (MediaAsset)

Rohmaterial (`kind = raw`):

| Aktion                     | erlaubt aus      | neuer Status     | Content.stage            |
|----------------------------|------------------|------------------|--------------------------|
| Hochladen                  | –                | `uploaded`       | –                        |
| Zum Schnitt freigeben      | `uploaded`       | `ready_for_edit` | vorwärts auf `edit`      |
| Schnitt starten            | `ready_for_edit` | `in_edit`        | –                        |

Schnitt / Final (`kind = cut | final`):

| Aktion                     | erlaubt aus      | neuer Status         | Content.stage              |
|----------------------------|------------------|----------------------|----------------------------|
| Hochladen                  | –                | `in_review`, version = max(cut/final) + 1 | vorwärts auf `cut_review` |
| Freigeben                  | `in_review`      | `approved`           | vorwärts auf `scheduled`   |
| Änderungen anfordern       | `in_review` (Kommentar Pflicht) | `changes_requested` | zurück auf `edit` |

Freigeben und „Änderungen anfordern“ sind **nur für die neueste** Schnitt-/Final-Version eines Contents möglich
(`error.notLatestVersion`).

Kommentare können an jedem Asset hängen, optional mit Zeitstempel (`timestampSec`), und
lassen sich als erledigt markieren (`resolved`).

## Freigaben-Eingang

Enthält alle Skripte mit `status = in_review` und alle Medien (`cut`/`final`) mit
`status = in_review`, jeweils nur die neueste Version pro Content.

## Rollen & Rechte

Eine zentrale Matrix (Web: `web/src/domain/permissions.ts`) gilt für **Oberfläche und Aktionen**. Jede Aktion prüft
sie selbst und bricht mit `error.forbidden` ab – Ausblenden von Buttons ist nur Komfort.

| Recht | Agentur-Rollen (`lead`, `strategist`, `creator`, `videographer`, `editor`) | `client` |
|---|---|---|
| `content.manage` (anlegen, bearbeiten, Phase ändern, löschen) | ✅ | – |
| `script.edit` (anlegen, bearbeiten, neue Version, einreichen) | ✅ | – |
| `script.review` (freigeben / Änderungen anfordern) | ✅ | ✅ nur eigener Kunde |
| `shots.manage`, `shoot.manage` | ✅ | – |
| `media.upload`, `media.manage` (zum Schnitt freigeben, Schnitt starten, löschen) | ✅ | – |
| `media.review` (Schnitt freigeben / Änderungen anfordern) | ✅ | ✅ nur eigener Kunde |
| `media.comment` | ✅ | ✅ nur eigener Kunde, nie Rohmaterial |
| `media.viewRaw`, `notes.viewInternal` (`brandNotes`, Shot-Notizen) | ✅ | – |
| `admin.clients`, `admin.team`, `admin.workspace` (Import/Reset) | ✅ | – |

Sichtbarkeit für `client`: ausschließlich Daten des eigenen `clientId`; kein Rohmaterial, keine internen Notizen,
keine Aktivitäts-Einträge über Rohmaterial oder gelöschte Dateien (`media_uploaded_raw`, `media_released`,
`media_edit_started`, `media_deleted`). Verwaltungsseiten sind auch per direktem Link nicht erreichbar.

Neue Rolle hinzufügen: Enum im Contract + `ROLES`, dann Rechte in der Matrix vergeben (Web + iOS).

In der MVP-Version wird der „aktuelle Nutzer“ lokal umgeschaltet (Demo). Ohne Backend ist das **kein
Zugriffsschutz**; ein Server muss dieselbe Matrix serverseitig durchsetzen.

## Datenintegrität

Geladene/importierte Daten müssen den Contract erfüllen **und** in sich stimmig sein (alle IDs lösen auf,
`currentUserId` ist Teammitglied, Content ↔ Dreh verweisen gegenseitig aufeinander). Unstimmige Daten werden
abgelehnt; die App startet dann mit den Demo-Daten und zeigt einen Hinweis.

## Aktivitätslog

Jede Workflow-Aktion erzeugt einen `activity`-Eintrag (`actorId` = aktueller Nutzer) mit
`params.event` (z. B. `script_approved`) und den nötigen Werten (`title`, `version`, `stage`, `fileName`, `date`).
Angezeigt wird `activity.<event>` aus `apps/social-studio/i18n/common.<lang>.json` in der Sprache des Betrachters;
`message` ist nur Rückfall-Text (für Einträge ohne `params`).

## Fehlermeldungen

Regelverstöße werden als i18n-Schlüssel `error.*` (common) mit Parametern gemeldet, nie als fertiger Text.
