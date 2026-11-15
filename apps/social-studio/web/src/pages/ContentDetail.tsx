import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clapperboard, Rocket, Trash2 } from "lucide-react";
import { currentScript, deleteContent, mediaFor, moveStage, shotsFor, updateContent, type ContentPatch } from "../domain/actions";
import { FORMAT_LABEL, PLATFORM_LABEL, SCRIPT_STATUS_LABEL, SCRIPT_STATUS_TONE, STAGE_LABEL } from "../domain/labels";
import { FORMATS, PLATFORMS, STAGES, type Content, type Format, type Platform, type Stage } from "../domain/types";
import { fmtDate, isoToLocalInput, localInputToIso } from "../domain/format";
import { isClientUser, memberById } from "../domain/selectors";
import { mediaStore } from "../store/mediaStore";
import { run } from "../store/store";
import { ActivityFeed, StageBadge } from "../components/shared";
import { ScriptEditor } from "../components/ScriptEditor";
import { ShotList } from "../components/ShotList";
import { MediaPanel } from "../components/MediaPanel";
import { AvatarStack, Badge, ChipToggle, ClientTag, Empty, Field, Progress, Tabs, useMe, useScoped } from "../components/ui";

type Tab = "overview" | "script" | "shots" | "media" | "activity";

export function ContentDetail() {
  const { id = "" } = useParams();
  const ws = useScoped();
  const me = useMe();
  const client = isClientUser(me);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "overview";
  const content = ws.contents.find((c) => c.id === id);

  if (!content) {
    return (
      <Empty title="Content nicht gefunden">
        <Link className="btn" to="/pipeline">Zur Pipeline</Link>
      </Empty>
    );
  }

  const cl = ws.clients.find((c) => c.id === content.clientId);
  const script = currentScript(ws, content.id);
  const shots = shotsFor(ws, content.id);
  const media = mediaFor(ws, content.id);
  const relatedActivity = ws.activity.filter(
    (a) =>
      (a.targetType === "content" && a.targetId === content.id) ||
      (a.targetType === "script" && ws.scripts.some((s) => s.id === a.targetId && s.contentId === content.id)) ||
      (a.targetType === "media" && media.some((m) => m.id === a.targetId)),
  );

  const remove = async () => {
    if (!confirm(`„${content.title}“ inkl. Skript, Shots und Dateien löschen?`)) return;
    const keys = run((w, c) => deleteContent(w, c, content.id), "Content gelöscht");
    if (keys) {
      await Promise.all(keys.map((k) => mediaStore.remove(k).catch(() => undefined)));
      navigate("/pipeline");
    }
  };

  return (
    <>
      <Link to="/pipeline" className="row small muted no-print" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> Pipeline
      </Link>
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <ClientTag client={cl} />
          <h1 style={{ marginTop: 4 }}>{content.title}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <StageBadge stage={content.stage} />
            <Badge>{FORMAT_LABEL[content.format]}</Badge>
            {content.platforms.map((p) => <Badge key={p}>{PLATFORM_LABEL[p]}</Badge>)}
            {content.pillar && <Badge tone="accent">{content.pillar}</Badge>}
          </div>
        </div>
        {!client && (
          <div className="page-actions">
            <select
              className="select"
              style={{ width: "auto" }}
              value={content.stage}
              onChange={(e) => run((w, c) => moveStage(w, c, content.id, e.target.value as Stage), "Phase geändert")}
              aria-label="Phase ändern"
            >
              {STAGES.map((s) => <option key={s} value={s}>Phase: {STAGE_LABEL[s]}</option>)}
            </select>
            {content.stage === "scheduled" && (
              <button className="btn success" onClick={() => run((w, c) => moveStage(w, c, content.id, "published"), "Als veröffentlicht markiert")}>
                <Rocket size={15} /> Veröffentlicht
              </button>
            )}
            <button className="btn ghost icon danger" onClick={() => void remove()} aria-label="Content löschen">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams(t === "overview" ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: "overview", label: "Überblick" },
          { id: "script", label: <>Skript {script && <Badge tone={SCRIPT_STATUS_TONE[script.status]}>v{script.version}</Badge>}</> },
          { id: "shots", label: <>Shotliste <span className="muted">{shots.filter((s) => s.done).length}/{shots.length}</span></> },
          { id: "media", label: <>Medien <span className="muted">{media.length}</span></> },
          { id: "activity", label: "Aktivität" },
        ]}
      />

      {tab === "overview" && <Overview content={content} readOnly={client} />}
      {tab === "script" && <ScriptEditor contentId={content.id} />}
      {tab === "shots" && <ShotList contentId={content.id} />}
      {tab === "media" && <MediaPanel contentId={content.id} />}
      {tab === "activity" && (
        <div className="card">
          <ActivityFeed ws={ws} items={relatedActivity} limit={50} />
        </div>
      )}
    </>
  );
}

