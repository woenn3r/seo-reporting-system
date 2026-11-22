import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clapperboard, Film, Layers } from "lucide-react";
import { STAGES } from "../domain/types";
import { approvalInbox, editQueue, isClientUser, shootProgress, todayISO, upcomingShoots } from "../domain/selectors";
import { fmtDate, fmtRelative } from "../i18n/format";
import { ActivityFeed, ContentRow, NewContentButton } from "../components/shared";
import { Badge, ClientTag, Empty, PageHeader, Progress, useMe, useScoped, useT } from "../components/ui";

export function Dashboard() {
  const ws = useScoped();
  const me = useMe();
  const t = useT();
  const today = todayISO();
  const in7 = todayISO(new Date(Date.now() + 7 * 86400000));
  const in14 = todayISO(new Date(Date.now() + 14 * 86400000));

  const data = useMemo(() => {
    const active = ws.contents.filter((c) => c.stage !== "published");
    return {
      active,
      approvals: approvalInbox(ws),
      shoots: upcomingShoots(ws, today),
      edits: editQueue(ws),
      due: active.filter((c) => c.dueDate && c.dueDate <= in7).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
      byStage: STAGES.map((s) => ({ s, n: ws.contents.filter((c) => c.stage === s).length })),
    };
  }, [ws, today, in7]);

  const hour = new Date().getHours();
  const greet = t(hour < 11 ? "dash.greetMorning" : hour < 18 ? "dash.greetDay" : "dash.greetEvening", { name: me.name.split(" ")[0] ?? me.name });
  const total = Math.max(1, ws.contents.length);

  return (
    <>
      <PageHeader
        title={greet}
        sub={isClientUser(me) ? t("dash.subClient") : t("dash.subAgency")}
        actions={<NewContentButton />}
      />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat icon={<Layers size={16} />} label={t("dash.activeContents")} value={data.active.length} to="/pipeline" />
        <Stat icon={<CheckCircle2 size={16} />} label={t("dash.openApprovals")} value={data.approvals.length} to="/approvals" tone={data.approvals.length ? "warn" : undefined} />
        <Stat icon={<Clapperboard size={16} />} label={t("dash.shoots14")} value={data.shoots.filter((s) => s.date <= in14).length} to="/shoots" />
        {isClientUser(me) ? (
          <Stat icon={<Film size={16} />} label={t("stage.published")} value={ws.contents.filter((c) => c.stage === "published").length} to="/calendar" />
        ) : (
          <Stat icon={<Film size={16} />} label={t("dash.inEdit")} value={data.edits.length} to="/media" />
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="spread" style={{ marginBottom: 10 }}>
          <h2>{t("dash.pipeline")}</h2>
          <Link to="/pipeline" className="small muted">{t("dash.toBoard")} →</Link>
        </div>
        <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--surface-2)" }} aria-hidden>
          {data.byStage.map(({ s, n }, i) =>
            n ? <div key={s} title={`${t(`stage.${s}`)}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: `hsl(${245 - i * 22} 65% ${55 + (i % 2) * 6}%)` }} /> : null,
          )}
        </div>
        <div className="row" style={{ marginTop: 12, gap: 14 }}>
          {data.byStage.map(({ s, n }, i) => (
            <Link key={s} to={`/pipeline?stage=${s}`} className="row small" style={{ gap: 6 }}>
              <span className="dot" style={{ background: `hsl(${245 - i * 22} 65% ${55 + (i % 2) * 6}%)` }} />
              <span className="muted">{t(`stage.${s}`)}</span>
              <strong className="mono">{n}</strong>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <h2>{t("dash.waitingApproval")}</h2>
              <Link to="/approvals" className="small muted">{t("common.all")} →</Link>
            </div>
            {data.approvals.length === 0 ? (
              <Empty title={t("dash.allApproved")} />
            ) : (
              data.approvals.slice(0, 5).map((a) => (
                <Link key={a.id} to={a.kind === "script" ? `/content/${a.content.id}?tab=script` : `/media/${a.id}`} className="list-item">
                  <Badge tone="warn">{t(a.kind === "script" ? "approval.scriptV" : "approval.cutV", { version: a.kind === "script" ? a.script!.version : a.media!.version })}</Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 550 }}>{a.content.title}</div>
                    <ClientTag client={ws.clients.find((c) => c.id === a.content.clientId)} />
                  </div>
                  <span className="small muted">{fmtRelative(a.since)}</span>
                </Link>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t("dash.dueNext7")}</h2>
            </div>
            {data.due.length === 0 ? <Empty title={t("dash.nothingDue")} /> : data.due.map((c) => <ContentRow key={c.id} ws={ws} c={c} />)}
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <h2>{t("dash.nextShoots")}</h2>
              <Link to="/shoots" className="small muted">{t("nav.shoots")} →</Link>
            </div>
            {data.shoots.length === 0 ? (
              <Empty title={t("dash.noShoots")} />
            ) : (
              data.shoots.slice(0, 4).map((s) => {
                const p = shootProgress(ws, s);
                return (
                  <Link key={s.id} to={`/shoots/${s.id}`} className="list-item" style={{ display: "block" }}>
                    <div className="spread">
                      <strong className="truncate">{s.title}</strong>
                      <span className="small muted mono">{s.startTime}</span>
                    </div>
                    <div className="small muted" style={{ margin: "2px 0 8px" }}>
                      {fmtDate(s.date)} · {s.location.name}
                    </div>
                    <Progress value={p.done} total={p.total} label={t("shots.progress")} />
                  </Link>
                );
              })
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t("dash.recentActivity")}</h2>
            </div>
            <ActivityFeed ws={ws} items={ws.activity} limit={6} />
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ icon, label, value, to, tone }: { icon: ReactNode; label: string; value: number; to: string; tone?: "warn" }) {
  return (
    <Link to={to} className="card stat">
      <div className="row label" style={{ gap: 6 }}>
        {icon} {label}
      </div>
      <div className="value mono" style={tone ? { color: "var(--warn)" } : undefined}>{value}</div>
    </Link>
  );
}
