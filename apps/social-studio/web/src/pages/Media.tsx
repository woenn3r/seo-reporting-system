import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Scissors } from "lucide-react";
import { MEDIA_KIND_LABEL, MEDIA_STATUS_LABEL, MEDIA_STATUS_TONE } from "../domain/labels";
import type { MediaKind, MediaStatus } from "../domain/types";
import { fmtBytes, fmtDuration, fmtRelative } from "../domain/format";
import { editQueue, isClientUser } from "../domain/selectors";
import { MediaActions } from "../components/MediaPanel";
import { Badge, ClientTag, Empty, PageHeader, useMe, useScoped } from "../components/ui";

export function Media() {
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
        title={isClientUser(me) ? "Videos" : "Medien & Schnitt"}
        sub={isClientUser(me) ? "Alle Schnittversionen deiner Videos." : "Rohmaterial, Schnittversionen und finale Exports. Upload direkt im jeweiligen Content."}
      />

      {!isClientUser(me) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2 className="row"><Scissors size={16} /> Schnitt-Queue</h2><Badge tone="accent">{queue.length}</Badge></div>
          {queue.length === 0 ? (
            <Empty title="Kein Material wartet auf den Schnitt" />
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
                  <Badge tone={MEDIA_STATUS_TONE[m.status]}>{MEDIA_STATUS_LABEL[m.status]}</Badge>
                  <MediaActions asset={m} />
                  <button className="btn sm" onClick={() => navigate(`/media/${m.id}`)}>Öffnen</button>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 200 }} value={kind} onChange={(e) => setKind(e.target.value as MediaKind | "")} aria-label="Art filtern">
          <option value="">Alle Arten</option>
          {(Object.keys(MEDIA_KIND_LABEL) as MediaKind[]).filter((k) => !isClientUser(me) || k !== "raw").map((k) => <option key={k} value={k}>{MEDIA_KIND_LABEL[k]}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 240 }} value={status} onChange={(e) => setStatus(e.target.value as MediaStatus | "")} aria-label="Status filtern">
          <option value="">Alle Status</option>
          {(Object.keys(MEDIA_STATUS_LABEL) as MediaStatus[]).map((s) => <option key={s} value={s}>{MEDIA_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <Empty title="Keine Dateien" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Datei</th><th>Content</th><th>Art</th><th>Status</th><th>Länge</th><th>Kommentare</th><th>Hochgeladen</th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const c = contentOf(m.contentId);
                  return (
                    <tr key={m.id} className="clickable" onClick={() => navigate(`/media/${m.id}`)}>
                      <td style={{ fontWeight: 550 }}>{m.fileName}</td>
                      <td><div>{c?.title}</div><ClientTag client={ws.clients.find((x) => x.id === c?.clientId)} /></td>
                      <td>{MEDIA_KIND_LABEL[m.kind]} <span className="muted">v{m.version}</span></td>
                      <td><Badge tone={MEDIA_STATUS_TONE[m.status]}>{MEDIA_STATUS_LABEL[m.status]}</Badge></td>
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
