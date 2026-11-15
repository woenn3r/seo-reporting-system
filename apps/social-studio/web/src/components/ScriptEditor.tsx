import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Printer, Send, ThumbsUp, Trash2, Undo2 } from "lucide-react";
import {
  approveScript, createScript, currentScript, newScriptVersion, requestScriptChanges, submitScript, updateScript, type ScriptPatch,
} from "../domain/actions";
import { SCRIPT_STATUS_LABEL, SCRIPT_STATUS_TONE } from "../domain/labels";
import type { Scene, Script } from "../domain/types";
import { fmtDateTime, fmtDuration } from "../domain/format";
import { isClientUser } from "../domain/selectors";
import { newId } from "../domain/ids";
import { run, toast } from "../store/store";
import { Badge, Empty, Field, Modal, useMe, useScoped } from "./ui";

interface Draft {
  hook: string;
  scenes: Scene[];
  caption: string;
  hashtags: string;
  cta: string;
}

const toDraft = (s: Script): Draft => ({
  hook: s.hook,
  scenes: s.scenes,
  caption: s.caption ?? "",
  hashtags: (s.hashtags ?? []).join(" "),
  cta: s.cta ?? "",
});

/** "#a, b  #c" -> ["#a", "#b", "#c"] */
export function parseHashtags(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)))].filter((t) => t.length > 1);
}

