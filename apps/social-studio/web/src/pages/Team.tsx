import { useState, type FormEvent } from "react";
import { addMember, type MemberInput } from "../domain/actions";
import { ROLES, type Role } from "../domain/types";
import { ROLE_LABEL } from "../domain/labels";
import { run, useStore } from "../store/store";
import { Avatar, Badge, Field, Modal, PageHeader } from "../components/ui";

export function Team() {
  const ws = useStore((s) => s.ws);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Team & Kundenzugänge" sub="Rollen steuern, was jemand sieht: Kunden sehen nur ihre eigenen Inhalte und kein Rohmaterial." actions={<button className="btn primary" onClick={() => setOpen(true)}>+ Person</button>} />
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Rolle</th><th>E-Mail</th><th>Zugeordnet</th><th>Aufgaben</th></tr></thead>
            <tbody>
              {ws.team.map((m) => (
                <tr key={m.id}>
                  <td><span className="row" style={{ flexWrap: "nowrap" }}><Avatar member={m} /> {m.name}</span></td>
                  <td><Badge tone={m.role === "client" ? "warn" : "neutral"}>{ROLE_LABEL[m.role]}</Badge></td>
                  <td className="muted">{m.email ?? "–"}</td>
                  <td>{m.clientId ? ws.clients.find((c) => c.id === m.clientId)?.name : "Alle Kunden"}</td>
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
  const ws = useStore((s) => s.ws);
  const [f, setF] = useState<MemberInput>({ name: "", role: "creator", email: "" });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (run((w, c) => addMember(w, c, { ...f, email: f.email || undefined }), "Person hinzugefügt")) onClose();
  };
  return (
    <Modal open onClose={onClose} title="Person hinzufügen" footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary" type="submit" form="member-form">Hinzufügen</button></>}>
      <form id="member-form" className="form-grid" onSubmit={submit}>
        <Field label="Name"><input className="input" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="E-Mail"><input className="input" type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Rolle">
          <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role, clientId: e.target.value === "client" ? ws.clients[0]?.id : undefined })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        {f.role === "client" && (
          <Field label="Kunde">
            <select className="select" value={f.clientId ?? ""} onChange={(e) => setF({ ...f, clientId: e.target.value })} required>
              {ws.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
      </form>
      <p className="small muted" style={{ marginTop: 12 }}>Hinweis: Echte Einladungen/Logins benötigen ein Backend mit Authentifizierung (noch nicht enthalten).</p>
    </Modal>
  );
}
