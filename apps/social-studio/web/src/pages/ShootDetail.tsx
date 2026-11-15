import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, MapPin, Pencil, Printer, Trash2 } from "lucide-react";
import { deleteShoot } from "../domain/actions";
import { ROLE_LABEL, SHOOT_STATUS_LABEL, SHOOT_STATUS_TONE } from "../domain/labels";
import { fmtDate } from "../domain/format";
import { isClientUser, memberById, shootProgress } from "../domain/selectors";
import { run } from "../store/store";
import { ShootModal } from "../components/ShootModal";
import { ShotList } from "../components/ShotList";
import { StageBadge } from "../components/shared";
import { Avatar, Badge, ClientTag, Empty, Progress, useMe, useScoped } from "../components/ui";

export function ShootDetail() {
  const { id = "" } = useParams();
  const ws = useScoped();
  const me = useMe();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const shoot = ws.shoots.find((s) => s.id === id);
  if (!shoot) return <Empty title="Dreh nicht gefunden"><Link className="btn" to="/shoots">Zum Drehplan</Link></Empty>;
  const readOnly = isClientUser(me);
  const p = shootProgress(ws, shoot);
  const contents = shoot.contentIds.map((cid) => ws.contents.find((c) => c.id === cid)).filter((c) => !!c);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shoot.location.address ?? shoot.location.name)}`;

  return (
    <>
      <Link to="/shoots" className="row small muted no-print" style={{ marginBottom: 10 }}><ArrowLeft size={14} /> Drehplan</Link>
      <div className="page-header">
        <div>
          <ClientTag client={ws.clients.find((c) => c.id === shoot.clientId)} />
          <h1 style={{ marginTop: 4 }}>Call Sheet: {shoot.title}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <Badge tone={SHOOT_STATUS_TONE[shoot.status]}>{SHOOT_STATUS_LABEL[shoot.status]}</Badge>
            <span className="row small muted" style={{ gap: 4 }}><Clock size={14} /> {fmtDate(shoot.date)} · {shoot.startTime}–{shoot.endTime}</span>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => window.print()}><Printer size={15} /> Drucken / PDF</button>
          {!readOnly && <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Bearbeiten</button>}
          {!readOnly && (
            <button
              className="btn ghost icon danger"
              aria-label="Dreh löschen"
              onClick={() => confirm(`Dreh „${shoot.title}“ löschen? Contents bleiben erhalten.`) && run((w, c) => deleteShoot(w, c, shoot.id), "Dreh gelöscht") && navigate("/shoots")}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card card-pad stack" style={{ gap: 6 }}>
          <h3 className="row"><MapPin size={15} /> Location</h3>
          <strong>{shoot.location.name}</strong>
          {shoot.location.address && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)" }}>{shoot.location.address}</a>}
          {shoot.location.notes && <span className="small muted">{shoot.location.notes}</span>}
        </div>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Crew</h3>
          {shoot.teamIds.length === 0 && <span className="small muted">Noch niemand eingeteilt.</span>}
          {shoot.teamIds.map((tid) => {
            const m = memberById(ws, tid);
            return (
              <div key={tid} className="row" style={{ flexWrap: "nowrap" }}>
                <Avatar member={m} />
                <div><div>{m?.name ?? "?"}</div><div className="small muted">{m ? ROLE_LABEL[m.role] : ""}</div></div>
              </div>
            );
          })}
        </div>
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <h3>Fortschritt am Set</h3>
          <Progress value={p.done} total={p.total} label="Shots abgedreht" />
          {shoot.notes && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{shoot.notes}</p>}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head"><h2>Ablauf</h2></div>
          {shoot.schedule.length === 0 ? <Empty title="Kein Ablauf hinterlegt" /> : shoot.schedule.map((e, i) => (
            <div key={i} className="list-item"><span className="mono" style={{ fontWeight: 600, width: 52 }}>{e.time}</span><span>{e.label}</span></div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h2>Equipment-Checkliste</h2><span className="small muted">{Object.values(checked).filter(Boolean).length}/{shoot.equipment.length}</span></div>
          {shoot.equipment.length === 0 ? <Empty title="Keine Equipment-Liste" /> : shoot.equipment.map((e, i) => (
            <label key={i} className="list-item" style={{ cursor: "pointer" }}>
              <input type="checkbox" className="check" checked={!!checked[i]} onChange={(ev) => setChecked({ ...checked, [i]: ev.target.checked })} />
              <span style={checked[i] ? { textDecoration: "line-through", color: "var(--text-3)" } : undefined}>{e}</span>
            </label>
          ))}
          <div className="card-body small muted no-print">Die Equipment-Häkchen sind nur eine lokale Packhilfe und werden nicht gespeichert.</div>
        </div>
      </div>

      <h2 style={{ marginBottom: 10 }}>Shotlisten</h2>
      {contents.length === 0 && <div className="card"><Empty title="Diesem Dreh sind keine Contents zugeordnet" /></div>}
      <div className="stack" style={{ gap: 20 }}>
        {contents.map((c) => (
          <section key={c.id}>
            <div className="spread" style={{ marginBottom: 8 }}>
              <Link to={`/content/${c.id}?tab=shots`}><h3 style={{ fontSize: 15 }}>{c.title}</h3></Link>
              <StageBadge stage={c.stage} />
            </div>
            <ShotList contentId={c.id} />
          </section>
        ))}
      </div>
      {editing && <ShootModal shoot={shoot} onClose={() => setEditing(false)} />}
    </>
  );
}
