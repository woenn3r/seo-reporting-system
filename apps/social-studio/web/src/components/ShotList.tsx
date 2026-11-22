import { useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Camera, Pencil, Plus, Trash2 } from "lucide-react";
import { addShot, currentScript, deleteShot, moveShot, shotsFor, updateShot, type ShotInput } from "../domain/actions";
import { ANGLES, ASPECT_RATIOS, FRAMINGS, MOVEMENTS, type AspectRatio, type Shot } from "../domain/types";
import { isClientUser } from "../domain/selectors";
import { run } from "../store/store";
import { Badge, Empty, Field, Modal, Progress, useMe, useScoped, useT } from "./ui";

const aspectClass: Record<AspectRatio, string> = { "9:16": "", "4:5": "feed", "1:1": "square", "16:9": "landscape" };

export function ShotList({ contentId, compact, hideHeader }: { contentId: string; compact?: boolean; hideHeader?: boolean }) {
  const ws = useScoped();
  const t = useT();
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
            <Progress value={done} total={shots.length} label={t("shots.progress")} />
          </div>
          {!readOnly && (
            <button className="btn sm no-print" onClick={() => setEditing("new")}>
              <Plus size={14} /> {t("shots.shot")}
            </button>
          )}
        </div>
      )}
      {shots.length === 0 ? (
        <Empty icon={<Camera size={22} />} title={t("shots.none")}>
          <span className="small">{t("shots.noneHint")}</span>
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
                aria-label={t("shots.doneLabel", { n: i + 1 })}
              />
              <div className={`shot-thumb ${aspectClass[s.aspectRatio]}`} title={t(`aspect.${s.aspectRatio}`)}>
                {i + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="shot-desc" style={{ fontWeight: 550 }}>{s.description}</div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <Badge tone="accent">{t(`framing.${s.framing}`)}</Badge>
                  <Badge tone="info">{t(`angle.${s.angle}`)}</Badge>
                  <Badge>{t(`movement.${s.movement}`)}</Badge>
                  {!compact && <Badge>{s.aspectRatio}</Badge>}
                  {s.lens && <Badge>{s.lens}</Badge>}
                  {scene && <span className="small muted">→ {t("shots.sceneRef", { title: scene.title })}</span>}
                </div>
                {s.notes && <div className="small muted" style={{ marginTop: 4 }}>{s.notes}</div>}
              </div>
              {!readOnly && (
                <div className="row no-print" style={{ gap: 2, flexWrap: "nowrap" }}>
                  <button className="btn ghost sm icon" onClick={() => run((w, c) => moveShot(w, c, s.id, -1))} aria-label={t("common.moveUp")} disabled={i === 0}><ArrowUp size={14} /></button>
                  <button className="btn ghost sm icon" onClick={() => run((w, c) => moveShot(w, c, s.id, 1))} aria-label={t("common.moveDown")} disabled={i === shots.length - 1}><ArrowDown size={14} /></button>
                  <button className="btn ghost sm icon" onClick={() => setEditing(s)} aria-label={t("common.edit")}><Pencil size={14} /></button>
                  <button
                    className="btn ghost sm icon danger"
                    onClick={() => confirm(t("shots.confirmDelete", { title: s.description })) && run((w, c) => deleteShot(w, c, s.id), t("toast.shotDeleted"))}
                    aria-label={t("common.delete")}
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
  const t = useT();
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
    const ok = shot ? run((w, c) => updateShot(w, c, shot.id, input), t("toast.shotSaved")) : run((w, c) => addShot(w, c, contentId, input), t("toast.shotAdded"));
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={shot ? t("shots.edit") : t("shots.new")}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn primary" type="submit" form="shot-form">{t("common.save")}</button>
        </>
      }
    >
      <form id="shot-form" className="form-grid" onSubmit={submit}>
        <Field label={t("shots.what")} full>
          <input className="input" required autoFocus value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t("shots.whatPlaceholder")} />
        </Field>
        <Field label={t("shots.framing")}>
          <select className="select" value={f.framing} onChange={(e) => setF({ ...f, framing: e.target.value as ShotInput["framing"] })}>
            {FRAMINGS.map((x) => <option key={x} value={x}>{t(`framing.${x}`)}</option>)}
          </select>
        </Field>
        <Field label={t("shots.angle")}>
          <select className="select" value={f.angle} onChange={(e) => setF({ ...f, angle: e.target.value as ShotInput["angle"] })}>
            {ANGLES.map((x) => <option key={x} value={x}>{t(`angle.${x}`)}</option>)}
          </select>
        </Field>
        <Field label={t("shots.movement")}>
          <select className="select" value={f.movement} onChange={(e) => setF({ ...f, movement: e.target.value as ShotInput["movement"] })}>
            {MOVEMENTS.map((x) => <option key={x} value={x}>{t(`movement.${x}`)}</option>)}
          </select>
        </Field>
        <Field label={t("shots.aspect")}>
          <select className="select" value={f.aspectRatio} onChange={(e) => setF({ ...f, aspectRatio: e.target.value as AspectRatio })}>
            {ASPECT_RATIOS.map((x) => <option key={x} value={x}>{t(`aspect.${x}`)}</option>)}
          </select>
        </Field>
        <Field label={t("shots.lens")}>
          <input className="input" value={f.lens} onChange={(e) => setF({ ...f, lens: e.target.value })} placeholder={t("shots.lensPlaceholder")} />
        </Field>
        <Field label={t("shots.scene")}>
          <select className="select" value={f.sceneId} onChange={(e) => setF({ ...f, sceneId: e.target.value })}>
            <option value="">–</option>
            {scenes.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
        <Field label={t("shots.notes")} full>
          <textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={t("shots.notesPlaceholder")} />
        </Field>
      </form>
    </Modal>
  );
}
