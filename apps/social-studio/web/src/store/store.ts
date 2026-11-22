// Application store: holds the full workspace, persists it locally and validates every change
// against the contract before committing it (no schema drift possible from the UI).

import { useSyncExternalStore } from "react";
import seedJson from "@examples/social_studio/workspace.json";
import type { Ctx, Result } from "../domain/actions";
import { DomainError } from "../domain/actions";
import { newId } from "../domain/ids";
import type { ID, Workspace } from "../domain/types";
import { assertWorkspace, validateWorkspace } from "../domain/validate";
import { mediaStore } from "./mediaStore";
import { detectLang, isLang, setCurrentLang, t, type Lang } from "../i18n";
import { describeActivity } from "../i18n/activity";

const WS_KEY = "social-studio:v1:workspace";
const UI_KEY = "social-studio:v1:ui";

export interface UiState {
  clientFilter: ID | null;
  lang: Lang;
}

export interface Toast {
  id: number;
  kind: "error" | "success" | "info";
  text: string;
}

interface State {
  ws: Workspace;
  ui: UiState;
  toasts: Toast[];
  loadWarning?: string;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function seedWorkspace(): Workspace {
  return assertWorkspace(structuredClone(seedJson));
}

function loadInitial(): State {
  let ws: Workspace | undefined;
  let loadWarning: string | undefined;
  const raw = safeGet(WS_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const res = validateWorkspace(parsed);
      if (res.ok) ws = parsed as Workspace;
      else loadWarning = `invalid:${res.errors[0] ?? ""}`;
    } catch {
      loadWarning = "corrupt";
    }
  }
  const browserLangs = typeof navigator !== "undefined" ? navigator.languages : undefined;
  let ui: UiState = { clientFilter: null, lang: detectLang(browserLangs) };
  try {
    const u = JSON.parse(safeGet(UI_KEY) ?? "null") as Partial<UiState> | null;
    if (u) {
      ui = {
        clientFilter: typeof u.clientFilter === "string" ? u.clientFilter : null,
        lang: isLang(u.lang) ? u.lang : ui.lang,
      };
    }
  } catch {
    /* ignore */
  }
  setCurrentLang(ui.lang);
  const finalWs = ws ?? seedWorkspace();
  if (ui.clientFilter && !finalWs.clients.some((c) => c.id === ui.clientFilter)) ui = { ...ui, clientFilter: null };
  return { ws: finalWs, ui, toasts: [], loadWarning };
}

let state: State = loadInitial();
const listeners = new Set<() => void>();
let toastSeq = 1;

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function getState(): State {
  return state;
}

export function toast(text: string, kind: Toast["kind"] = "info") {
  const t: Toast = { id: toastSeq++, kind, text };
  emit({ ...state, toasts: [...state.toasts, t] });
  setTimeout(() => dismissToast(t.id), kind === "error" ? 7000 : 3500);
}

export function dismissToast(id: number) {
  if (!state.toasts.some((t) => t.id === id)) return;
  emit({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
}

function ctx(): Ctx {
  return { now: new Date().toISOString(), actorId: state.ws.workspace.currentUserId, newId, describe: (p) => describeActivity(state.ui.lang, p) };
}

function commit(ws: Workspace): boolean {
  const res = validateWorkspace(ws);
  if (!res.ok) {
    // Programming error guard: never persist contract-violating data.
    console.error("Contract violation", res.errors);
    toast(t("toast.contractViolation", { detail: res.errors[0] ?? "" }), "error");
    return false;
  }
  emit({ ...state, ws });
  if (!safeSet(WS_KEY, JSON.stringify(ws))) {
    toast(t("toast.storageFull"), "error");
  }
  return true;
}

/** Run a workflow action. Returns the action's value, or undefined if it failed (error is toasted). */
export function run<T>(fn: (ws: Workspace, c: Ctx) => Result<T>, successText?: string): T | undefined;
export function run(fn: (ws: Workspace, c: Ctx) => Workspace, successText?: string): true | undefined;
export function run<T>(fn: (ws: Workspace, c: Ctx) => Workspace | Result<T>, successText?: string): T | true | undefined {
  try {
    const out = fn(state.ws, ctx());
    const isResult = (o: Workspace | Result<T>): o is Result<T> => "value" in o && "ws" in o && !("schemaVersion" in o);
    const ws = isResult(out) ? out.ws : out;
    if (!commit(ws)) return undefined;
    if (successText) toast(successText, "success");
    return isResult(out) ? out.value : true;
  } catch (e) {
    toast(e instanceof DomainError ? DomainError.render(e.key, e.params) : t("toast.unexpected", { detail: (e as Error).message }), "error");
    if (!(e instanceof DomainError)) console.error(e);
    return undefined;
  }
}

export function setClientFilter(clientFilter: ID | null) {
  const ui = { ...state.ui, clientFilter };
  emit({ ...state, ui });
  safeSet(UI_KEY, JSON.stringify(ui));
}

export function setLang(lang: Lang) {
  setCurrentLang(lang);
  const ui = { ...state.ui, lang };
  emit({ ...state, ui });
  safeSet(UI_KEY, JSON.stringify(ui));
}

export function replaceWorkspace(ws: Workspace): boolean {
  return commit(ws);
}

export async function resetDemo(): Promise<void> {
  try {
    await mediaStore.clear();
  } catch {
    /* storage unavailable – metadata reset still proceeds */
  }
  setClientFilter(null);
  commit(seedWorkspace());
  emit({ ...state, loadWarning: undefined });
}

export function clearLoadWarning() {
  emit({ ...state, loadWarning: undefined });
}
