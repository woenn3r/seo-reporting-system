import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clapperboard, MapPin } from "lucide-react";
import { SHOOT_STATUS_LABEL, SHOOT_STATUS_TONE } from "../domain/labels";
import type { Shoot } from "../domain/types";
import { fmtDate } from "../domain/format";
import { isClientUser, memberById, shootProgress, todayISO } from "../domain/selectors";
import { ShootModal } from "../components/ShootModal";
import { AvatarStack, Badge, ClientTag, Empty, PageHeader, Progress, useMe, useScoped } from "../components/ui";

export function Shoots() {
  const ws = useScoped();
  const me = useMe();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const today = todayISO();
  const { upcoming, past } = useMemo(() => {
    const sorted = [...ws.shoots].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    return {
      upcoming: sorted.filter((s) => s.date >= today && s.status !== "done"),
      past: sorted.filter((s) => s.date < today || s.status === "done").reverse(),
    };
  }, [ws, today]);

  return (
    <>
      <PageHeader
        title="Drehplan"
        sub="Drehtage mit Location, Crew, Equipment, Ablauf und Shotlisten – als Call Sheet druckbar."
        actions={!isClientUser(me) && <button className="btn primary" onClick={() => setCreating(true)}>+ Dreh planen</button>}
      />
      <h2 style={{ margin: "4px 0 10px" }}>Anstehend</h2>
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {upcoming.length === 0 && <div className="card"><Empty icon={<Clapperboard size={22} />} title="Keine anstehenden Drehs" /></div>}
        {upcoming.map((s) => <ShootCard key={s.id} s={s} />)}
      </div>
      <h2 style={{ margin: "4px 0 10px" }}>Vergangen</h2>
      <div className="grid grid-3">
        {past.length === 0 && <div className="small muted">–</div>}
        {past.map((s) => <ShootCard key={s.id} s={s} />)}
      </div>
      {creating && <ShootModal onClose={() => setCreating(false)} onSaved={(id) => navigate(`/shoots/${id}`)} />}
    </>
  );

  function ShootCard({ s }: { s: Shoot }) {
    const p = shootProgress(ws, s);
    return (
      <Link to={`/shoots/${s.id}`} className="card card-pad stack" style={{ gap: 10 }}>
        <div className="spread">
          <ClientTag client={ws.clients.find((c) => c.id === s.clientId)} />
          <Badge tone={SHOOT_STATUS_TONE[s.status]}>{SHOOT_STATUS_LABEL[s.status]}</Badge>
        </div>
        <div>
          <h3 style={{ fontSize: 15 }}>{s.title}</h3>
          <div className="small muted">{fmtDate(s.date)} · {s.startTime}–{s.endTime}</div>
        </div>
        <div className="row small muted" style={{ gap: 6 }}><MapPin size={14} /> {s.location.name}</div>
        <div className="spread small">
          <span className="muted">{s.contentIds.length} Contents</span>
          <AvatarStack members={s.teamIds.map((id) => memberById(ws, id))} />
        </div>
        <Progress value={p.done} total={p.total} label="Shots" />
      </Link>
    );
  }
}
