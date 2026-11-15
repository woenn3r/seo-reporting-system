import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { currentScript } from "../domain/actions";
import { FORMAT_LABEL, SCRIPT_STATUS_LABEL, SCRIPT_STATUS_TONE } from "../domain/labels";
import type { ScriptStatus } from "../domain/types";
import { fmtRelative } from "../domain/format";
import { Badge, ClientTag, Empty, PageHeader, useScoped } from "../components/ui";
import { StageBadge } from "../components/shared";

export function Scripts() {
  const ws = useScoped();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ScriptStatus | "">("");
  const rows = useMemo(
    () =>
      ws.contents
        .map((c) => ({ c, s: currentScript(ws, c.id) }))
        .filter((r) => r.s && (!status || r.s.status === status))
        .sort((a, b) => b.s!.updatedAt.localeCompare(a.s!.updatedAt)),
    [ws, status],
  );
  const withoutScript = ws.contents.filter((c) => !currentScript(ws, c.id) && c.stage !== "published");

  return (
    <>
      <PageHeader title="Skripte" sub="Alle aktuellen Skript-Versionen – Hook, Szenen, Caption und Freigabestatus." />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="chip" aria-pressed={status === ""} onClick={() => setStatus("")}>Alle</button>
        {(Object.keys(SCRIPT_STATUS_LABEL) as ScriptStatus[]).map((s) => (
          <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{SCRIPT_STATUS_LABEL[s]}</button>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        {rows.length === 0 ? (
          <Empty title="Keine Skripte gefunden" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Content</th><th>Hook</th><th>Szenen</th><th>Status</th><th>Phase</th><th>Geändert</th></tr>
              </thead>
              <tbody>
                {rows.map(({ c, s }) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/content/${c.id}?tab=script`)}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{c.title}</div>
                      <div className="row small muted" style={{ gap: 6 }}><ClientTag client={ws.clients.find((x) => x.id === c.clientId)} /> · {FORMAT_LABEL[c.format]}</div>
                    </td>
                    <td style={{ maxWidth: 320 }}><span className="truncate" style={{ display: "block" }}>{s!.hook || "–"}</span></td>
                    <td className="mono">{s!.scenes.length}</td>
                    <td><Badge tone={SCRIPT_STATUS_TONE[s!.status]}>{SCRIPT_STATUS_LABEL[s!.status]} · v{s!.version}</Badge></td>
                    <td><StageBadge stage={c.stage} /></td>
                    <td className="small muted">{fmtRelative(s!.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {withoutScript.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Noch ohne Skript</h2></div>
          {withoutScript.map((c) => (
            <a key={c.id} className="list-item" href={`/content/${c.id}?tab=script`} onClick={(e) => { e.preventDefault(); navigate(`/content/${c.id}?tab=script`); }}>
              <ClientTag client={ws.clients.find((x) => x.id === c.clientId)} />
              <strong style={{ flex: 1 }}>{c.title}</strong>
              <StageBadge stage={c.stage} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
