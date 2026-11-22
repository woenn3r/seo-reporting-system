import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clapperboard, Rocket, Trash2 } from "lucide-react";
import { currentScript, deleteContent, mediaFor, moveStage, shotsFor, updateContent, type ContentPatch } from "../domain/actions";
import { SCRIPT_STATUS_TONE } from "../domain/labels";
import { FORMATS, PLATFORMS, STAGES, type Content, type Format, type Platform, type Stage } from "../domain/types";
import { fmtDate, fmtDateTime, isoToLocalInput, localInputToIso } from "../i18n/format";
import { isClientUser, memberById } from "../domain/selectors";
import { mediaStore } from "../store/mediaStore";
import { run } from "../store/store";
import { ActivityFeed, StageBadge } from "../components/shared";
import { ScriptEditor } from "../components/ScriptEditor";
import { ShotList } from "../components/ShotList";
import { MediaPanel } from "../components/MediaPanel";
import { AvatarStack, Badge, ChipToggle, ClientTag, Empty, Field, Progress, Tabs, FieldGroup, hasUnsavedChanges, useCan, useMe, useScoped, useT, useUnsavedGuard } from "../components/ui";

type Tab = "overview" | "script" | "shots" | "media" | "activity";

export function ContentDetail() {
  const { id = "" } = useParams();
  const t = useT();
  const ws = useScoped();
  const me = useMe();
  const client = isClientUser(me);
  const canManage = useCan("content.manage");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const TABS: Tab[] = ["overview", "script", "shots", "media", "activity"];
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";
  const content = ws.contents.find((c) => c.id === id);

  if (!content) {
    return (
      <Empty title={t("content.notFound")}>
        <Link className="btn" to="/pipeline">{t("content.toPipeline")}</Link>
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
    if (!confirm(t("content.confirmDelete", { title: content.title }))) return;
    const keys = run((w, c) => deleteContent(w, c, content.id), t("toast.contentDeleted"));
    if (keys) {
      await Promise.all(keys.map((k) => mediaStore.remove(k).catch(() => undefined)));
      navigate("/pipeline");
    }
  };

  return (
    <>
      <Link to="/pipeline" className="row small muted no-print" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> {t("nav.pipeline")}
      </Link>
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <ClientTag client={cl} />
          <h1 style={{ marginTop: 4 }}>{content.title}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <StageBadge stage={content.stage} />
            <Badge>{t(`format.${content.format}`)}</Badge>
            {content.platforms.map((p) => <Badge key={p}>{t(`platform.${p}`)}</Badge>)}
            {content.pillar && <Badge tone="accent">{content.pillar}</Badge>}
          </div>
        </div>
        {canManage && (
          <div className="page-actions">
            <select
              className="select"
              style={{ width: "auto" }}
              value={content.stage}
              onChange={(e) => run((w, c) => moveStage(w, c, content.id, e.target.value as Stage), t("toast.stageChanged"))}
              aria-label={t("content.changeStage")}
            >
              {STAGES.map((s) => <option key={s} value={s}>{t("content.stageOption", { stage: t(`stage.${s}`) })}</option>)}
            </select>
            {content.stage === "scheduled" && (
              <button className="btn success" onClick={() => run((w, c) => moveStage(w, c, content.id, "published"), t("toast.markedPublished"))}>
                <Rocket size={15} /> {t("content.markPublished")}
              </button>
            )}
            <button className="btn ghost icon danger" onClick={() => void remove()} aria-label={t("content.delete")}>
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={(next) => {
          if (hasUnsavedChanges() && !confirm(t("common.unsaved"))) return;
          setParams(next === "overview" ? {} : { tab: next }, { replace: true });
        }}
        tabs={[
          { id: "overview", label: t("content.tabOverview") },
          { id: "script", label: <>{t("content.tabScript")} {script && <Badge tone={SCRIPT_STATUS_TONE[script.status]}>v{script.version}</Badge>}</> },
          { id: "shots", label: <>{t("content.tabShots")} <span className="muted">{shots.filter((s) => s.done).length}/{shots.length}</span></> },
          { id: "media", label: <>{t("content.tabMedia")} <span className="muted">{media.length}</span></> },
          { id: "activity", label: t("content.tabActivity") },
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
  const t = useT();
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
  // Adopt changes made elsewhere (stage moved, shoot linked …) without throwing away what the user is typing.
  const base = useRef(initial);
  useEffect(() => {
    const previous = JSON.stringify(base.current);
    base.current = initial;
    setF((current) => (JSON.stringify(current) === previous ? initial : current));
  }, [initial]);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  useUnsavedGuard(dirty && !readOnly);

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
    run((w, c) => updateContent(w, c, content.id, patch), t("toast.saved"));
  };

  return (
    <div className="grid grid-main">
      <div className="card card-pad">
        {readOnly ? (
          <div className="stack">
            <Field label={t("content.brief")}><div className="readonly-block">{content.brief || "–"}</div></Field>
            <Field label={t("content.publishAt")}><div>{content.publishAt ? fmtDateTime(content.publishAt) : "–"}</div></Field>
          </div>
        ) : (
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label={t("content.title")} full>
              <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
            </Field>
            <Field label={t("content.format")}>
              <select className="select" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as Format })}>
                {FORMATS.map((x) => <option key={x} value={x}>{t(`format.${x}`)}</option>)}
              </select>
            </Field>
            <Field label={t("content.pillar")}>
              <select className="select" value={f.pillar} onChange={(e) => setF({ ...f, pillar: e.target.value })}>
                <option value="">–</option>
                {[...new Set([...pillars, ...(f.pillar ? [f.pillar] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <FieldGroup label={t("content.platforms")} full>
              <ChipToggle<Platform> options={PLATFORMS} value={f.platforms} onChange={(v) => setF({ ...f, platforms: v })} labels={Object.fromEntries(PLATFORMS.map((p) => [p, t(`platform.${p}`)])) as Record<Platform, string>} />
            </FieldGroup>
            <Field label={t("content.dueDate")}>
              <input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
            </Field>
            <Field label={t("content.publishAt")}>
              <input className="input" type="datetime-local" value={f.publishAt} onChange={(e) => setF({ ...f, publishAt: e.target.value })} />
            </Field>
            <FieldGroup label={t("content.assignees")} full>
              <ChipToggle options={agency.map((m) => m.id)} value={f.assigneeIds} onChange={(v) => setF({ ...f, assigneeIds: v })} labels={Object.fromEntries(agency.map((m) => [m.id, m.name]))} />
            </FieldGroup>
            <Field label={t("content.brief")} full>
              <textarea className="textarea" rows={5} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} />
            </Field>
            <div className="full row">
              <button className="btn primary" type="submit" disabled={!dirty}>{t("common.save")}</button>
              {dirty && <button className="btn ghost" type="button" onClick={() => setF(initial)}>{t("common.discard")}</button>}
            </div>
          </form>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><h2>{t("content.status")}</h2></div>
          <div className="card-body stack">
            <div className="spread"><span className="muted">{t("content.tabScript")}</span>{script ? <Badge tone={SCRIPT_STATUS_TONE[script.status]}>{t(`scriptStatus.${script.status}`)} · v{script.version}</Badge> : <span className="muted">–</span>}</div>
            <Progress value={shots.filter((s) => s.done).length} total={shots.length} label={t("shots.progress")} />
            <div className="spread"><span className="muted">{t("content.files")}</span><span>{media.length}</span></div>
            <div className="spread"><span className="muted">{t("nav.team")}</span><AvatarStack members={content.assigneeIds.map((i) => memberById(ws, i))} /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>{t("content.shoot")}</h2></div>
          {shoot ? (
            <Link to={`/shoots/${shoot.id}`} className="list-item">
              <Clapperboard size={18} />
              <div>
                <div style={{ fontWeight: 550 }}>{shoot.title}</div>
                <div className="small muted">{fmtDate(shoot.date)} · {shoot.startTime}–{shoot.endTime} · {shoot.location.name}</div>
              </div>
            </Link>
          ) : (
            <div className="card-body small muted">{t("content.noShoot")} {!readOnly && <Link to="/shoots" style={{ color: "var(--accent-text)" }}>{t("shoots.plan")} →</Link>}</div>
          )}
        </div>
      </div>
    </div>
  );
}
