import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, Download, RotateCcw, ThumbsUp, Undo2, VideoOff } from "lucide-react";
import { addComment, approveMedia, isReviewable, latestCut, requestMediaChanges, toggleCommentResolved } from "../domain/actions";
import { MEDIA_STATUS_TONE } from "../domain/labels";
import { fmtBytes, fmtDuration, fmtRelative } from "../i18n/format";
import { isClientUser, memberById } from "../domain/selectors";
import { mediaStore } from "../store/mediaStore";
import { run } from "../store/store";
import { MediaActions } from "../components/MediaPanel";
import { Avatar, Badge, ClientTag, Empty, Field, Modal, useMe, useScoped, useT } from "../components/ui";

type BlobState = { status: "loading" } | { status: "ready"; url: string; isImage: boolean } | { status: "missing" };

export function MediaReview() {
  const { id = "" } = useParams();
  const t = useT();
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
    () => (asset ? ws.media.filter((m) => m.contentId === asset.contentId && (isReviewable(asset) ? isReviewable(m) : m.kind === asset.kind)).sort((a, b) => b.version - a.version) : []),
    [ws, asset],
  );

  if (!asset || !content) {
    return (
      <Empty title={t("review.notFound")}>
        <Link className="btn" to="/media">{t("review.toMedia")}</Link>
      </Empty>
    );
  }

  const duration = asset.durationSec;
  const comments = [...asset.comments].sort((a, b) => (a.timestampSec ?? Infinity) - (b.timestampSec ?? Infinity) || a.createdAt.localeCompare(b.createdAt));
  const reviewable = isReviewable(asset) && asset.status === "in_review";
  const newest = latestCut(ws, asset.contentId)?.id === asset.id;

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
            <Badge tone={MEDIA_STATUS_TONE[asset.status]}>{t(`mediaStatus.${asset.status}`)}</Badge>
            <Badge>{t(`mediaKind.${asset.kind}`)} v{asset.version}</Badge>
            <span className="small muted">{fmtDuration(duration)} · {fmtBytes(asset.sizeBytes)} · {t("review.uploadedBy", { name: memberById(ws, asset.uploadedById)?.name ?? "?", when: fmtRelative(asset.uploadedAt) })}</span>
          </div>
        </div>
        <div className="page-actions">
          {versions.length > 1 && (
            <select className="select" style={{ width: "auto" }} value={asset.id} onChange={(e) => navigate(`/media/${e.target.value}`)} aria-label={t("review.switchVersion")}>
              {versions.map((v) => <option key={v.id} value={v.id}>{t("script.version", { version: v.version })} – {t(`mediaStatus.${v.status}`)}</option>)}
            </select>
          )}
          <MediaActions asset={asset} />
          {blob.status === "ready" && (
            <a className="btn" href={blob.url} download={asset.fileName}><Download size={15} /> {t("review.download")}</a>
          )}
          {reviewable && newest && (
            <>
              <button className="btn" onClick={() => setReject(true)}><Undo2 size={15} /> {t("review.requestChanges")}</button>
              <button className="btn success" onClick={() => run((w, c) => approveMedia(w, c, asset.id), t("toast.mediaApproved"))}>
                <ThumbsUp size={15} /> {t("review.approve")}
              </button>
            </>
          )}
        </div>
      </div>
      {reviewable && !newest && <div className="banner" style={{ margin: "0 0 16px" }}>{t("review.newerExists")}</div>}

      <div className="grid grid-main">
        <div>
          <div className="player">
            {blob.status === "ready" && !blob.isImage && (
              <video ref={videoRef} src={blob.url} controls playsInline onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
            )}
            {blob.status === "ready" && blob.isImage && <img src={blob.url} alt={asset.fileName} style={{ maxWidth: "100%", maxHeight: "70vh" }} />}
            {blob.status === "loading" && <div className="player-placeholder">{t("common.loading")}</div>}
            {blob.status === "missing" && (
              <div className="player-placeholder">
                <VideoOff size={28} />
                <strong>{t("review.noFile")}</strong>
                <span className="small">{t("review.noFileHint")}</span>
              </div>
            )}
          </div>
          {duration !== undefined && duration > 0 && (
            <div className="timeline" aria-label={t("review.timeline")}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, (time / duration) * 100)}%`, background: "var(--accent-soft)", borderRadius: 999 }} />
              {comments.filter((c) => c.timestampSec !== undefined).map((c) => (
                <button
                  key={c.id}
                  className={`marker ${c.resolved ? "resolved" : ""}`}
                  style={{ left: `${(c.timestampSec! / duration) * 100}%` }}
                  title={`${fmtDuration(c.timestampSec)} – ${c.text}`}
                  aria-label={t("review.jumpTo", { time: fmtDuration(c.timestampSec) })}
                  onClick={() => seek(c.timestampSec)}
                />
              ))}
            </div>
          )}
          <div className="small muted">{t("review.markerHint")}</div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <h2>{t("review.comments")}</h2>
            <Badge>{t("review.openCount", { count: comments.filter((c) => !c.resolved).length })}</Badge>
          </div>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 460 }}>
            {comments.length === 0 && <Empty title={t("review.noComments")} />}
            {comments.map((c) => {
              const author = memberById(ws, c.authorId);
              return (
                <div key={c.id} className={`comment ${c.resolved ? "resolved" : ""}`}>
                  <Avatar member={author} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row small" style={{ gap: 6 }}>
                      <strong>{author?.name ?? "?"}</strong>
                      {c.timestampSec !== undefined && (
                        <button className="ts" onClick={() => seek(c.timestampSec)} aria-label={t("review.jumpTo", { time: fmtDuration(c.timestampSec) })}>
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
                    aria-label={c.resolved ? t("review.reopen") : t("review.resolve")}
                    title={c.resolved ? t("review.reopen") : t("review.resolve")}
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
              placeholder={t("review.commentPlaceholder")}
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
                <Clock size={13} /> {t("review.atTime", { time: fmtDuration(time) })}
              </label>
              <button className="btn primary sm" disabled={!text.trim()} onClick={submitComment}>{t("common.send")}</button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={reject}
        onClose={() => setReject(false)}
        title={t("review.requestChanges")}
        footer={
          <>
            <button className="btn" onClick={() => setReject(false)}>{t("common.cancel")}</button>
            <button
              className="btn primary"
              disabled={!note.trim()}
              onClick={() => {
                if (run((w, c) => requestMediaChanges(w, c, asset.id, note), t("toast.feedbackToEdit"))) {
                  setReject(false);
                  setNote("");
                }
              }}
            >
              {t("common.send")}
            </button>
          </>
        }
      >
        <Field label={isClientUser(me) ? t("review.summaryClient") : t("review.summaryAgency")}>
          <textarea className="textarea" rows={5} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </>
  );
}
