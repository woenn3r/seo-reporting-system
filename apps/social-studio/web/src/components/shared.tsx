import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createContent } from "../domain/actions";
import { STAGE_TONE } from "../domain/labels";
import { FORMATS, PLATFORMS, type Activity, type Content, type Format, type Platform, type Stage, type Workspace } from "../domain/types";
import { fmtRelative, fmtShortDate } from "../i18n/format";
import { isClientUser, memberById, todayISO } from "../domain/selectors";
import { activityText } from "../i18n/activity";
import { run, setClientFilter, useStore } from "../store/store";
import { Avatar, AvatarStack, Badge, ChipToggle, ClientTag, Field, FieldGroup, Modal, useLang, useMe, useT } from "./ui";

export function StageBadge({ stage }: { stage: Stage }) {
  const t = useT();
  return <Badge tone={STAGE_TONE[stage]}>{t(`stage.${stage}`)}</Badge>;
}

export function DueLabel({ date, done }: { date?: string; done?: boolean }) {
  const t = useT();
  if (!date) return null;
  const overdue = !done && date < todayISO();
  return (
    <span className="small" style={{ color: overdue ? "var(--danger)" : "var(--text-3)", fontWeight: overdue ? 600 : 400 }}>
      {t(overdue ? "due.overdue" : "due.due", { date: fmtShortDate(date) })}
    </span>
  );
}

export function ContentRow({ ws, c, extra }: { ws: Workspace; c: Content; extra?: ReactNode }) {
  const t = useT();
  const client = ws.clients.find((x) => x.id === c.clientId);
  return (
    <Link to={`/content/${c.id}`} className="list-item">
      <span className="dot" style={{ background: client?.color }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="truncate" style={{ fontWeight: 550 }}>{c.title}</div>
        <div className="row small muted" style={{ gap: 6 }}>
          <span>{client?.name}</span>·<span>{t(`format.${c.format}`)}</span>
          {c.dueDate && <>· <DueLabel date={c.dueDate} done={c.stage === "published"} /></>}
        </div>
      </div>
      {extra ?? <StageBadge stage={c.stage} />}
      <AvatarStack members={c.assigneeIds.map((id) => memberById(ws, id))} />
    </Link>
  );
}

export function ActivityFeed({ ws, items, limit = 8 }: { ws: Workspace; items: Activity[]; limit?: number }) {
  const t = useT();
  const lang = useLang();
  const list = [...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  if (list.length === 0) return <div className="empty">{t("feed.empty")}</div>;
  return (
    <div>
      {list.map((a) => {
        const actor = memberById(ws, a.actorId);
        return (
          <div key={a.id} className="list-item" style={{ alignItems: "flex-start" }}>
            <Avatar member={actor} />
            <div style={{ minWidth: 0 }}>
              <div>{actorSentence(t("feed.entry"), actor?.name ?? t("common.someone"), activityText(lang, a))}</div>
              <div className="small muted">{fmtRelative(a.at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renders the "{actor} {text}" pattern with the actor in bold; word order comes from the dictionary. */
function actorSentence(pattern: string, actor: string, text: string): ReactNode {
  const [before, after = ""] = pattern.split("{actor}");
  return (
    <>
      {(before ?? "").replace("{text}", text)}
      <strong>{actor}</strong>
      {after.replace("{text}", text)}
    </>
  );
}

export function NewContentModal({ open, onClose, defaultClientId }: { open: boolean; onClose: () => void; defaultClientId?: string }) {
  const t = useT();
  const ws = useStore((s) => s.ws);
  const filter = useStore((s) => s.ui.clientFilter);
  const navigate = useNavigate();
  const clients = ws.clients.filter((c) => c.active);
  const preferred = defaultClientId ?? filter;
  const [clientId, setClientId] = useState(clients.some((c) => c.id === preferred) ? preferred! : clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Format>("reel");
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram"]);
  const [pillar, setPillar] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [brief, setBrief] = useState("");
  const [assignees, setAssignees] = useState<string[]>([ws.workspace.currentUserId]);
  const client = ws.clients.find((c) => c.id === clientId);
  const agency = ws.team.filter((m) => m.role !== "client");
  const platformLabels = Object.fromEntries(PLATFORMS.map((p) => [p, t(`platform.${p}`)])) as Record<Platform, string>;

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
      t("toast.contentCreated"),
    );
    if (id) {
      onClose();
      setTitle("");
      setBrief("");
      if (filter && filter !== clientId) setClientFilter(clientId); // keep the new record visible
      navigate(`/content/${id}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("content.new")}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn primary" type="submit" form="new-content">{t("common.create")}</button>
        </>
      }
    >
      <form id="new-content" className="form-grid" onSubmit={submit}>
        <Field label={t("content.title")} full>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus placeholder={t("content.titlePlaceholder")} />
        </Field>
        <Field label={t("content.client")}>
          <select className="select" value={clientId} onChange={(e) => { setClientId(e.target.value); setPillar(""); }} required>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t("content.format")}>
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {FORMATS.map((f) => <option key={f} value={f}>{t(`format.${f}`)}</option>)}
          </select>
        </Field>
        <FieldGroup label={t("content.platforms")} full>
          <ChipToggle options={PLATFORMS} value={platforms} onChange={setPlatforms} labels={platformLabels} />
        </FieldGroup>
        <Field label={t("content.pillar")}>
          <select className="select" value={pillar} onChange={(e) => setPillar(e.target.value)}>
            <option value="">–</option>
            {(client?.pillars ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label={t("content.dueDate")}>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <FieldGroup label={t("content.assignees")} full>
          <ChipToggle
            options={agency.map((m) => m.id)}
            value={assignees}
            onChange={setAssignees}
            labels={Object.fromEntries(agency.map((m) => [m.id, m.name]))}
          />
        </FieldGroup>
        <Field label={t("content.brief")} full>
          <textarea className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t("content.briefPlaceholder")} />
        </Field>
      </form>
    </Modal>
  );
}

/** Button that opens the new-content modal – hidden for client users. */
export function NewContentButton({ className = "btn primary", defaultClientId }: { className?: string; defaultClientId?: string }) {
  const t = useT();
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (isClientUser(me)) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>+ {t("content.new")}</button>
      {open && <NewContentModal open={open} onClose={() => setOpen(false)} defaultClientId={defaultClientId} />}
    </>
  );
}

export { ClientTag };