function Overview({ content, readOnly }: { content: Content; readOnly: boolean }) {
  const ws = useScoped();
  const cl = ws.clients.find((c) => c.id === content.clientId);
  const script = currentScript(ws, content.id);
  const shots = shotsFor(ws, content.id);
  const media = mediaFor(ws, content.id);
  const shoot = ws.shoots.find((s) => s.id === content.shootId);
  const pillars = cl?.pillars ?? [];
  const agency = ws.team.filter((m) => m.role !== "client");
  const initial = useMemo(
    () => ({
      title: content.title,
      format: content.format,
      platforms: content.platforms,
      pillar: content.pillar ?? "",
      brief: content.brief ?? "",
      dueDate: content.dueDate ?? "",
      publishAt: isoToLocalInput(content.publishAt),
      assigneeIds: content.assigneeIds,
    }),
    [content],
  );
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const save = () => {
    const patch: ContentPatch = {
      title: f.title,
      format: f.format,
      platforms: f.platforms,
      pillar: f.pillar,
      brief: f.brief,
      dueDate: f.dueDate,
      publishAt: localInputToIso(f.publishAt) ?? "",
      assigneeIds: f.assigneeIds,
    };
    run((w, c) => updateContent(w, c, content.id, patch), "Gespeichert");
  };

  return (
    <div className="grid grid-main">
      <div className="card card-pad">
        {readOnly ? (
          <div className="stack">
            <Field label="Briefing"><div className="readonly-block">{content.brief || "–"}</div></Field>
            <Field label="Geplante Veröffentlichung"><div>{content.publishAt ? new Date(content.publishAt).toLocaleString("de-DE") : "–"}</div></Field>
          </div>
        ) : (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Titel" full>
              <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
            </Field>
            <Field label="Format">
              <select className="select" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as Format })}>
                {FORMATS.map((x) => <option key={x} value={x}>{FORMAT_LABEL[x]}</option>)}
              </select>
            </Field>
            <Field label="Content-Säule">
              <select className="select" value={f.pillar} onChange={(e) => setF({ ...f, pillar: e.target.value })}>
                <option value="">–</option>
                {[...new Set([...pillars, ...(f.pillar ? [f.pillar] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Plattformen" full>
              <ChipToggle<Platform> options={PLATFORMS} value={f.platforms} onChange={(v) => setF({ ...f, platforms: v })} labels={PLATFORM_LABEL} />
            </Field>
            <Field label="Fällig am">
              <input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
            </Field>
            <Field label="Veröffentlichung geplant">
              <input className="input" type="datetime-local" value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} />
            </Field>
            <Field label="Zuständig" full>
              <ChipToggle options={agency.map((m) => m.id)} value={f.assigneeIds} onChange={(v) => setF({ ...f, assigneeIds: v })} labels={Object.fromEntries(agency.map((m) => [m.id, m.name]))} />
            </Field>
            <Field label="Briefing" full>
              <textarea className="textarea" rows={5} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} />
            </Field>
            <div className="full row">
              <button className="btn primary" type="submit" disabled={!dirty}>Speichern</button>
              {dirty && <button className="btn ghost" type="button" onClick={() => setF(initial)}>Verwerfen</button>}
            </div>
          </form>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Status</h2></div>
          <div className="card-body stack">
            <div className="spread"><span className="muted">Skript</span>{script ? <Badge tone={SCRIPT_STATUS_TONE[script.status]}>{SCRIPT_STATUS_LABEL[script.status]} · v{script.version}</Badge> : <span className="muted">–</span>}</div>
            <Progress value={shots.filter((s) => s.done).length} total={shots.length} label="Shots abgedreht" />
            <div className="spread"><span className="muted">Dateien</span><span>{media.length}</span></div>
            <div className="spread"><span className="muted">Team</span><AvatarStack members={content.assigneeIds.map((i) => memberById(ws, i))} /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Dreh</h2></div>
          {shoot ? (
            <Link to={`/shoots/${shoot.id}`} className="list-item">
              <Clapperboard size={18} />
              <div>
                <div style={{ fontWeight: 550 }}>{shoot.title}</div>
                <div className="small muted">{fmtDate(shoot.date)} · {shoot.startTime}–{shoot.endTime} · {shoot.location.name}</div>
              </div>
            </Link>
          ) : (
            <div className="card-body small muted">Noch keinem Dreh zugeordnet. {!readOnly && <Link to="/shoots" style={{ color: "var(--accent-text)" }}>Dreh planen →</Link>}</div>
          )}
        </div>
      </div>
    </div>
  );
}
