import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Film, Scissors, Trash2, Upload } from "lucide-react";
import { addMedia, deleteMedia, mediaFor, releaseForEdit, startEdit } from "../domain/actions";
import { MEDIA_KIND_LABEL, MEDIA_STATUS_LABEL, MEDIA_STATUS_TONE } from "../domain/labels";
import type { MediaAsset, MediaKind } from "../domain/types";
import { fmtBytes, fmtDateTime, fmtDuration } from "../domain/format";
import { isClientUser, memberById } from "../domain/selectors";
import { newId } from "../domain/ids";
import { mediaStore, probeVideoDuration } from "../store/mediaStore";
import { run, toast } from "../store/store";
import { Avatar, Badge, Empty, useMe, useScoped } from "./ui";

const ACCEPT = "video/*,image/*";

/** Stores the binary first, then registers metadata. Rolls back the binary if the domain action fails. */
export async function uploadFile(contentId: string, kind: MediaKind, file: File): Promise<string | undefined> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
    toast(`„${file.name}“ ist kein Video oder Bild.`, "error");
    return undefined;
  }
  const storageKey = newId("blob");
  try {
    await mediaStore.put(storageKey, file);
  } catch (e) {
    toast(`Upload fehlgeschlagen: ${(e as Error).message}`, "error");
    return undefined;
  }
  const durationSec = file.type.startsWith("video/") ? await probeVideoDuration(file) : undefined;
  const id = run(
    (w, c) => addMedia(w, c, { contentId, kind, fileName: file.name, mimeType: file.type || undefined, sizeBytes: file.size, durationSec, storageKey }),
    `„${file.name}“ hochgeladen`,
  );
  if (!id) await mediaStore.remove(storageKey).catch(() => undefined);
  return id;
}

export async function removeMedia(asset: MediaAsset) {
  if (!confirm(`„${asset.fileName}“ wirklich löschen?`)) return;
  const key = run((w, c) => deleteMedia(w, c, asset.id), "Datei gelöscht");
  if (typeof key === "string") await mediaStore.remove(key).catch(() => undefined);
}

export function MediaActions({ asset }: { asset: MediaAsset }) {
  const me = useMe();
  if (isClientUser(me)) return null;
  return (
    <>
      {asset.kind === "raw" && asset.status === "uploaded" && (
        <button className="btn sm primary" onClick={() => run((w, c) => releaseForEdit(w, c, asset.id), "Zum Schnitt freigegeben")}>
          <Scissors size={14} /> Zum Schnitt freigeben
        </button>
      )}
      {asset.kind === "raw" && asset.status === "ready_for_edit" && (
        <button className="btn sm" onClick={() => run((w, c) => startEdit(w, c, asset.id), "Schnitt gestartet")}>
          Schnitt starten
        </button>
      )}
    </>
  );
}

export function MediaPanel({ contentId }: { contentId: string }) {
  const ws = useScoped();
  const me = useMe();
  const client = isClientUser(me);
  const items = useMemo(() => mediaFor(ws, contentId), [ws, contentId]);
  const [kind, setKind] = useState<MediaKind>("raw");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        // reviewable uploads: each file is a new version
        await uploadFile(contentId, kind, f);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {!client && (
        <div className="card card-pad stack">
          <div className="row">
            <strong>Hochladen als</strong>
            {(["raw", "cut", "final", "thumbnail"] as const).map((k) => (
              <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {MEDIA_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
          >
            <Upload size={22} />
            <strong>{busy ? "Lade hoch …" : "Dateien hierher ziehen oder klicken"}</strong>
            <span className="small">
              {kind === "raw" && "Rohmaterial → danach „Zum Schnitt freigeben“"}
              {(kind === "cut" || kind === "final") && "Wird als neue Version direkt zur Freigabe gestellt"}
              {kind === "thumbnail" && "Vorschaubild für den Post"}
            </span>
            <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void handleFiles(e.target.files)} />
          </div>
          <span className="small muted">
            Hinweis: In dieser Version werden Dateien nur lokal in diesem Browser gespeichert (IndexedDB). Für Team-Zugriff ist ein Speicher-Backend nötig.
          </span>
        </div>
      )}

      <div className="card">
        {items.length === 0 ? (
          <Empty icon={<Film size={22} />} title="Noch keine Dateien" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Datei</th>
                  <th>Art</th>
                  <th>Status</th>
                  <th>Länge</th>
                  <th>Größe</th>
                  <th>Hochgeladen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const open = m.comments.filter((c) => !c.resolved).length;
                  return (
                    <tr key={m.id}>
                      <td>
                        <Link to={`/media/${m.id}`} style={{ fontWeight: 550 }} className="row">
                          <Film size={15} /> {m.fileName}
                        </Link>
                        {open > 0 && <span className="small muted">{open} offene Kommentare</span>}
                      </td>
                      <td>
                        {MEDIA_KIND_LABEL[m.kind]} {m.kind !== "thumbnail" && <span className="muted">v{m.version}</span>}
                      </td>
                      <td><Badge tone={MEDIA_STATUS_TONE[m.status]}>{MEDIA_STATUS_LABEL[m.status]}</Badge></td>
                      <td className="mono">{fmtDuration(m.durationSec)}</td>
                      <td className="mono">{fmtBytes(m.sizeBytes)}</td>
                      <td>
                        <span className="row small" style={{ flexWrap: "nowrap" }}>
                          <Avatar member={memberById(ws, m.uploadedById)} /> {fmtDateTime(m.uploadedAt)}
                        </span>
                      </td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <MediaActions asset={m} />
                          <Link className="btn sm" to={`/media/${m.id}`}>Öffnen</Link>
                          {!client && (
                            <button className="btn ghost sm icon danger" onClick={() => void removeMedia(m)} aria-label="Löschen">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
