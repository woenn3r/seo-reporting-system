import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PLATFORM_LABEL, STAGE_LABEL } from "../domain/labels";
import { todayISO } from "../domain/selectors";
import { PageHeader, useScoped } from "../components/ui";

const DOW = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface Ev { key: string; to: string; label: string; color: string; title: string; time?: string }

export function Calendar() {
  const ws = useScoped();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [show, setShow] = useState({ posts: true, shoots: true, due: true });
  const today = todayISO();

  const days = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(cursor.y, cursor.m, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);

  const events = useMemo(() => {
    const map = new Map<string, Ev[]>();
    const add = (d: string, e: Ev) => map.set(d, [...(map.get(d) ?? []), e]);
    const color = (clientId: string) => ws.clients.find((c) => c.id === clientId)?.color ?? "#888";
    if (show.posts)
      for (const c of ws.contents)
        if (c.publishAt) {
          const d = new Date(c.publishAt);
          add(todayISO(d), {
            key: `p-${c.id}`, to: `/content/${c.id}`, color: color(c.clientId),
            label: `📣 ${c.title}`, time: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
            title: `${c.title} – ${c.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")} (${STAGE_LABEL[c.stage]})`,
          });
        }
    if (show.shoots)
      for (const s of ws.shoots)
        if (s.status !== "cancelled")
          add(s.date, { key: `s-${s.id}`, to: `/shoots/${s.id}`, color: color(s.clientId), label: `🎬 ${s.title}`, time: s.startTime, title: `Dreh: ${s.title} (${s.location.name})` });
    if (show.due)
      for (const c of ws.contents)
        if (c.dueDate && c.stage !== "published")
          add(c.dueDate, { key: `d-${c.id}`, to: `/content/${c.id}`, color: color(c.clientId), label: `⏰ ${c.title}`, title: `Fällig: ${c.title}` });
    for (const list of map.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return map;
  }, [ws, show]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const shift = (d: number) => setCursor(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));

  return (
    <>
      <PageHeader
        title="Redaktionskalender"
        sub="Veröffentlichungen, Drehtage und Deadlines auf einen Blick."
        actions={
          <div className="row">
            <button className="btn icon" onClick={() => shift(-1)} aria-label="Vorheriger Monat"><ChevronLeft size={16} /></button>
            <strong style={{ minWidth: 140, textAlign: "center" }}>{monthLabel}</strong>
            <button className="btn icon" onClick={() => shift(1)} aria-label="Nächster Monat"><ChevronRight size={16} /></button>
            <button className="btn" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>Heute</button>
          </div>
        }
      />
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="chip" aria-pressed={show.posts} onClick={() => setShow({ ...show, posts: !show.posts })}>📣 Posts</button>
        <button className="chip" aria-pressed={show.shoots} onClick={() => setShow({ ...show, shoots: !show.shoots })}>🎬 Drehs</button>
        <button className="chip" aria-pressed={show.due} onClick={() => setShow({ ...show, due: !show.due })}>⏰ Deadlines</button>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="cal">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {days.map((d) => {
            const iso = todayISO(d);
            const evs = events.get(iso) ?? [];
            return (
              <div key={iso} className={`cal-day ${d.getMonth() !== cursor.m ? "other" : ""} ${iso === today ? "today" : ""}`}>
                <span className="cal-num">{d.getDate()}</span>
                {evs.slice(0, 4).map((e) => (
                  <Link key={e.key} to={e.to} className="cal-ev" style={{ borderLeftColor: e.color }} title={e.title}>
                    {e.time && <span className="mono muted">{e.time} </span>}{e.label}
                  </Link>
                ))}
                {evs.length > 4 && <span className="small muted">+{evs.length - 4} weitere</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
