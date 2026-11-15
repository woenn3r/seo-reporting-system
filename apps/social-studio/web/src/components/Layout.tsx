import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays, CheckCircle2, Clapperboard, Columns3, FileText, Film, LayoutDashboard, Menu, Settings, Users, Building2, Camera,
} from "lucide-react";
import { ROLE_LABEL } from "../domain/labels";
import { approvalInbox, currentUser, editQueue, isClientUser } from "../domain/selectors";
import { clearLoadWarning, dismissToast, run, setClientFilter, useStore } from "../store/store";
import { setCurrentUser } from "../domain/actions";
import { Avatar, useScoped } from "./ui";

export function Layout() {
  const ws = useStore((s) => s.ws);
  const filter = useStore((s) => s.ui.clientFilter);
  const toasts = useStore((s) => s.toasts);
  const loadWarning = useStore((s) => s.loadWarning);
  const scoped = useScoped();
  const me = currentUser(ws);
  const client = isClientUser(me);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const approvals = useMemo(() => approvalInbox(scoped).length, [scoped]);
  const edits = useMemo(() => editQueue(scoped).length, [scoped]);

  const nav = (to: string, icon: ReactNode, label: string, count?: number) => (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
      {icon}
      <span>{label}</span>
      {count ? <span className="count" aria-label={`${count} offen`}>{count}</span> : null}
    </NavLink>
  );

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Hauptnavigation">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">Social Studio</div>
            <div className="brand-sub">{ws.workspace.name}</div>
          </div>
        </div>

        <label className="field" style={{ padding: "0 4px" }}>
          <span className="nav-label" style={{ padding: "0 6px" }}>Kunde</span>
          {client ? (
            <div className="input row" style={{ display: "flex" }}>
              <span className="dot" style={{ background: scoped.clients[0]?.color }} />
              <span className="truncate">{scoped.clients[0]?.name ?? "–"}</span>
            </div>
          ) : (
            <select className="select" value={filter ?? ""} onChange={(e) => setClientFilter(e.target.value || null)} aria-label="Kunde filtern">
              <option value="">Alle Kunden</option>
              {ws.clients.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </label>

        <nav>
          <div className="nav-group">
            {nav("/", <LayoutDashboard size={17} />, "Übersicht")}
          </div>
          <div className="nav-group">
            <div className="nav-label">Produktion</div>
            {nav("/pipeline", <Columns3 size={17} />, "Content-Pipeline")}
            {nav("/scripts", <FileText size={17} />, "Skripte")}
            {!client && nav("/shotlists", <Camera size={17} />, "Shotlisten & Perspektiven")}
            {nav("/shoots", <Clapperboard size={17} />, "Drehplan")}
          </div>
          <div className="nav-group">
            <div className="nav-label">Review</div>
            {nav("/media", <Film size={17} />, client ? "Videos" : "Medien & Schnitt", client ? undefined : edits)}
            {nav("/approvals", <CheckCircle2 size={17} />, "Freigaben", approvals)}
          </div>
          <div className="nav-group">
            <div className="nav-label">Planung</div>
            {nav("/calendar", <CalendarDays size={17} />, "Redaktionskalender")}
          </div>
          {!client && (
            <div className="nav-group">
              <div className="nav-label">Verwaltung</div>
              {nav("/clients", <Building2 size={17} />, "Kunden")}
              {nav("/team", <Users size={17} />, "Team")}
              {nav("/settings", <Settings size={17} />, "Einstellungen")}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <label className="field">
            <span className="nav-label" style={{ padding: "0 6px" }}>Angemeldet als (Demo)</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Avatar member={me} />
              <select
                className="select"
                value={me.id}
                onChange={(e) => run((w) => setCurrentUser(w, e.target.value))}
                aria-label="Nutzer wechseln"
              >
                {ws.team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} – {ROLE_LABEL[m.role]}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="btn ghost icon" onClick={() => setOpen(true)} aria-label="Menü öffnen">
            <Menu size={20} />
          </button>
          <strong>Social Studio</strong>
        </div>
        {loadWarning && (
          <div className="banner" role="status">
            <span>{loadWarning}</span>
            <button className="btn sm" onClick={clearLoadWarning}>OK</button>
          </div>
        )}
        <main className="page">
          <Outlet />
        </main>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            <button onClick={() => dismissToast(t.id)} aria-label="Hinweis schließen">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
