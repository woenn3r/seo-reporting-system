// Application store: holds the full workspace, persists it through a WorkspaceRepository and
// validates every change (JSON Schema contract + referential integrity) before committing it.

import { useSyncExternalStore } from "react";
import seedJson from "@examples/social_studio/workspace.json";
import type { Ctx, Result } from "../domain/actions";
import { DomainError } from "../domain/actions";
import { newId } from "../domain/ids";
import { integrityErrors } from "../domain/integrity";
import type { ID, Workspace } from "../domain/types";
import { validateWorkspace } from "../domain/validate";
import { detectLang, isLang, setCurrentLang, t, type Lang } from "../i18n";
import { describeActivity } from "../i18n/activity";
import { errorText } from "../i18n/errors";
import { mediaStore } from "./mediaStore";
import { localKeyValue, localWorkspaceRepository, type WorkspaceRepository } from "./persistence";

const WS_KEY = "social-studio:v1:workspace";
const UI_KEY = "social-studio:v1:ui";

/** Swap this for an API-backed repository when a backend exists. */
const repository: WorkspaceRepository = localWorkspaceRepository(WS_KEY);

export interface UiState {
  clientFilter: ID | null;
  lang: Lang;
}

export interface Toast {
  id: number;
  kind: "error" | "success" | "info";
  text: string;
}

export type LoadWarning = { kind: "corrupt" } | { kind: "invalid" | "integrity"; detail: string };

interface State {
  ws: Workspace;
  ui: UiState;
  toasts: Toast[];
  loadWarning?: LoadWarning;
}

export type Check = { ok: true; ws: Workspace } | { ok: false; kind: "invalid" | "integrity"; errors: string[] };

/** Full validation of untrusted data: contract first, then references. */
export function checkWorkspace(data: unknown): Check {
  const schema = validateWorkspace(data);
  if (!schema.ok) return { ok: false, kind: "invalid", errors: schema.errors };
  const ws = data as Workspace;
  const integrity = integrityErrors(ws);
  if (integrity.length > 0) return { ok: false, kind: "integrity", errors: integrity };
  return { ok: true, ws };
}

export function seedWorkspace(): Workspace {
  const check = checkWorkspace(structuredClone(seedJson));
  if (!check.ok) throw new Error(`Seed data is invalid:\n${check.errors.join("\n")}`);
  return check.ws;
}

function readStored(): { ws?: Workspace; warning?: LoadWarning } {
  const raw = repository.load();
  if (raw === null) return {};
  if (raw === undefined) return { warning: { kind: "corrupt" } };
  const check = checkWorkspace(raw);
  return check.ok ? { ws: check.ws } : { warning: { kind: check.kind, detail: check.errors[0] ?? "" } };
}

/** The client filter must always point at an existing client. */
function normalizeUi(ui: UiState, ws: Workspace): UiState {
  return ui.clientFilter && !ws.clients.some((c) => c.id === ui.clientFilter) ? { ...ui, clientFilter: null } : ui;
}

function loadInitial(): State {
  const stored = readStored();
  const browserLangs = typeof navigator !== "undefined" ? navigator.languages : undefined;
  let ui: UiState = { clientFilter: null, lang: detectLang(browserLangs) };
  try {
    const u = JSON.parse(localKeyValue.get(UI_KEY) ?? "null") as Partial<UiState> | null;
    if (u) ui = { clientFilter: typeof u.clientFilter === "string" ? u.clientFilter : null, lang: isLang(u.lang) ? u.lang : ui.lang };
  } catch {
    /* ignore unreadable UI prefs */
  }
  setCurrentLang(ui.lang);
  const ws = stored.ws ?? seedWorkspace();
  return { ws, ui: normalizeUi(ui, ws), toasts: [], loadWarning: stored.warning };
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
  const entry: Toast = { id: toastSeq++, kind, text };
  emit({ ...state, toasts: [...state.toasts, entry] });
  setTimeout(() => dismissToast(entry.id), kind === "error" ? 7000 : 3500);
}

