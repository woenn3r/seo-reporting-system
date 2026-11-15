import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createShoot, updateShoot, type ShootInput } from "../domain/actions";
import { SHOOT_STATUS_LABEL } from "../domain/labels";
import type { CallSheetEntry, Shoot, ShootStatus } from "../domain/types";
import { todayISO } from "../domain/selectors";
import { run, useStore } from "../store/store";
import { ChipToggle, Field, Modal } from "./ui";

export function ShootModal({ shoot, onClose, onSaved }: { shoot?: Shoot; onClose: () => void; onSaved?: (id: string) => void }) {
  const ws = useStore((s) => s.ws);
  const filter = useStore((s) => s.ui.clientFilter);
  const clients = ws.clients.filter((c) => c.active || c.id === shoot?.clientId);
  const [f, setF] = useState<ShootInput>(
    shoot ?? {
      clientId: filter ?? clients[0]?.id ?? "",
      title: "",
      date: todayISO(new Date(Date.now() + 7 * 86400000)),
      startTime: "09:00",
      endTime: "13:00",
      status: "planned",
      location: { name: "" },
      teamIds: [],
      contentIds: [],
      equipment: [],
      schedule: [],
    },
  );
  const [equipText, setEquipText] = useState((shoot?.equipment ?? []).join("\n"));
  const crew = ws.team.filter((m) => m.role !== "client");
  const clientContents = ws.contents.filter((c) => c.clientId === f.clientId && c.stage !== "published");

  const setSchedule = (i: number, patch: Partial<CallSheetEntry>) => setF({ ...f, schedule: f.schedule.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input: ShootInput = {
      ...f,
      location: { name: f.location.name, address: f.location.address || undefined, notes: f.location.notes || undefined },
      equipment: equipText.split("\n").map((x) => x.trim()).filter(Boolean),
      schedule: f.schedule.filter((s) => s.label.trim()).map((s) => ({ ...s, label: s.label.trim() })).sort((a, b) => a.time.localeCompare(b.time)),
      notes: f.notes || undefined,
    };
    if (shoot) {
      if (run((w, c) => updateShoot(w, c, shoot.id, input), "Dreh gespeichert")) onClose();
    } else {
      const id = run((w, c) => createShoot(w, c, input), "Dreh geplant");
      if (id) {
        onClose();
        onSaved?.(id);
      }
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={shoot ? "Dreh bearbeiten" : "Neuen Dreh planen"}
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn primary" type="submit" form="shoot-form">Speichern</button>
        </>
      }
    >
      <form id="shoot-form" className="form-grid" onSubmit={submit}>
        <Field label="Titel" full>
          <input className="input" required autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="z. B. Dezember-Produktionstag" />
        </Field>
        <Field label="Kunde">
          <select className="select" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, contentIds: [] })} disabled={!!shoot}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ShootStatus })}>
            {(Object.keys(SHOOT_STATUS_LABEL) as ShootStatus[]).map((s) => <option key={s} value={s}>{SHOOT_STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Datum">
          <input className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <Field label="Beginn"><input className="input" type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
          <Field label="Ende"><input className="input" type="time" required value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
        </div>
        <Field label="Location">
          <input className="input" required value={f.location.name} onChange={(e) => setF({ ...f, location: { ...f.location, name: e.target.value } })} />
        </Field>
        <Field label="Adresse">
          <input className="input" value={f.location.address ?? ""} onChange={(e) => setF({ ...f, location: { ...f.location, address: e.target.value } })} />
        </Field>
        <Field label="Hinweise zur Location" full>
          <input className="input" value={f.location.notes ?? ""} onChange={(e) => setF({ ...f, location: { ...f.location, notes: e.target.value } })} placeholder="Parken, Strom, Ansprechpartner …" />
        </Field>
        <Field label="Crew" full>
          <ChipToggle options={crew.map((m) => m.id)} value={f.teamIds} onChange={(v) => setF({ ...f, teamIds: v })} labels={Object.fromEntries(crew.map((m) => [m.id, m.name]))} />
        </Field>
        <Field label="Contents an diesem Drehtag" full>
          {clientContents.length === 0 ? (
            <span className="small muted">Für diesen Kunden gibt es keine offenen Contents.</span>
          ) : (
            <ChipToggle options={clientContents.map((c) => c.id)} value={f.contentIds} onChange={(v) => setF({ ...f, contentIds: v })} labels={Object.fromEntries(clientContents.map((c) => [c.id, c.title]))} />
          )}
        </Field>
        <Field label="Equipment" hint="eine Zeile pro Teil">
          <textarea className="textarea" rows={6} value={equipText} onChange={(e) => setEquipText(e.target.value)} placeholder={"Kamera\nObjektive\nLicht\nTon"} />
        </Field>
        <div className="field">
          <span>Ablaufplan</span>
          <div className="stack" style={{ gap: 6 }}>
            {f.schedule.map((s, i) => (
              <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
                <input className="input" type="time" style={{ width: 110 }} value={s.time} onChange={(e) => setSchedule(i, { time: e.target.value })} aria-label="Uhrzeit" required />
                <input className="input" value={s.label} onChange={(e) => setSchedule(i, { label: e.target.value })} aria-label="Programmpunkt" />
                <button type="button" className="btn ghost sm icon danger" onClick={() => setF({ ...f, schedule: f.schedule.filter((_, j) => j !== i) })} aria-label="Entfernen"><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setF({ ...f, schedule: [...f.schedule, { time: f.schedule.at(-1)?.time ?? f.startTime, label: "" }] })}>
              <Plus size={14} /> Punkt
            </button>
          </div>
        </div>
        <Field label="Notizen" full>
          <textarea className="textarea" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
