import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { shotsFor } from "../domain/actions";
import { ANGLES, FRAMINGS } from "../domain/types";
import { ShotList } from "../components/ShotList";
import { ClientTag, Empty, PageHeader, useScoped, useT } from "../components/ui";
import { StageBadge } from "../components/shared";

/** Shotlisten & Perspektiven: alle Contents mit Shots + Perspektiven-Mix + Glossar für das Team. */
export function Shotlists() {
  const t = useT();
  const ws = useScoped();
  const [onlyOpen, setOnlyOpen] = useState(true);
  const contents = useMemo(
    () =>
      ws.contents
        .filter((c) => c.stage !== "published")
        .filter((c) => !onlyOpen || shotsFor(ws, c.id).some((s) => !s.done) || shotsFor(ws, c.id).length === 0)
        .filter((c) => ["idea", "script", "script_review", "shoot"].includes(c.stage) || shotsFor(ws, c.id).length > 0),
    [ws, onlyOpen],
  );
  const mix = useMemo(() => {
    const shots = ws.shots.filter((s) => contents.some((c) => c.id === s.contentId));
    return {
      framing: FRAMINGS.map((f) => ({ k: t(`framing.${f}`), n: shots.filter((s) => s.framing === f).length })).filter((x) => x.n),
      angle: ANGLES.map((a) => ({ k: t(`angle.${a}`), n: shots.filter((s) => s.angle === a).length })).filter((x) => x.n),
      total: shots.length,
    };
  }, [ws, contents, t]);

  return (
    <>
      <PageHeader
        title={t("nav.shotlists")}
        sub={t("shotlists.sub")}
        actions={
          <label className="row small">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> {t("shotlists.onlyOpen")}
          </label>
        }
      />
      {mix.total > 0 && (
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <MixCard title={t("shotlists.mixFraming")} rows={mix.framing} total={mix.total} />
          <MixCard title={t("shotlists.mixAngle")} rows={mix.angle} total={mix.total} />
        </div>
      )}
      {contents.length === 0 ? (
        <div className="card"><Empty title={t("shotlists.none")} /></div>
      ) : (
        <div className="stack" style={{ gap: 20 }}>
          {contents.map((c) => (
            <section key={c.id}>
              <div className="spread" style={{ marginBottom: 8 }}>
                <div className="row">
                  <ClientTag client={ws.clients.find((x) => x.id === c.clientId)} />
                  <Link to={`/content/${c.id}?tab=shots`}><h2>{c.title}</h2></Link>
                </div>
                <StageBadge stage={c.stage} />
              </div>
              <ShotList contentId={c.id} compact />
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function MixCard({ title, rows, total }: { title: string; rows: { k: string; n: number }[]; total: number }) {
  return (
    <div className="card card-pad">
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      <div className="stack" style={{ gap: 6 }}>
        {rows.map((r) => (
          <div key={r.k} style={{ display: "grid", gridTemplateColumns: "160px 1fr 32px", gap: 10, alignItems: "center" }} className="small">
            <span className="truncate">{r.k}</span>
            <div className="progress"><div style={{ width: `${(r.n / total) * 100}%`, background: "var(--accent)" }} /></div>
            <span className="mono muted" style={{ textAlign: "right" }}>{r.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
