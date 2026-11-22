import { useState, type FormEvent } from "react";
import { addMember, type MemberInput } from "../domain/actions";
import { ROLES, type Role } from "../domain/types";
import { run, useStore } from "../store/store";
import { Avatar, Badge, Field, Modal, PageHeader, useT } from "../components/ui";

export function Team() {
  const t = useT();
  const ws = useStore((s) => s.ws);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title={t("team.title")} sub={t("team.sub")} actions={<button className="btn primary" onClick={() => setOpen(true)}>+ {t("team.person")}</button>} />
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t("field.name")}</th><th>{t("team.role")}</th><th>{t("common.email")}</th><th>{t("team.assignedTo")}</th><th>{t("team.tasks")}</th></tr></thead>
            <tbody>
              {ws.team.map((m) => (
                <tr key={m.id}>
                  <td><span className="row" style={{ flexWrap: "nowrap" }}><Avatar member={m} /> {m.name}</span></td>
                  <td><Badge tone={m.role === "client" ? "warn" : "neutral"}>{t(`role.${m.role}`)}</Badge></td>
                  <td className="muted">{m.email ?? "–"}</td>
                  <td>{m.clientId ? ws.clients.find((c) => c.id === m.clientId)?.name : t("nav.allClients")}</td>
                  <td className="mono">{ws.contents.filter((c) => c.assigneeIds.includes(m.id) && c.stage !== "published").length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <MemberModal onClose={() => setOpen(false)} />}
    </>
  );
}

function MemberModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ws = useStore((s) => s.ws);
  const [f, setF] = useState<MemberInput>({ name: "", role: "creator", email: "" });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (run((w, c) => addMember(w, c, { ...f, email: f.email || undefined }), t("toast.memberAdded"))) onClose();
  };
  return (
    <Modal open onClose={onClose} title={t("team.add")} footer={<><button className="btn" onClick={onClose}>{t("common.cancel")}</button><button className="btn primary" type="submit" form="member-form">{t("common.add")}</button></>}>
      <form id="member-form" className="form-grid" onSubmit={submit}>
        <Field label={t("field.name")}><input className="input" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t("common.email")}><input className="input" type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label={t("team.role")}>
          <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role, clientId: e.target.value === "client" ? ws.clients[0]?.id : undefined })}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
          </select>
        </Field>
        {f.role === "client" && (
          <Field label={t("content.client")}>
            <select className="select" value={f.clientId ?? ""} onChange={(e) => setF({ ...f, clientId: e.target.value })} required>
              {ws.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
      </form>
      <p className="small muted" style={{ marginTop: 12 }}>{t("team.authNote")}</p>
    </Modal>
  );
}
