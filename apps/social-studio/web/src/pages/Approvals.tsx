import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileText, Film } from "lucide-react";
import { approveScript } from "../domain/actions";
import { approvalInbox } from "../domain/selectors";
import { fmtDuration, fmtRelative } from "../domain/format";
import { run } from "../store/store";
import { Badge, ClientTag, Empty, PageHeader, useScoped, useT } from "../components/ui";

export function Approvals() {
  const t = useT();
  const ws = useScoped();
  const items = useMemo(() => approvalInbox(ws), [ws]);
  return (
    <>
      <PageHeader title={t("nav.approvals")} sub={t("approvals.sub")} />
      <div className="card">
        {items.length === 0 ? (
          <Empty icon={<CheckCircle2 size={24} />} title={t("approvals.none")} />
        ) : (
          items.map((a) => {
            const client = ws.clients.find((c) => c.id === a.content.clientId);
            const open = a.media?.comments.filter((c) => !c.resolved).length ?? 0;
            return (
              <div key={a.id} className="list-item wrap-mobile">
                <div className="row" style={{ flex: 1, minWidth: 0, flexWrap: "nowrap", gap: 12 }}>
                {a.kind === "script" ? <FileText size={20} style={{ flex: "none" }} /> : <Film size={20} style={{ flex: "none" }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong className="truncate">{a.content.title}</strong>
                    <Badge tone="warn">{t(a.kind === "script" ? "approval.scriptV" : "approval.cutV", { version: a.kind === "script" ? a.script!.version : a.media!.version })}</Badge>
                  </div>
                  <div className="row small muted" style={{ gap: 6 }}>
                    <ClientTag client={client} />
                    <span>· {t("approvals.submitted", { when: fmtRelative(a.since) })}</span>
                    {a.kind === "script" && <span>· {t("approvals.scenes", { count: a.script!.scenes.length })}</span>}
                    {a.kind === "media" && <span>· {fmtDuration(a.media!.durationSec)} · {t("media.openComments", { count: open })}</span>}
                  </div>
                </div>
                </div>
                {a.kind === "script" ? (
                  <>
                    <Link className="btn sm" to={`/content/${a.content.id}?tab=script`}>{t("approvals.review")}</Link>
                    <button className="btn sm success" onClick={() => run((w, c) => approveScript(w, c, a.id), t("toast.scriptApproved"))}>{t("review.approve")}</button>
                  </>
                ) : (
                  <Link className="btn sm primary" to={`/media/${a.id}`}>{t("approvals.watch")}</Link>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
