import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calendar as CalIcon, LayoutList, Columns3 } from "lucide-react";
import { moveStage } from "../domain/actions";
import { STAGES, type Content, type Stage, type Workspace } from "../domain/types";
import { fmtShortIso } from "../domain/format";
import { isClientUser, memberById } from "../domain/selectors";
import { run } from "../store/store";
import { ContentRow, DueLabel, NewContentButton } from "../components/shared";
import { AvatarStack, Badge, ClientTag, Empty, PageHeader, useMe, useScoped, useT } from "../components/ui";

export function Pipeline() {
  const t = useT();
  const ws = useScoped();
  const me = useMe();
  const readOnly = isClientUser(me);
  const [params, setParams] = useSearchParams();
  const stageFilter = params.get("stage") as Stage | null;
  const [view, setView] = useState<"board" | "list">(stageFilter ? "list" : "board");
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  const contents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ws.contents
      .filter((c) => !needle || c.title.toLowerCase().includes(needle) || (c.pillar ?? "").toLowerCase().includes(needle))
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }, [ws, q]);

  const drop = (stage: Stage) => {
    if (dragId && !readOnly) {
      const c = ws.contents.find((x) => x.id === dragId);
      if (c && c.stage !== stage) run((w, ctx) => moveStage(w, ctx, dragId, stage), t("toast.movedTo", { stage: t(`stage.${stage}`) }));
    }
    setDragId(null);
    setOver(null);
  };

  return (
    <>
      <PageHeader
        title={t("nav.pipeline")}
        sub={t("pipeline.sub")}
        actions={
          <>
            <div className="row" role="group" aria-label={t("pipeline.view")}>
              <button className={`btn ${view === "board" ? "primary" : ""}`} onClick={() => setView("board")} aria-pressed={view === "board"}>
                <Columns3 size={16} /> {t("pipeline.board")}
              </button>
              <button className={`btn ${view === "list" ? "primary" : ""}`} onClick={() => setView("list")} aria-pressed={view === "list"}>
                <LayoutList size={16} /> {t("pipeline.list")}
              </button>
            </div>
            <NewContentButton />
          </>
        }
      />
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder={t("pipeline.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("pipeline.search")} />
        {view === "list" && (
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={stageFilter ?? ""}
            onChange={(e) => setParams(e.target.value ? { stage: e.target.value } : {})}
            aria-label={t("pipeline.filterStage")}
          >
            <option value="">{t("pipeline.allStages")}</option>
            {STAGES.map((s) => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}
          </select>
        )}
      </div>

      {view === "board" ? (
        <div className="kanban">
          {STAGES.map((stage) => {
            const items = contents.filter((c) => c.stage === stage);
            return (
              <section
                key={stage}
                className={`kanban-col ${over === stage ? "drop" : ""}`}
                onDragOver={(e) => {
                  if (readOnly) return;
                  e.preventDefault();
                  setOver(stage);
                }}
                onDragLeave={() => setOver((o) => (o === stage ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(stage);
                }}
                aria-label={t(`stage.${stage}`)}
              >
                <div className="kanban-col-head">
                  <span>{t(`stage.${stage}`)}</span>
                  <Badge>{items.length}</Badge>
                </div>
                {items.map((c) => (
                  <KanbanCard key={c.id} ws={ws} c={c} dragging={dragId === c.id} draggable={!readOnly} onDragStart={() => setDragId(c.id)} onDragEnd={() => { setDragId(null); setOver(null); }} />
                ))}
                {items.length === 0 && <div className="small muted" style={{ padding: "8px 4px" }}>{t("pipeline.empty")}</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card">
          {contents.filter((c) => !stageFilter || c.stage === stageFilter).length === 0 ? (
            <Empty title={t("pipeline.noResults")} />
          ) : (
            contents.filter((c) => !stageFilter || c.stage === stageFilter).map((c) => <ContentRow key={c.id} ws={ws} c={c} />)
          )}
        </div>
      )}
    </>
  );
}

function KanbanCard({ ws, c, dragging, draggable, onDragStart, onDragEnd }: { ws: Workspace; c: Content; dragging: boolean; draggable: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const t = useT();
  const client = ws.clients.find((x) => x.id === c.clientId);
  return (
    <Link
      to={`/content/${c.id}`}
      className={`kanban-card ${dragging ? "dragging" : ""}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", c.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <ClientTag client={client} />
      <div className="title">{c.title}</div>
      <div className="row small muted" style={{ gap: 6 }}>
        <Badge>{t(`format.${c.format}`)}</Badge>
        <span className="truncate">{c.platforms.map((p) => t(`platform.${p}`)).join(", ")}</span>
      </div>
      <div className="spread" style={{ marginTop: 8 }}>
        {c.publishAt ? (
          <span className="row small muted" style={{ gap: 4 }}><CalIcon size={13} /> {fmtShortIso(c.publishAt)}</span>
        ) : (
          <DueLabel date={c.dueDate} done={c.stage === "published"} />
        )}
        <AvatarStack members={c.assigneeIds.map((id) => memberById(ws, id))} />
      </div>
    </Link>
  );
}
