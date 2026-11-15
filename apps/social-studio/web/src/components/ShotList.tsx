import { useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Camera, Pencil, Plus, Trash2 } from "lucide-react";
import { addShot, currentScript, deleteShot, moveShot, shotsFor, updateShot, type ShotInput } from "../domain/actions";
import { ANGLE_LABEL, ASPECT_LABEL, FRAMING_LABEL, MOVEMENT_LABEL } from "../domain/labels";
import { ANGLES, ASPECT_RATIOS, FRAMINGS, MOVEMENTS, type AspectRatio, type Shot } from "../domain/types";
import { isClientUser } from "../domain/selectors";
import { run } from "../store/store";
import { Badge, Empty, Field, Modal, Progress, useMe, useScoped } from "./ui";

const aspectClass: Record<AspectRatio, string> = { "9:16": "", "4:5": "feed", "1:1": "square", "16:9": "landscape" };

export function ShotList({ contentId, compact, hideHeader }: { contentId: string; compact?: boolean; hideHeader?: boolean }) {
  const ws = useScoped();
  const me = useMe();
  const readOnly = isClientUser(me);
  const shots = useMemo(() => shotsFor(ws, contentId), [ws, contentId]);
  const scenes = currentScript(ws, contentId)?.scenes ?? [];
  const [editing, setEditing] = useState<Shot | "new" | null>(null);
  const done = shots.filter((s) => s.done).length;

  return (
    <div className="card">
      {!hideHeader && (
        <div className="card-head">
          <div style={{ flex: 1, maxWidth: 360 }}>
            <Progress value={done} total={shots.length} label="Shots abgedreht" />
          </div>
          {!readOnly && (
            <button className="btn sm no-print" onClick={() => setEditing("new")}>
              <Plus size={14} /> Shot
            </button>
          )}
        </div>
      )}
      {shots.length === 0 ? (
        <Empty icon={<Camera size={22} />} title="Noch keine Shots">
          <span className="small">Lege fest, welche Einstellungen und Perspektiven gedreht werden.</span>
        </Empty>
      ) : (
        shots.map((s, i) => {
          const scene = scenes.find((sc) => sc.id === s.sceneId);
          return (
            <div key={s.id} className={`shot-row ${s.done ? "done" : ""}`}>
              <input
                type="checkbox"
                className="check"
                checked={s.done}
                disabled={readOnly}
                onChange={(e) => run((w, c) => updateShot(w, c, s.id, { done: e.target.checked }))}
                aria-label={`Shot ${i + 1} erledigt`}
              />
              <div className={`shot-thumb ${aspectClass[s.aspectRatio]}`} title={ASPECT_LABEL[s.aspectRatio]}>
                {i + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="shot-desc" style={{ fontWeight: 550 }}>{s.description}</div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <Badge tone="accent">{FRAMING_LABEL[s.framing]}</Badge>
                  <Badge tone="info">{ANGLE_LABEL[s.angle]}</Badge>
                  <Badge>{MOVEMENT_LABEL[s.movement]}</Badge>
                  {!compact && <Badge>{s.aspectRatio}</Badge>}
                  {s.lens && <Badge>{s.lens}</Badge>}
                  {scene && <span className="small muted">→ Szene „{scene.title}“</span>}
                </div>
                {s.notes && <div className="small muted" style={{ marginTop: 4 }}>{s.notes}</div>}
              </div>
              {!readOnly && (
                <div className="row no-print" style={{ gap: 2, flexWrap: "nowrap" }}>
                  <button className="btn ghost sm icon" onClick={() => run((w, c) => moveShot(w, c, s.id, -1))} aria-label="Nach oben" disabled={i === 0}><ArrowUp size={14} /></button>
                  <button className="btn ghost sm icon" onClick={() => run((w, c) => moveShot(w, c, s.id, 1))} aria-label="Nach unten" disabled={i === shots.length - 1}><ArrowDown size={14} /></button>
                  <button className="btn ghost sm icon" onClick={() => setEditing(s)} aria-label="Bearbeiten"><Pencil size={14} /></button>
                  <button
                    className="btn ghost sm icon danger"
                    onClick={() => confirm(`Shot „${s.description}“ löschen?`) && run((w, c) => deleteShot(w, c, s.id), "Shot gelöscht")}
                    aria-label="Löschen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
      {editing && <ShotModal contentId={contentId} shot={editing === "new" ? undefined : editing} scenes={scenes} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ShotModal({ contentId, shot, scenes, onClose }: { contentId: string; shot?: Shot; scenes: { id: string; title: string }[]; onClose: () => void }) {
  const [f, setF] = useState<ShotInput>({
    description: shot?.description ?? "",
    framing: shot?.framing ?? "medium",
    angle: shot?.angle ?? "eye_level",
    movement: shot?.movement ?? "static",
    aspectRatio: shot?.aspectRatio ?? "9:16",
    lens: shot?.lens ?? "",
    notes: shot?.notes ?? "",
    sceneId: shot?.sceneId ?? "",
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input = { ...f, sceneId: f.sceneId || undefined, lens: f.lens || undefined, notes: f.notes || undefined };
    const ok = shot ? run((w, c) => updateShot(w, c, shot.id, input), "Shot gespeichert") : run((w, c) => addShot(w, c, contentId, input), "Shot hinzugefügt");
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={shot ? "Shot bearbeiten" : "Neuer Shot"}
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn primary" type="submit" form="shot-form">Speichern</button>
        </>
      }
    >
      <form id="shot-form" className="form-grid" onSubmit={submit}>
        <Field label="Was wird gezeigt?" full>
          <input className="input" required autoFocus value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="z. B. Hände gießen Milch in die Tasse" />
        </Field>
        <Field label="Einstellungsgröße">
          <select className="select" value={f.framing} onChange={(e) => setF({ ...f, framing: e.target.value as ShotInput["framing"] })}>
            {FRAMINGS.map((x) => <option key={x} value={x}>{FRAMING_LABEL[x]}</option>)}
          </select>
        </Field>
        <Field label="Perspektive">
          <select className="select" value={f.angle} onChange={(e) => setF({ ...f, angle: e.target.value as ShotInput["angle"] })}>
            {ANGLES.map((x) => <option key={x} value={x}>{ANGLE_LABEL[x]}</option>)}
          </select>
        </Field>
        <Field label="Kamerabewegung">
          <select className="select" value={f.movement} onChange={(e) => setF({ ...f, movement: e.target.value as ShotInput["movement"] })}>
            {MOVEMENTS.map((x) => <option key={x} value={x}>{MOVEMENT_LABEL[x]}</option>)}
          </select>
        </Field>
        <Field label="Format">
          <select className="select" value={f.aspectRatio} onChange={(e) => setF({ ...f, aspectRatio: e.target.value as AspectRatio })}>
            {ASPECT_RATIOS.map((x) => <option key={x} value={x}>{ASPECT_LABEL[x]}</option>)}
          </select>
        </Field>
        <Field label="Objektiv / Brennweite">
          <input className="input" value={f.lens} onChange={(e) => setF({ ...f, lens: e.target.value })} placeholder="z. B. 35 mm" />
        </Field>
        <Field label="Szene im Skript">
          <select className="select" value={f.sceneId} onChange={(e) => setF({ ...f, sceneId: e.target.value })}>
            <option value="">–</option>
            {scenes.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
        <Field label="Notizen (intern)" full>
          <textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Licht, Requisiten, Framerate …" />
        </Field>
      </form>
    </Modal>
  );
}
