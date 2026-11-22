import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Printer, Send, ThumbsUp, Trash2, Undo2 } from "lucide-react";
import {
  approveScript, createScript, currentScript, newScriptVersion, requestScriptChanges, submitScript, updateScript, type ScriptPatch,
} from "../domain/actions";
import { SCRIPT_STATUS_TONE } from "../domain/labels";
import type { Scene, Script } from "../domain/types";
import { fmtDateTime, fmtDuration } from "../i18n/format";
import { isClientUser } from "../domain/selectors";
import { newId } from "../domain/ids";
import { run, toast } from "../store/store";
import { Badge, Empty, Field, Modal, useMe, useScoped, useT, useUnsavedGuard } from "./ui";

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
  const t = useT();
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
  useUnsavedGuard(dirty && editable);

  if (!script || !draft) {
    return (
      <div className="card">
        <Empty title={t("script.none")}>
          {!client && (
            <button className="btn primary" onClick={() => run((w, c) => createScript(w, c, contentId), t("toast.scriptCreated"))}>
              <Plus size={16} /> {t("script.create")}
            </button>
          )}
        </Empty>
      </div>
    );
  }

  const save = (): boolean => {
    const patch: ScriptPatch = {
      hook: draft.hook,
      scenes: draft.scenes.map((s) => ({ ...s, title: s.title.trim() || t("script.scene") })),
      caption: draft.caption,
      hashtags: parseHashtags(draft.hashtags),
      cta: draft.cta,
    };
    return run((w, c) => updateScript(w, c, script.id, patch), t("toast.scriptSaved")) === true;
  };

  const submit = () => {
    if (dirty && !save()) return;
    run((w, c) => submitScript(w, c, script.id), t("toast.submitted"));
  };

  const setScene = (idx: number, patch: Partial<Scene>) =>
    setDraft({ ...draft, scenes: draft.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  const moveScene = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= draft.scenes.length) return;
    const next = [...draft.scenes];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setDraft({ ...draft, scenes: next });
  };
  const totalSec = draft.scenes.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);

  const copyText = async () => {
    const text = [
      `${t("script.hook").toUpperCase()}: ${draft.hook}`,
      "",
      ...draft.scenes.map((s, i) =>
        [`${i + 1}. ${s.title}${s.durationSec ? ` (${s.durationSec} ${t("unit.sec")})` : ""}`, s.visual && `   ${t("script.visual")}: ${s.visual}`, s.voiceover && `   ${t("script.voiceover")}: ${s.voiceover}`, s.onScreenText && `   ${t("script.onScreenText")}: ${s.onScreenText}`]
          .filter(Boolean)
          .join("\n"),
      ),
      "",
      `${t("script.caption").toUpperCase()}: ${draft.caption}`,
      `${t("script.hashtags").toUpperCase()}: ${parseHashtags(draft.hashtags).join(" ")}`,
      `${t("script.cta").toUpperCase()}: ${draft.cta}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast(t("toast.copied"), "success");
    } catch {
      toast(t("toast.copyFailed"), "error");
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card-pad spread">
        <div className="row">
          <Badge tone={SCRIPT_STATUS_TONE[script.status]}>{t(`scriptStatus.${script.status}`)}</Badge>
          <select className="select" style={{ width: "auto" }} value={script.id} onChange={(e) => setViewId(e.target.value)} aria-label={t("script.chooseVersion")}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {t(v.id === latest?.id ? "script.versionCurrent" : "script.version", { version: v.version })}
              </option>
            ))}
          </select>
          <span className="small muted">{t("script.meta", { date: fmtDateTime(script.updatedAt), duration: fmtDuration(totalSec) })}</span>
        </div>
        <div className="row no-print">
          <button className="btn ghost sm" onClick={copyText}><Copy size={14} /> {t("script.copyText")}</button>
          <button className="btn ghost sm" onClick={() => window.print()}><Printer size={14} /> {t("common.print")}</button>
          {editable && (
            <>
              <button className="btn" disabled={!dirty} onClick={save}>{t("common.save")}</button>
              <button className="btn primary" onClick={submit}><Send size={15} /> {t("script.submit")}</button>
            </>
          )}
          {isLatest && script.status === "in_review" && (
            <>
              <button className="btn" onClick={() => setReject(true)}><Undo2 size={15} /> {t("review.requestChanges")}</button>
              <button className="btn success" onClick={() => run((w, c) => approveScript(w, c, script.id), t("toast.scriptApproved"))}>
                <ThumbsUp size={15} /> {t("review.approve")}
              </button>
            </>
          )}
          {isLatest && !client && (script.status === "approved" || script.status === "in_review") && (
            <button className="btn" onClick={() => run((w, c) => newScriptVersion(w, c, script.id), t("toast.versionCreated"))}>{t("script.newVersion")}</button>
          )}
        </div>
      </div>

      {script.status === "changes_requested" && script.reviewNote && (
        <div className="card card-pad" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}>
          <strong>{t("script.feedback")}</strong> {script.reviewNote}
        </div>
      )}
      {!isLatest && <div className="small muted">{t("script.olderVersion")}</div>}

      <div className="card card-pad">
        <Field label={t("script.hook")} hint={t("script.hookHint")}>
          {editable ? (
            <input className="input" value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} placeholder={t("script.hookPlaceholder")} />
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
                <input className="input" style={{ height: 30 }} value={s.title} onChange={(e) => setScene(i, { title: e.target.value })} aria-label={t("script.sceneTitle", { n: i + 1 })} />
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
                    aria-label={t("script.durationSec")}
                    title={t("script.durationSec")}
                  />
                  <span className="small muted">{t("unit.sec")}</span>
                  <button className="btn ghost sm icon" onClick={() => moveScene(i, -1)} aria-label={t("common.moveUp")}><ArrowUp size={14} /></button>
                  <button className="btn ghost sm icon" onClick={() => moveScene(i, 1)} aria-label={t("common.moveDown")}><ArrowDown size={14} /></button>
                  <button
                    className="btn ghost sm icon danger"
                    onClick={() => setDraft({ ...draft, scenes: draft.scenes.filter((_, j) => j !== i) })}
                    aria-label={t("script.deleteScene")}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                s.durationSec !== undefined && <span className="small muted mono">{s.durationSec} {t("unit.sec")}</span>
              )}
            </div>
            <div className="scene-grid">
              {(["visual", "voiceover", "onScreenText"] as const).map((k) => (
                <Field key={k} label={t(`script.${k}`)}>
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
            onClick={() => setDraft({ ...draft, scenes: [...draft.scenes, { id: newId("s"), title: t("script.sceneN", { n: draft.scenes.length + 1 }) }] })}
          >
            <Plus size={16} /> {t("script.addScene")}
          </button>
        )}
      </div>

      <div className="card card-pad form-grid">
        <Field label={t("script.caption")} full>
          {editable ? (
            <textarea className="textarea" value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
          ) : (
            <div className="readonly-block">{script.caption || "–"}</div>
          )}
        </Field>
        <Field label={t("script.hashtags")} hint={t("script.hashtagsHint")}>
          {editable ? (
            <input className="input" value={draft.hashtags} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })} placeholder={t("script.hashtagsPlaceholder")} />
          ) : (
            <div className="readonly-block">{(script.hashtags ?? []).join(" ") || "–"}</div>
          )}
        </Field>
        <Field label={t("script.cta")}>
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
        title={t("review.requestChanges")}
        footer={
          <>
            <button className="btn" onClick={() => setReject(false)}>{t("common.cancel")}</button>
            <button
              className="btn primary"
              disabled={!note.trim()}
              onClick={() => {
                if (run((w, c) => requestScriptChanges(w, c, script.id, note), t("toast.feedbackSent"))) {
                  setReject(false);
                  setNote("");
                }
              }}
            >
              {t("common.send")}
            </button>
          </>
        }
      >
        <Field label={t("review.whatToChange")}>
          <textarea className="textarea" rows={5} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  );
}
