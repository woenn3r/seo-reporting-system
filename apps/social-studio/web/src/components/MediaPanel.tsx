import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Film, Scissors, Trash2, Upload } from "lucide-react";
import { addMedia, deleteMedia, mediaFor, releaseForEdit, startEdit } from "../domain/actions";
import { MEDIA_STATUS_TONE } from "../domain/labels";
import { t as tNow } from "../i18n";
import type { MediaAsset, MediaKind } from "../domain/types";
import { fmtBytes, fmtDateTime, fmtDuration } from "../i18n/format";
import { isClientUser, memberById } from "../domain/selectors";
import { newId } from "../domain/ids";
import { mediaStore, probeVideoDuration } from "../store/mediaStore";
import { run, toast } from "../store/store";
import { Avatar, Badge, Empty, useMe, useScoped, useT } from "./ui";

const ACCEPT = "video/*,image/*,.braw,.r3d,.mxf,.mkv,.mts,.m2ts,.crm,.ari";
const RAW_EXTENSIONS = /\.(braw|r3d|mxf|mkv|mts|m2ts|crm|ari|mov|mp4|avi)$/i;

/** Stores the binary first, then registers metadata. Rolls back the binary if the domain action fails. */
export async function uploadFile(contentId: string, kind: MediaKind, file: File): Promise<string | undefined> {
  // Camera raw / pro formats often arrive without a MIME type → accept them by extension for raw footage.
  const knownByType = file.type.startsWith("video/") || file.type.startsWith("image/");
  const knownByExtension = kind === "raw" && RAW_EXTENSIONS.test(file.name);
  if (!knownByType && !knownByExtension) {
    toast(tNow("media.notMedia", { name: file.name }), "error");
    return undefined;
  }
  const storageKey = newId("blob");
  try {
    await mediaStore.put(storageKey, file);
  } catch (e) {
    toast(tNow("media.uploadFailed", { detail: (e as Error).message }), "error");
    return undefined;
  }
  const durationSec = file.type.startsWith("video/") ? await probeVideoDuration(file) : undefined;
  const id = run(
    (w, c) => addMedia(w, c, { contentId, kind, fileName: file.name, mimeType: file.type || undefined, sizeBytes: file.size, durationSec, storageKey }),
    tNow("toast.uploaded", { name: file.name }),
  );
  if (!id) await mediaStore.remove(storageKey).catch(() => undefined);
  return id;
}

export async function removeMedia(asset: MediaAsset) {
  if (!confirm(tNow("media.confirmDelete", { name: asset.fileName }))) return;
  const key = run((w, c) => deleteMedia(w, c, asset.id), tNow("toast.fileDeleted"));
  if (typeof key === "string") await mediaStore.remove(key).catch(() => undefined);
}

export function MediaActions({ asset }: { asset: MediaAsset }) {
  const t = useT();
  const me = useMe();
  if (isClientUser(me)) return null;
  return (
    <>
      {asset.kind === "raw" && asset.status === "uploaded" && (
        <button className="btn sm primary" onClick={() => run((w, c) => releaseForEdit(w, c, asset.id), t("toast.released"))}>
          <Scissors size={14} /> {t("media.releaseForEdit")}
        </button>
      )}
      {asset.kind === "raw" && asset.status === "ready_for_edit" && (
        <button className="btn sm" onClick={() => run((w, c) => startEdit(w, c, asset.id), t("toast.editStarted"))}>
          {t("media.startEdit")}
        </button>
      )}
    </>
  );
}

export function MediaPanel({ contentId }: { contentId: string }) {
  const t = useT();
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
            <strong>{t("media.uploadAs")}</strong>
            {(["raw", "cut", "final", "thumbnail"] as const).map((k) => (
              <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {t(`mediaKind.${k}`)}
              </button>
            ))}
          </div>
          <div
            className={`dropzone ${over ? "over" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault(); // Space would scroll the page
              input.current?.click();
            }}
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
            <strong>{busy ? t("media.uploading") : t("media.dropHint")}</strong>
            <span className="small">
              {kind === "raw" && `${t("media.hintRaw")} · ${t("media.rawFormats")}`}
              {(kind === "cut" || kind === "final") && t("media.hintCut")}
              {kind === "thumbnail" && t("media.hintThumb")}
            </span>
            <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void handleFiles(e.target.files)} />
          </div>
          <span className="small muted">
            {t("media.localNote")}
          </span>
        </div>
      )}

      <div className="card">
        {items.length === 0 ? (
          <Empty icon={<Film size={22} />} title={t("media.none")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("media.colFile")}</th>
                  <th>{t("media.colKind")}</th>
                  <th>{t("media.colStatus")}</th>
                  <th>{t("media.colDuration")}</th>
                  <th>{t("media.colSize")}</th>
                  <th>{t("media.colUploaded")}</th>
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
                        {open > 0 && <span className="small muted">{t("media.openComments", { count: open })}</span>}
                      </td>
                      <td>
                        {t(`mediaKind.${m.kind}`)} {m.kind !== "thumbnail" && <span className="muted">v{m.version}</span>}
                      </td>
                      <td><Badge tone={MEDIA_STATUS_TONE[m.status]}>{t(`mediaStatus.${m.status}`)}</Badge></td>
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
                          <Link className="btn sm" to={`/media/${m.id}`}>{t("common.open")}</Link>
                          {!client && (
                            <button className="btn ghost sm icon danger" onClick={() => void removeMedia(m)} aria-label={t("common.delete")}>
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
