import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { currentScript } from "../domain/actions";
import { SCRIPT_STATUS_TONE } from "../domain/labels";
import type { ScriptStatus } from "../domain/types";
import { fmtRelative } from "../i18n/format";
import { Badge, ClientTag, Empty, PageHeader, useScoped, useT } from "../components/ui";

const SCRIPT_STATUSES: ScriptStatus[] = ["draft", "in_review", "changes_requested", "approved"];
import { StageBadge } from "../components/shared";

export function Scripts() {
  const t = useT();
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
      <PageHeader title={t("nav.scripts")} sub={t("scripts.sub")} />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="chip" aria-pressed={status === ""} onClick={() => setStatus("")}>{t("common.all")}</button>
        {SCRIPT_STATUSES.map((s) => (
          <button key={s} className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{t(`scriptStatus.${s}`)}</button>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        {rows.length === 0 ? (
          <Empty title={t("scripts.none")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t("scripts.colContent")}</th><th>{t("script.hook")}</th><th>{t("scripts.colScenes")}</th><th>{t("content.status")}</th><th>{t("scripts.colStage")}</th><th>{t("scripts.colChanged")}</th></tr>
              </thead>
              <tbody>
                {rows.map(({ c, s }) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/content/${c.id}?tab=script`)}>
                    <td>
                      <Link to={`/content/${c.id}?tab=script`} style={{ fontWeight: 550 }} onClick={(e) => e.stopPropagation()}>{c.title}</Link>
                      <div className="row small muted" style={{ gap: 6 }}><ClientTag client={ws.clients.find((x) => x.id === c.clientId)} /> · {t(`format.${c.format}`)}</div>
                    </td>
                    <td style={{ maxWidth: 320 }}><span className="truncate" style={{ display: "block" }}>{s!.hook || "–"}</span></td>
                    <td className="mono">{s!.scenes.length}</td>
                    <td><Badge tone={SCRIPT_STATUS_TONE[s!.status]}>{t(`scriptStatus.${s!.status}`)} · v{s!.version}</Badge></td>
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
          <div className="card-head"><h2>{t("scripts.withoutScript")}</h2></div>
          {withoutScript.map((c) => (
            <a key={c.id} className="list-item" href={`/content/${c.id}?tab=script`} onClick={(e) => { e.preventDefault(); navigate(`/content/${c.id}?tab=script`); }}>
              <ClientTag client={ws.clients.find((x) => x.id === c.clientId)} />
              <strong className="truncate" style={{ flex: 1, minWidth: 0 }}>{c.title}</strong>
              <StageBadge stage={c.stage} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
