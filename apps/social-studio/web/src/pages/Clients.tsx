import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { createClient, updateClient, type ClientInput } from "../domain/actions";
import { PLATFORMS, type Client, type Platform } from "../domain/types";
import { run, setClientFilter, useStore } from "../store/store";
import { Badge, Field, Modal, PageHeader, useT } from "../components/ui";

export function Clients() {
  const t = useT();
  const ws = useStore((s) => s.ws);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  return (
    <>
      <PageHeader title={t("nav.clients")} sub={t("clients.sub")} actions={<button className="btn primary" onClick={() => setEditing("new")}>+ {t("clients.add")}</button>} />
      <div className="grid grid-3">
        {ws.clients.map((c) => {
          const active = ws.contents.filter((x) => x.clientId === c.id && x.stage !== "published").length;
          return (
            <div key={c.id} className="card card-pad stack" style={{ gap: 10, opacity: c.active ? 1 : 0.6 }}>
              <div className="spread">
                <div className="row">
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: c.color, display: "inline-block" }} />
                  <div><strong>{c.name}</strong><div className="small muted">{c.industry ?? "–"}</div></div>
                </div>
                <button className="btn ghost sm icon" onClick={() => setEditing(c)} aria-label={t("clients.editNamed", { name: c.name })}><Pencil size={14} /></button>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {PLATFORMS.filter((p) => c.handles?.[p]).map((p) => <Badge key={p}>{t(`platform.${p}`)}: {c.handles![p]}</Badge>)}
              </div>
              {c.pillars && c.pillars.length > 0 && <div className="row" style={{ gap: 6 }}>{c.pillars.map((p) => <Badge key={p} tone="accent">{p}</Badge>)}</div>}
              {c.brandNotes && <p className="small muted">{c.brandNotes}</p>}
              <div className="spread small">
                <span className="muted">{c.contactName ?? ""}</span>
                <Link to="/pipeline" onClick={() => setClientFilter(c.id)} style={{ color: "var(--accent-text)" }}>{t("clients.activeContents", { count: active })} →</Link>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <ClientModal client={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ClientModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState<ClientInput>(client ?? { name: "", color: "#4f46e5", active: true, handles: {}, pillars: [] });
  const [pillars, setPillars] = useState((client?.pillars ?? []).join(", "));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const handles = Object.fromEntries(Object.entries(f.handles ?? {}).filter(([, v]) => v && v.trim())) as Partial<Record<Platform, string>>;
    const input: ClientInput = {
      ...f,
      handles: Object.keys(handles).length ? handles : undefined,
      pillars: [...new Set(pillars.split(",").map((p) => p.trim()).filter(Boolean))],
    };
    const ok = client ? run((w, c) => updateClient(w, c, client.id, input), t("toast.clientSaved")) : run((w, c) => createClient(w, c, input), t("toast.clientCreated"));
    if (ok) onClose();
  };
  return (
    <Modal open wide onClose={onClose} title={client ? t("clients.edit") : t("clients.new")} footer={<><button className="btn" onClick={onClose}>{t("common.cancel")}</button><button className="btn primary" type="submit" form="client-form">{t("common.save")}</button></>}>
      <form id="client-form" className="form-grid" onSubmit={submit}>
        <Field label={t("field.name")}><input className="input" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t("clients.industry")}><input className="input" value={f.industry ?? ""} onChange={(e) => setF({ ...f, industry: e.target.value })} /></Field>
        <Field label={t("clients.color")}><input className="input" type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        <Field label={t("content.status")}>
          <select className="select" value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })}><option value="1">{t("clients.active")}</option><option value="0">{t("clients.inactive")}</option></select>
        </Field>
        <Field label={t("clients.contact")}><input className="input" value={f.contactName ?? ""} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
        <Field label={t("common.email")}><input className="input" type="email" value={f.contactEmail ?? ""} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field>
        {PLATFORMS.map((p) => (
          <Field key={p} label={t(`platform.${p}`)}>
            <input className="input" value={f.handles?.[p] ?? ""} onChange={(e) => setF({ ...f, handles: { ...f.handles, [p]: e.target.value } })} placeholder="@handle" />
          </Field>
        ))}
        <Field label={t("clients.pillars")} hint={t("clients.pillarsHint")} full><input className="input" value={pillars} onChange={(e) => setPillars(e.target.value)} /></Field>
        <Field label={t("clients.brandNotes")} full><textarea className="textarea" value={f.brandNotes ?? ""} onChange={(e) => setF({ ...f, brandNotes: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
