import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Scissors } from "lucide-react";
import { MEDIA_STATUS_TONE } from "../domain/labels";
import type { MediaKind, MediaStatus } from "../domain/types";
import { fmtBytes, fmtDuration, fmtRelative } from "../i18n/format";
import { editQueue, isClientUser } from "../domain/selectors";
import { MediaActions } from "../components/MediaPanel";
import { Badge, ClientTag, Empty, PageHeader, useMe, useScoped, useT } from "../components/ui";

const KINDS: MediaKind[] = ["raw", "cut", "final", "thumbnail"];
const STATUSES: MediaStatus[] = ["uploaded", "ready_for_edit", "in_edit", "in_review", "changes_requested", "approved"];

export function Media() {
  const t = useT();
  const ws = useScoped();
  const me = useMe();
  const navigate = useNavigate();
  const [kind, setKind] = useState<MediaKind | "">("");
  const [status, setStatus] = useState<MediaStatus | "">("");
  const queue = useMemo(() => editQueue(ws), [ws]);
  const rows = useMemo(
    () =>
      ws.media
        .filter((m) => (!kind || m.kind === kind) && (!status || m.status === status))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [ws, kind, status],
  );
  const contentOf = (id: string) => ws.contents.find((c) => c.id === id);

  return (
    <>
      <PageHeader
        title={isClientUser(me) ? t("nav.videos") : t("nav.media")}
        sub={isClientUser(me) ? t("media.subClient") : t("media.subAgency")}
      />

      {!isClientUser(me) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2 className="row"><Scissors size={16} /> {t("media.editQueue")}</h2><Badge tone="accent">{queue.length}</Badge></div>
          {queue.length === 0 ? (
            <Empty title={t("media.queueEmpty")} />
          ) : (
            queue.map((m) => {
              const c = contentOf(m.contentId);
              return (
                <div key={m.id} className="list-item wrap-mobile">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong className="truncate" style={{ display: "block" }}>{c?.title}</strong>
                    <div className="row small muted" style={{ gap: 6 }}>
                      <ClientTag client={ws.clients.find((x) => x.id === c?.clientId)} /> · {m.fileName} · {fmtDuration(m.durationSec)} · {fmtBytes(m.sizeBytes)}
                    </div>
                  </div>
                  <Badge tone={MEDIA_STATUS_TONE[m.status]}>{t(`mediaStatus.${m.status}`)}</Badge>
                  <MediaActions asset={m} />
                  <button className="btn sm" onClick={() => navigate(`/media/${m.id}`)}>{t("common.open")}</button>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 200 }} value={kind} onChange={(e) => setKind(e.target.value as MediaKind | "")} aria-label={t("media.filterKind")}>
          <option value="">{t("media.allKinds")}</option>
          {KINDS.filter((k) => !isClientUser(me) || k !== "raw").map((k) => <option key={k} value={k}>{t(`mediaKind.${k}`)}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 240 }} value={status} onChange={(e) => setStatus(e.target.value as MediaStatus | "")} aria-label={t("media.filterStatus")}>
          <option value="">{t("media.allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`mediaStatus.${s}`)}</option>)}
        </select>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <Empty title={t("media.none")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("media.colFile")}</th><th>{t("scripts.colContent")}</th><th>{t("media.colKind")}</th><th>{t("media.colStatus")}</th><th>{t("media.colDuration")}</th><th>{t("media.colComments")}</th><th>{t("media.colUploaded")}</th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const c = contentOf(m.contentId);
                  return (
                    <tr key={m.id} className="clickable" onClick={() => navigate(`/media/${m.id}`)}>
                      <td><Link to={`/media/${m.id}`} style={{ fontWeight: 550 }} onClick={(e) => e.stopPropagation()}>{m.fileName}</Link></td>
                      <td><div>{c?.title}</div><ClientTag client={ws.clients.find((x) => x.id === c?.clientId)} /></td>
                      <td>{t(`mediaKind.${m.kind}`)} <span className="muted">v{m.version}</span></td>
                      <td><Badge tone={MEDIA_STATUS_TONE[m.status]}>{t(`mediaStatus.${m.status}`)}</Badge></td>
                      <td className="mono">{fmtDuration(m.durationSec)}</td>
                      <td className="mono">{m.comments.filter((x) => !x.resolved).length} / {m.comments.length}</td>
                      <td className="small muted">{fmtRelative(m.uploadedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
