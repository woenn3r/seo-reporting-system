import { Component, useEffect, useMemo, useRef, type ErrorInfo, type ReactNode } from "react";
import { X } from "lucide-react";
import { initials } from "../i18n/format";
import type { Tone } from "../domain/labels";
import { currentUser, scopedWorkspace } from "../domain/selectors";
import { can, type Permission } from "../domain/permissions";
import type { Client, TeamMember } from "../domain/types";
import { useStore } from "../store/store";
import { translate, type Params, type TKey, type Lang } from "../i18n";

// ---------- hooks ----------

export function useWs() {
  return useStore((s) => s.ws);
}

/** Workspace filtered by role + sidebar client filter. Memoized → stable reference for rendering. */
export function useScoped() {
  const ws = useStore((s) => s.ws);
  const filter = useStore((s) => s.ui.clientFilter);
  return useMemo(() => scopedWorkspace(ws, filter), [ws, filter]);
}

/** Translation function bound to the current UI language; components re-render on language change. */
export function useT(): (key: TKey, params?: Params) => string {
  const lang = useStore((s) => s.ui.lang);
  return useMemo(() => (key: TKey, params?: Params) => translate(lang, key, params), [lang]);
}

export function useLang(): Lang {
  return useStore((s) => s.ui.lang);
}

export function useMe(): TeamMember {
  const ws = useStore((s) => s.ws);
  return currentUser(ws);
}

/** May the current user do this? Same matrix the domain actions enforce (domain/permissions.ts). */
export function useCan(permission: Permission, clientId?: string): boolean {
  return can(useMe(), permission, clientId);
}

// ---------- unsaved-changes guard ----------
// Forms register while dirty; navigation inside the app asks before discarding.

const dirtyForms = new Set<symbol>();
export const hasUnsavedChanges = (): boolean => dirtyForms.size > 0;

export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const token = Symbol("dirty-form");
    dirtyForms.add(token);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      dirtyForms.delete(token);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}

// ---------- primitives ----------

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

const AVATAR_COLORS = ["#4f46e5", "#0ca678", "#e8590c", "#1c7ed6", "#c2255c", "#7048e8", "#2b8a3e", "#f08c00"];
function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function Avatar({ member, size }: { member: TeamMember | undefined; size?: "lg" }) {
  const t = useT();
  if (!member) return <span className={`avatar ${size ?? ""}`} aria-label={t("common.unknown")}>?</span>;
  return (
    <span className={`avatar ${size ?? ""}`} style={{ background: colorFor(member.id) }} title={member.name} aria-label={member.name}>
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members }: { members: (TeamMember | undefined)[] }) {
  const list = members.filter(Boolean) as TeamMember[];
  if (list.length === 0) return <span className="muted small">–</span>;
  return (
    <span className="avatar-stack">
      {list.map((m) => (
        <Avatar key={m.id} member={m} />
      ))}
    </span>
  );
}

export function ClientTag({ client }: { client: Client | undefined }) {
  if (!client) return null;
  return (
    <span className="row small" style={{ gap: 6, flexWrap: "nowrap" }}>
      <span className="dot" style={{ background: client.color }} />
      <span className="truncate">{client.name}</span>
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <strong style={{ color: "var(--text-2)" }}>{title}</strong>
      {children}
    </div>
  );
}

export function Progress({ value, total, label }: { value: number; total: number; label?: string }) {
  const t = useT();
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="stack" style={{ gap: 4 }}>
      {label !== undefined && (
        <div className="spread small">
          <span className="muted">{label}</span>
          <span className="mono">
            {value}/{total}
          </span>
        </div>
      )}
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? t("common.progress")}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" className="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Labelled group for several controls (chips, checklists). Not a <label>: a label would forward
 * clicks on its text/whitespace to the first button inside.
 */
export function FieldGroup({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? "full" : ""}`} role="group" aria-label={label}>
      <span>
        {label} {hint && <span className="hint">· {hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** Label + exactly one form control. For groups of controls use FieldGroup. */
export function Field({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label} {hint && <span className="hint">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first focusable element (the close button); move focus to the intended field
      d.querySelector<HTMLElement>("[autofocus], .modal-body input, .modal-body textarea, .modal-body select")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="btn ghost icon" onClick={onClose} aria-label={t("common.close")}>
              <X size={18} />
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function ChipToggle<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            className="chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
          >
            {labels[o]}
          </button>
        );
      })}
    </div>
  );
}

/** Last line of defence: a render error must never leave the user with a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback: (reset: () => void, error: Error) => ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error", error, info.componentStack);
  }
  render() {
    return this.state.error ? this.props.fallback(() => this.setState({ error: null }), this.state.error) : this.props.children;
  }
}
