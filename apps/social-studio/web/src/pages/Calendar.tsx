import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtMonth, fmtTime, weekdayNames } from "../i18n/format";
import { todayISO } from "../domain/selectors";
import { PageHeader, useScoped, useT } from "../components/ui";


interface Ev { key: string; to: string; label: string; color: string; title: string; time?: string }

export function Calendar() {
  const t = useT();
  const ws = useScoped();
  const dow = useMemo(() => weekdayNames(), [t]); // t changes with the language
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
            label: `📣 ${c.title}`, time: fmtTime(d),
            title: `${c.title} – ${c.platforms.map((p) => t(`platform.${p}`)).join(", ")} (${t(`stage.${c.stage}`)})`,
          });
        }
    if (show.shoots)
      for (const s of ws.shoots)
        if (s.status !== "cancelled")
          add(s.date, { key: `s-${s.id}`, to: `/shoots/${s.id}`, color: color(s.clientId), label: `🎬 ${s.title}`, time: s.startTime, title: t("calendar.shootTitle", { title: s.title, location: s.location.name }) });
    if (show.due)
      for (const c of ws.contents)
        if (c.dueDate && c.stage !== "published")
          add(c.dueDate, { key: `d-${c.id}`, to: `/content/${c.id}`, color: color(c.clientId), label: `⏰ ${c.title}`, title: t("calendar.dueTitle", { title: c.title }) });
    for (const list of map.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return map;
  }, [ws, show, t]);

  const monthLabel = fmtMonth(cursor.y, cursor.m);
  const shift = (d: number) => setCursor(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));

  return (
    <>
      <PageHeader
        title={t("nav.calendar")}
        sub={t("calendar.sub")}
        actions={
          <div className="row">
            <button className="btn icon" onClick={() => shift(-1)} aria-label={t("calendar.prev")}><ChevronLeft size={16} /></button>
            <strong style={{ minWidth: 140, textAlign: "center" }}>{monthLabel}</strong>
            <button className="btn icon" onClick={() => shift(1)} aria-label={t("calendar.next")}><ChevronRight size={16} /></button>
            <button className="btn" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>{t("calendar.today")}</button>
          </div>
        }
      />
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="chip" aria-pressed={show.posts} onClick={() => setShow({ ...show, posts: !show.posts })}>📣 {t("calendar.posts")}</button>
        <button className="chip" aria-pressed={show.shoots} onClick={() => setShow({ ...show, shoots: !show.shoots })}>🎬 {t("calendar.shoots")}</button>
        <button className="chip" aria-pressed={show.due} onClick={() => setShow({ ...show, due: !show.due })}>⏰ {t("calendar.deadlines")}</button>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="cal">
          {dow.map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
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
                {evs.length > 4 && <span className="small muted">{t("calendar.more", { count: evs.length - 4 })}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