export function dismissToast(id: number) {
  if (!state.toasts.some((x) => x.id === id)) return;
  emit({ ...state, toasts: state.toasts.filter((x) => x.id !== id) });
}

function ctx(): Ctx {
  return { now: new Date().toISOString(), actorId: state.ws.workspace.currentUserId, newId, describe: (p) => describeActivity(state.ui.lang, p) };
}

type CommitResult = "saved" | "memory-only" | "rejected";

function commit(ws: Workspace): CommitResult {
  const check = checkWorkspace(ws);
  if (!check.ok) {
    // Programming-error guard: never keep or persist data that violates the contract.
    console.error("Workspace rejected", check.errors);
    toast(t("toast.contractViolation", { detail: check.errors[0] ?? "" }), "error");
    return "rejected";
  }
  emit({ ...state, ws, ui: normalizeUi(state.ui, ws) });
  if (!repository.save(ws)) {
    toast(t("toast.storageFull"), "error");
    return "memory-only";
  }
  return "saved";
}

/** Run a workflow action. Returns the action's value, or undefined if it failed (error is toasted). */
export function run<T>(fn: (ws: Workspace, c: Ctx) => Result<T>, successText?: string): T | undefined;
export function run(fn: (ws: Workspace, c: Ctx) => Workspace, successText?: string): true | undefined;
export function run<T>(fn: (ws: Workspace, c: Ctx) => Workspace | Result<T>, successText?: string): T | true | undefined {
  try {
    const out = fn(state.ws, ctx());
    const isResult = (o: Workspace | Result<T>): o is Result<T> => "value" in o && "ws" in o && !("schemaVersion" in o);
    const result = commit(isResult(out) ? out.ws : out);
    if (result === "rejected") return undefined;
    if (successText && result === "saved") toast(successText, "success");
    return isResult(out) ? out.value : true;
  } catch (e) {
    if (e instanceof DomainError) toast(errorText(state.ui.lang, e), "error");
    else {
      console.error(e);
      toast(t("toast.unexpected", { detail: (e as Error).message }), "error");
    }
    return undefined;
  }
}

function saveUi(ui: UiState) {
  emit({ ...state, ui });
  localKeyValue.set(UI_KEY, JSON.stringify(ui));
}

export function setClientFilter(clientFilter: ID | null) {
  saveUi(normalizeUi({ ...state.ui, clientFilter }, state.ws));
}

export function setLang(lang: Lang) {
  setCurrentLang(lang);
  saveUi({ ...state.ui, lang });
}

/** Deletes binaries that no media record references any more (after import / delete). */
export async function collectMediaGarbage(): Promise<void> {
  try {
    const used = new Set(state.ws.media.flatMap((m) => (m.storageKey ? [m.storageKey] : [])));
    for (const key of await mediaStore.keys()) if (!used.has(key)) await mediaStore.remove(key);
  } catch {
    /* media storage unavailable – nothing to clean */
  }
}

/** Replaces the whole workspace with imported data. Returns the validation result. */
export function replaceWorkspace(data: unknown): Check {
  const check = checkWorkspace(data);
  if (check.ok && commit(check.ws) !== "rejected") void collectMediaGarbage();
  return check;
}

export async function resetDemo(): Promise<void> {
  try {
    await mediaStore.clear();
  } catch {
    /* storage unavailable – metadata reset still proceeds */
  }
  saveUi({ ...state.ui, clientFilter: null });
  commit(seedWorkspace());
  emit({ ...state, loadWarning: undefined });
}

export function clearLoadWarning() {
  emit({ ...state, loadWarning: undefined });
}

// Another tab changed the workspace: adopt it instead of silently overwriting it later.
repository.subscribe(() => {
  const stored = readStored();
  if (!stored.ws) return;
  emit({ ...state, ws: stored.ws, ui: normalizeUi(state.ui, stored.ws) });
  toast(t("toast.otherTab"), "info");
});
