import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Building2, CalendarDays, Camera, CheckCircle2, Clapperboard, Columns3, FileText, Film, Globe, LayoutDashboard, Menu, Settings, Users,
} from "lucide-react";
import { approvalInbox, currentUser, editQueue, isClientUser } from "../domain/selectors";
import { setCurrentUser } from "../domain/actions";
import { LANGS, type Lang } from "../i18n";
import { clearLoadWarning, dismissToast, run, setClientFilter, setLang, useStore } from "../store/store";
import { Avatar, useScoped, useT } from "./ui";

export function LanguageSelect({ compact }: { compact?: boolean }) {
  const t = useT();
  const lang = useStore((s) => s.ui.lang);
  return (
    <div className="row" style={{ flexWrap: "nowrap" }}>
      {!compact && <Globe size={16} aria-hidden />}
      <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("nav.language")}>
        {LANGS.map((l) => (
          <option key={l} value={l}>{t(`lang.${l}`)}</option>
        ))}
      </select>
    </div>
  );
}

export function Layout() {
  const t = useT();
  const ws = useStore((s) => s.ws);
  const filter = useStore((s) => s.ui.clientFilter);
  const lang = useStore((s) => s.ui.lang);
  const toasts = useStore((s) => s.toasts);
  const loadWarning = useStore((s) => s.loadWarning);
  const scoped = useScoped();
  const me = currentUser(ws);
  const client = isClientUser(me);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = `Social Studio`;
    document.documentElement.lang = lang;
  }, [lang]);

  const approvals = useMemo(() => approvalInbox(scoped).length, [scoped]);
  const edits = useMemo(() => editQueue(scoped).length, [scoped]);

  const nav = (to: string, icon: ReactNode, label: string, count?: number) => (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
      {icon}
      <span>{label}</span>
      {count ? <span className="count" aria-label={t("nav.openCount", { count })}>{count}</span> : null}
    </NavLink>
  );

  const warningText = loadWarning === "corrupt" ? t("load.corrupt") : loadWarning ? t("load.invalid", { detail: loadWarning.replace(/^invalid:/, "") }) : "";

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label={t("nav.main")}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">Social Studio</div>
            <div className="brand-sub">{ws.workspace.name}</div>
          </div>
        </div>

        <label className="field" style={{ padding: "0 4px" }}>
          <span className="nav-label" style={{ padding: "0 6px" }}>{t("nav.client")}</span>
          {client ? (
            <div className="input row" style={{ display: "flex" }}>
              <span className="dot" style={{ background: scoped.clients[0]?.color }} />
              <span className="truncate">{scoped.clients[0]?.name ?? "–"}</span>
            </div>
          ) : (
            <select className="select" value={filter ?? ""} onChange={(e) => setClientFilter(e.target.value || null)} aria-label={t("nav.filterClient")}>
              <option value="">{t("nav.allClients")}</option>
              {ws.clients.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </label>

        <nav>
          <div className="nav-group">{nav("/", <LayoutDashboard size={17} />, t("nav.overview"))}</div>
          <div className="nav-group">
            <div className="nav-label">{t("nav.production")}</div>
            {nav("/pipeline", <Columns3 size={17} />, t("nav.pipeline"))}
            {nav("/scripts", <FileText size={17} />, t("nav.scripts"))}
            {!client && nav("/shotlists", <Camera size={17} />, t("nav.shotlists"))}
            {nav("/shoots", <Clapperboard size={17} />, t("nav.shoots"))}
          </div>
          <div className="nav-group">
            <div className="nav-label">{t("nav.review")}</div>
            {nav("/media", <Film size={17} />, client ? t("nav.videos") : t("nav.media"), client ? undefined : edits)}
            {nav("/approvals", <CheckCircle2 size={17} />, t("nav.approvals"), approvals)}
          </div>
          <div className="nav-group">
            <div className="nav-label">{t("nav.planning")}</div>
            {nav("/calendar", <CalendarDays size={17} />, t("nav.calendar"))}
          </div>
          {!client && (
            <div className="nav-group">
              <div className="nav-label">{t("nav.admin")}</div>
              {nav("/clients", <Building2 size={17} />, t("nav.clients"))}
              {nav("/team", <Users size={17} />, t("nav.team"))}
              {nav("/settings", <Settings size={17} />, t("nav.settings"))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer stack" style={{ gap: 10 }}>
          <label className="field">
            <span className="nav-label" style={{ padding: "0 6px" }}>{t("nav.language")}</span>
            <LanguageSelect />
          </label>
          <label className="field">
            <span className="nav-label" style={{ padding: "0 6px" }}>{t("nav.signedInAs")}</span>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Avatar member={me} />
              <select className="select" value={me.id} onChange={(e) => run((w) => setCurrentUser(w, e.target.value))} aria-label={t("nav.switchUser")}>
                {ws.team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} – {t(`role.${m.role}`)}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="btn ghost icon" onClick={() => setOpen(true)} aria-label={t("nav.openMenu")}>
            <Menu size={20} />
          </button>
          <strong>Social Studio</strong>
        </div>
        {loadWarning && (
          <div className="banner" role="status">
            <span>{warningText}</span>
            <button className="btn sm" onClick={clearLoadWarning}>{t("common.ok")}</button>
          </div>
        )}
        <main className="page">
          <Outlet />
        </main>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.kind}`}>
            <span>{x.text}</span>
            <button onClick={() => dismissToast(x.id)} aria-label={t("common.dismiss")}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
