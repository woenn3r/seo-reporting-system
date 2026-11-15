import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, Download, RotateCcw, ThumbsUp, Undo2, VideoOff } from "lucide-react";
import { addComment, approveMedia, requestMediaChanges, toggleCommentResolved } from "../domain/actions";
import { MEDIA_KIND_LABEL, MEDIA_STATUS_LABEL, MEDIA_STATUS_TONE } from "../domain/labels";
import { fmtBytes, fmtDuration, fmtRelative } from "../domain/format";
import { isClientUser, memberById } from "../domain/selectors";
import { mediaStore } from "../store/mediaStore";
import { run } from "../store/store";
import { MediaActions } from "../components/MediaPanel";
import { Avatar, Badge, ClientTag, Empty, Field, Modal, useMe, useScoped } from "../components/ui";

type BlobState = { status: "loading" } | { status: "ready"; url: string; isImage: boolean } | { status: "missing" };

export function MediaReview() {
  const { id = "" } = useParams();
  const ws = useScoped();
  const me = useMe();
  const navigate = useNavigate();
  const asset = ws.media.find((m) => m.id === id);
  const content = ws.contents.find((c) => c.id === asset?.contentId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [blob, setBlob] = useState<BlobState>({ status: "loading" });
  const [text, setText] = useState("");
  const [withTs, setWithTs] = useState(true);
  const [time, setTime] = useState(0);
  const [reject, setReject] = useState(false);
  const [note, setNote] = useState("");

  const storageKey = asset?.storageKey;
  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    setBlob({ status: "loading" });
    if (!storageKey) {
      setBlob({ status: "missing" });
      return;
    }
    mediaStore
      .get(storageKey)
      .then((b) => {
        if (cancelled) return;
        if (!b) return setBlob({ status: "missing" });
        url = URL.createObjectURL(b);
        setBlob({ status: "ready", url, isImage: b.type.startsWith("image/") });
      })
      .catch(() => !cancelled && setBlob({ status: "missing" }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [storageKey]);

  const versions = useMemo(
    () => (asset ? ws.media.filter((m) => m.contentId === asset.contentId && (asset.kind === "raw" ? m.kind === "raw" : m.kind === "cut" || m.kind === "final")).sort((a, b) => b.version - a.version) : []),
    [ws, asset],
  );

  if (!asset || !content) {
    return (
      <Empty title="Datei nicht gefunden">
        <Link className="btn" to="/media">Zu den Medien</Link>
      </Empty>
    );
  }

  const duration = asset.durationSec;
  const comments = [...asset.comments].sort((a, b) => (a.timestampSec ?? Infinity) - (b.timestampSec ?? Infinity) || a.createdAt.localeCompare(b.createdAt));
  const reviewable = (asset.kind === "cut" || asset.kind === "final") && asset.status === "in_review";
  const newest = versions[0]?.id === asset.id;

  const seek = (t?: number) => {
    if (t === undefined || !videoRef.current) return;
    videoRef.current.currentTime = t;
    void videoRef.current.play().catch(() => undefined);
  };

  const submitComment = () => {
    const ts = withTs && blob.status === "ready" && !blob.isImage ? videoRef.current?.currentTime : undefined;
    if (run((w, c) => addComment(w, c, asset.id, text, ts))) setText("");
  };

  return (
    <>
      <Link to={`/content/${content.id}?tab=media`} className="row small muted" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> {content.title}
      </Link>
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <ClientTag client={ws.clients.find((c) => c.id === content.clientId)} />
          <h1 style={{ marginTop: 4 }} className="truncate">{asset.fileName}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <Badge tone={MEDIA_STATUS_TONE[asset.status]}>{MEDIA_STATUS_LABEL[asset.status]}</Badge>
            <Badge>{MEDIA_KIND_LABEL[asset.kind]} v{asset.version}</Badge>
            <span className="small muted">{fmtDuration(duration)} · {fmtBytes(asset.sizeBytes)} · von {memberById(ws, asset.uploadedById)?.name ?? "?"} {fmtRelative(asset.uploadedAt)}</span>
          </div>
        </div>
        <div className="page-actions">
          {versions.length > 1 && (
            <select className="select" style={{ width: "auto" }} value={asset.id} onChange={(e) => navigate(`/media/${e.target.value}`)} aria-label="Version wechseln">
              {versions.map((v) => <option key={v.id} value={v.id}>Version {v.version} – {MEDIA_STATUS_LABEL[v.status]}</option>)}
            </select>
          )}
          <MediaActions asset={asset} />
          {blob.status === "ready" && (
            <a className="btn" href={blob.url} download={asset.fileName}><Download size={15} /> Download</a>
          )}
          {reviewable && newest && (
            <>
              <button className="btn" onClick={() => setReject(true)}><Undo2 size={15} /> Änderungen anfordern</button>
              <button className="btn success" onClick={() => run((w, c) => approveMedia(w, c, asset.id), "Freigegeben – bereit zur Veröffentlichung")}>
                <ThumbsUp size={15} /> Freigeben
              </button>
            </>
          )}
        </div>
      </div>
      {reviewable && !newest && <div className="banner" style={{ margin: "0 0 16px" }}>Es gibt eine neuere Version. Bitte die neueste Version prüfen.</div>}

      <div className="grid grid-main">
        <div>
          <div className="player">
            {blob.status === "ready" && !blob.isImage && (
              <video ref={videoRef} src={blob.url} controls playsInline onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
            )}
            {blob.status === "ready" && blob.isImage && <img src={blob.url} alt={asset.fileName} style={{ maxWidth: "100%", maxHeight: "70vh" }} />}
            {blob.status === "loading" && <div className="player-placeholder">Lade …</div>}
            {blob.status === "missing" && (
              <div className="player-placeholder">
                <VideoOff size={28} />
                <strong>Keine Datei in diesem Browser gespeichert</strong>
                <span className="small">Für diesen Eintrag liegen nur Metadaten vor (z. B. Demo-Daten oder Upload auf einem anderen Gerät).</span>
              </div>
            )}
          </div>
          {duration !== undefined && duration > 0 && (
            <div className="timeline" aria-label="Kommentare auf der Zeitachse">
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, (time / duration) * 100)}%`, background: "var(--accent-soft)", borderRadius: 999 }} />
              {comments.filter((c) => c.timestampSec !== undefined).map((c) => (
                <button
                  key={c.id}
                  className={`marker ${c.resolved ? "resolved" : ""}`}
                  style={{ left: `${(c.timestampSec! / duration) * 100}%` }}
                  title={`${fmtDuration(c.timestampSec)} – ${c.text}`}
                  aria-label={`Zu ${fmtDuration(c.timestampSec)} springen`}
                  onClick={() => seek(c.timestampSec)}
                />
              ))}
            </div>
          )}
          <div className="small muted">Marker: orange = offen, grün = erledigt. Klick springt zur Stelle.</div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <h2>Kommentare</h2>
            <Badge>{comments.filter((c) => !c.resolved).length} offen</Badge>
          </div>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 460 }}>
            {comments.length === 0 && <Empty title="Noch keine Kommentare" />}
            {comments.map((c) => {
              const author = memberById(ws, c.authorId);
              return (
                <div key={c.id} className={`comment ${c.resolved ? "resolved" : ""}`}>
                  <Avatar member={author} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row small" style={{ gap: 6 }}>
                      <strong>{author?.name ?? "?"}</strong>
                      {c.timestampSec !== undefined && (
                        <button className="ts" onClick={() => seek(c.timestampSec)} aria-label={`Zu ${fmtDuration(c.timestampSec)} springen`}>
                          {fmtDuration(c.timestampSec)}
                        </button>
                      )}
                      <span className="muted">{fmtRelative(c.createdAt)}</span>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>
                  </div>
                  <button
                    className="btn ghost sm icon"
                    onClick={() => run((w, ctx) => toggleCommentResolved(w, ctx, asset.id, c.id))}
                    aria-label={c.resolved ? "Wieder öffnen" : "Als erledigt markieren"}
                    title={c.resolved ? "Wieder öffnen" : "Erledigt"}
                  >
                    {c.resolved ? <RotateCcw size={14} /> : <Check size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="card-body" style={{ borderTop: "1px solid var(--border)" }}>
            <textarea
              className="textarea"
              rows={3}
              placeholder="Kommentar schreiben … (Strg/⌘ + Enter zum Senden)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment();
              }}
              onFocus={() => videoRef.current?.pause()}
            />
            <div className="spread" style={{ marginTop: 8 }}>
              <label className="row small">
                <input type="checkbox" checked={withTs} onChange={(e) => setWithTs(e.target.checked)} disabled={blob.status !== "ready" || blob.isImage} />
                <Clock size={13} /> bei {fmtDuration(time)}
              </label>
              <button className="btn primary sm" disabled={!text.trim()} onClick={submitComment}>Senden</button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={reject}
        onClose={() => setReject(false)}
        title="Änderungen anfordern"
        footer={
          <>
            <button className="btn" onClick={() => setReject(false)}>Abbrechen</button>
            <button
              className="btn primary"
              disabled={!note.trim()}
              onClick={() => {
                if (run((w, c) => requestMediaChanges(w, c, asset.id, note), "Rückmeldung an den Schnitt gesendet")) {
                  setReject(false);
                  setNote("");
                }
              }}
            >
              Senden
            </button>
          </>
        }
      >
        <Field label={`Zusammenfassung für den Schnitt${isClientUser(me) ? "" : " (offene Zeitstempel-Kommentare bleiben erhalten)"}`}>
          <textarea className="textarea" rows={5} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </>
  );
}