export function ScriptEditor({ contentId }: { contentId: string }) {
  const ws = useScoped();
  const me = useMe();
  const client = isClientUser(me);
  const versions = useMemo(() => ws.scripts.filter((s) => s.contentId === contentId).sort((a, b) => b.version - a.version), [ws, contentId]);
  const latest = currentScript(ws, contentId);
  const [viewId, setViewId] = useState<string | undefined>(latest?.id);
  useEffect(() => setViewId(latest?.id), [latest?.id]);
  const script = versions.find((v) => v.id === viewId) ?? latest;
  const isLatest = script?.id === latest?.id;
  const editable = !!script && isLatest && !client && (script.status === "draft" || script.status === "changes_requested");

  const [draft, setDraft] = useState<Draft | null>(script ? toDraft(script) : null);
  useEffect(() => setDraft(script ? toDraft(script) : null), [script]);
  const [reject, setReject] = useState(false);
  const [note, setNote] = useState("");

  const dirty = !!script && !!draft && JSON.stringify(toDraft(script)) !== JSON.stringify(draft);

  if (!script || !draft) {
    return (
      <div className="card">
        <Empty title="Noch kein Skript">
          {!client && (
            <button className="btn primary" onClick={() => run((w, c) => createScript(w, c, contentId), "Skript angelegt")}>
              <Plus size={16} /> Skript anlegen
            </button>
          )}
        </Empty>
      </div>
    );
  }

  const save = (): boolean => {
    const patch: ScriptPatch = {
      hook: draft.hook,
      scenes: draft.scenes.map((s) => ({ ...s, title: s.title.trim() || "Szene" })),
      caption: draft.caption,
      hashtags: parseHashtags(draft.hashtags),
      cta: draft.cta,
    };
    return run((w, c) => updateScript(w, c, script.id, patch), "Skript gespeichert") === true;
  };

  const submit = () => {
    if (dirty && !save()) return;
    run((w, c) => submitScript(w, c, script.id), "Zur Freigabe gesendet");
  };

  const setScene = (idx: number, patch: Partial<Scene>) =>
    setDraft({ ...draft, scenes: draft.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  const moveScene = (idx: number, dir: -1 | 1) => {
    const t = idx + dir;
    if (t < 0 || t >= draft.scenes.length) return;
    const next = [...draft.scenes];
    [next[idx], next[t]] = [next[t]!, next[idx]!];
    setDraft({ ...draft, scenes: next });
  };
  const totalSec = draft.scenes.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);

  const copyText = async () => {
    const text = [
      `HOOK: ${script.hook}`,
      "",
      ...script.scenes.map((s, i) =>
        [`${i + 1}. ${s.title}${s.durationSec ? ` (${s.durationSec}s)` : ""}`, s.visual && `   Bild: ${s.visual}`, s.voiceover && `   VO: ${s.voiceover}`, s.onScreenText && `   Text: ${s.onScreenText}`]
          .filter(Boolean)
          .join("\n"),
      ),
      "",
      `CAPTION: ${script.caption ?? ""}`,
      `HASHTAGS: ${(script.hashtags ?? []).join(" ")}`,
      `CTA: ${script.cta ?? ""}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("Skript als Text kopiert", "success");
    } catch {
      toast("Kopieren nicht möglich (Browser-Berechtigung).", "error");
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card-pad spread">
        <div className="row">
          <Badge tone={SCRIPT_STATUS_TONE[script.status]}>{SCRIPT_STATUS_LABEL[script.status]}</Badge>
          <select className="select" style={{ width: "auto" }} value={script.id} onChange={(e) => setViewId(e.target.value)} aria-label="Version wählen">
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                Version {v.version} {v.id === latest?.id ? "(aktuell)" : ""}
              </option>
            ))}
          </select>
          <span className="small muted">Zuletzt geändert {fmtDateTime(script.updatedAt)} · Länge ≈ {fmtDuration(totalSec)}</span>
        </div>
        <div className="row no-print">
          <button className="btn ghost sm" onClick={copyText}><Copy size={14} /> Text kopieren</button>
          <button className="btn ghost sm" onClick={() => window.print()}><Printer size={14} /> Drucken</button>
          {editable && (
            <>
              <button className="btn" disabled={!dirty} onClick={save}>Speichern</button>
              <button className="btn primary" onClick={submit}><Send size={15} /> Zur Freigabe senden</button>
            </>
          )}
          {isLatest && script.status === "in_review" && (
            <>
              <button className="btn" onClick={() => setReject(true)}><Undo2 size={15} /> Änderungen anfordern</button>
              <button className="btn success" onClick={() => run((w, c) => approveScript(w, c, script.id), "Skript freigegeben")}>
                <ThumbsUp size={15} /> Freigeben
              </button>
            </>
          )}
          {isLatest && !client && (script.status === "approved" || script.status === "in_review") && (
            <button className="btn" onClick={() => run((w, c) => newScriptVersion(w, c, script.id), "Neue Version angelegt")}>Neue Version</button>
          )}
        </div>
      </div>

      {script.status === "changes_requested" && script.reviewNote && (
        <div className="card card-pad" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}>
          <strong>Rückmeldung aus der Freigabe:</strong> {script.reviewNote}
        </div>
      )}
      {!isLatest && <div className="small muted">Du siehst eine ältere Version (nur lesen).</div>}

      <div className="card card-pad">
        <Field label="Hook" hint="die ersten 1–3 Sekunden">
          {editable ? (
            <input className="input" value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} placeholder="Was hält die Leute vom Weiterscrollen ab?" />
          ) : (
            <div className="readonly-block" style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{script.hook || "–"}</div>
          )}
        </Field>
      </div>

      <div className="stack">
        {draft.scenes.map((s, i) => (
          <div key={s.id} className="scene">
            <div className="scene-head">
              <span className="scene-num">{i + 1}</span>
              {editable ? (
                <input className="input" style={{ height: 30 }} value={s.title} onChange={(e) => setScene(i, { title: e.target.value })} aria-label={`Titel Szene ${i + 1}`} />
              ) : (
                <strong>{s.title}</strong>
              )}
              <span style={{ marginLeft: "auto" }} />
              {editable ? (
                <>
                  <input
                    className="input mono"
                    type="number"
                    min={0}
                    step={0.5}
                    style={{ width: 82, height: 30 }}
                    value={s.durationSec ?? ""}
                    onChange={(e) => setScene(i, { durationSec: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })}
                    aria-label="Dauer in Sekunden"
                    title="Dauer (Sek.)"
                  />
                  <span className="small muted">s</span>
                  <button className="btn ghost sm icon" onClick={() => moveScene(i, -1)} aria-label="Nach oben"><ArrowUp size={14} /></button>
                  <button className="btn ghost sm icon" onClick={() => moveScene(i, 1)} aria-label="Nach unten"><ArrowDown size={14} /></button>
                  <button
                    className="btn ghost sm icon danger"
                    onClick={() => setDraft({ ...draft, scenes: draft.scenes.filter((_, j) => j !== i) })}
                    aria-label="Szene löschen"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                s.durationSec !== undefined && <span className="small muted mono">{s.durationSec}s</span>
              )}
            </div>
            <div className="scene-grid">
              {(["visual", "voiceover", "onScreenText"] as const).map((k) => (
                <Field key={k} label={k === "visual" ? "Bild / Action" : k === "voiceover" ? "Voiceover / Gesprochen" : "Text-Einblendung"}>
                  {editable ? (
                    <textarea className="textarea" rows={3} value={s[k] ?? ""} onChange={(e) => setScene(i, { [k]: e.target.value })} />
                  ) : (
                    <div className="readonly-block">{s[k] || "–"}</div>
                  )}
                </Field>
              ))}
            </div>
          </div>
        ))}
        {editable && (
          <button
            className="btn"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setDraft({ ...draft, scenes: [...draft.scenes, { id: newId("s"), title: `Szene ${draft.scenes.length + 1}` }] })}
          >
            <Plus size={16} /> Szene hinzufügen
          </button>
        )}
      </div>

      <div className="card card-pad form-grid">
        <Field label="Caption" full>
          {editable ? (
            <textarea className="textarea" value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
          ) : (
            <div className="readonly-block">{script.caption || "–"}</div>
          )}
        </Field>
        <Field label="Hashtags" hint="mit Leerzeichen trennen">
          {editable ? (
            <input className="input" value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} placeholder="#reels #agentur" />
          ) : (
            <div className="readonly-block">{(script.hashtags ?? []).join(" ") || "–"}</div>
          )}
        </Field>
        <Field label="Call-to-Action">
          {editable ? (
            <input className="input" value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
          ) : (
            <div className="readonly-block">{script.cta || "–"}</div>
          )}
        </Field>
      </div>

      <Modal
        open={reject}
        onClose={() => setReject(false)}
        title="Änderungen anfordern"
        footer={
          <>
            <button className="btn" onClick={() => setReject(false)}>Abbrechen</button>
            <button
              className="btn primary"
              disabled={!note.trim()}
              onClick={() => {
                if (run((w, c) => requestScriptChanges(w, c, script.id, note), "Rückmeldung gesendet")) {
                  setReject(false);
                  setNote("");
                }
              }}
            >
              Senden
            </button>
          </>
        }
      >
        <Field label="Was soll geändert werden?">
          <textarea className="textarea" rows={5} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}
