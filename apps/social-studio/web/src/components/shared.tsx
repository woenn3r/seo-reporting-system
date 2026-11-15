import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createContent } from "../domain/actions";
import { FORMAT_LABEL, PLATFORM_LABEL, STAGE_LABEL, STAGE_TONE } from "../domain/labels";
import { FORMATS, PLATFORMS, type Activity, type Content, type Format, type Platform, type Stage, type Workspace } from "../domain/types";
import { fmtRelative, fmtShortDate } from "../domain/format";
import { isClientUser, memberById, todayISO } from "../domain/selectors";
import { run, useStore } from "../store/store";
import { Avatar, AvatarStack, Badge, ChipToggle, ClientTag, Field, Modal, useMe } from "./ui";

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
}

export function DueLabel({ date, done }: { date?: string; done?: boolean }) {
  if (!date) return null;
  const today = todayISO();
  const overdue = !done && date < today;
  return (
    <span className="small" style={{ color: overdue ? "var(--danger)" : "var(--text-3)", fontWeight: overdue ? 600 : 400 }}>
      {overdue ? "Überfällig · " : "Fällig "}
      {fmtShortDate(date)}
    </span>
  );
}

export function ContentRow({ ws, c, extra }: { ws: Workspace; c: Content; extra?: ReactNode }) {
  const client = ws.clients.find((x) => x.id === c.clientId);
  return (
    <Link to={`/content/${c.id}`} className="list-item">
      <span className="dot" style={{ background: client?.color }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="truncate" style={{ fontWeight: 550 }}>{c.title}</div>
        <div className="row small muted" style={{ gap: 6 }}>
          <span>{client?.name}</span>·<span>{FORMAT_LABEL[c.format]}</span>
          {c.dueDate && <>· <DueLabel date={c.dueDate} done={c.stage === "published"} /></>}
        </div>
      </div>
      {extra ?? <StageBadge stage={c.stage} />}
      <AvatarStack members={c.assigneeIds.map((id) => memberById(ws, id))} />
    </Link>
  );
}

export function ActivityFeed({ ws, items, limit = 8 }: { ws: Workspace; items: Activity[]; limit?: number }) {
  const list = [...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  if (list.length === 0) return <div className="empty">Noch keine Aktivität.</div>;
  return (
    <div>
      {list.map((a) => {
        const actor = memberById(ws, a.actorId);
        return (
          <div key={a.id} className="list-item" style={{ alignItems: "flex-start" }}>
            <Avatar member={actor} />
            <div style={{ minWidth: 0 }}>
              <div>
                <strong>{actor?.name ?? "Jemand"}</strong> {a.message}
              </div>
              <div className="small muted">{fmtRelative(a.at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NewContentModal({ open, onClose, defaultClientId }: { open: boolean; onClose: () => void; defaultClientId?: string }) {
  const ws = useStore((s) => s.ws);
  const filter = useStore((s) => s.ui.clientFilter);
  const navigate = useNavigate();
  const clients = ws.clients.filter((c) => c.active);
  const [clientId, setClientId] = useState(defaultClientId ?? filter ?? clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Format>("reel");
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"]);
  const [pillar, setPillar] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [brief, setBrief] = useState("");
  const [assignees, setAssignees] = useState<string[]>([ws.workspace.currentUserId]);
  const client = ws.clients.find((c) => c.id === clientId);
  const agency = ws.team.filter((m) => m.role !== "client");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = run(
      (w, c) =>
        createContent(w, c, {
          clientId,
          title,
          format,
          platforms,
          pillar: pillar || undefined,
          brief: brief || undefined,
          dueDate: dueDate || undefined,
          assigneeIds: assignees.filter((a) => agency.some((m) => m.id === a)),
        }),
      "Content angelegt",
    );
    if (id) {
      onClose();
      setTitle("");
      setBrief("");
      navigate(`/content/${id}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Neuer Content"
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn primary" type="submit" form="new-content">Anlegen</button>
        </>
      }
    >
      <form id="new-content" className="form-grid" onSubmit={submit}>
        <Field label="Titel" full>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder="z. B. 3 Fehler bei der Kniebeuge" />
        </Field>
        <Field label="Kunde">
          <select className="select" value={clientId} onChange={(e) => { setClientId(e.target.value); setPillar(""); }} required>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Format">
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
        </Field>
        <Field label="Plattformen" full>
          <ChipToggle options={PLATFORMS} value={platforms} onChange={setPlatforms} labels={PLATFORM_LABEL} />
        </Field>
        <Field label="Content-Säule">
          <select className="select" value={pillar} onChange={(e) => setPillar(e.target.value)}>
            <option value="">–</option>
            {(client?.pillars ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Fällig am">
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Zuständig" full>
          <ChipToggle
            options={agency.map((m) => m.id)}
            value={assignees}
            onChange={setAssignees}
            labels={Object.fromEntries(agency.map((m) => [m.id, m.name]))}
          />
        </Field>
        <Field label="Briefing" full>
          <textarea className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Idee, Ziel, Referenzen …" />
        </Field>
      </form>
    </Modal>
  );
}

/** Button that opens the new-content modal – hidden for client users. */
export function NewContentButton({ className = "btn primary", label = "Neuer Content", defaultClientId }: { className?: string; label?: string; defaultClientId?: string }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (isClientUser(me)) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>+ {label}</button>
      {open && <NewContentModal open={open} onClose={() => setOpen(false)} defaultClientId={defaultClientId} />}
    </>
  );
}

export { ClientTag };
