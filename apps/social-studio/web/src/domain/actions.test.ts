import { describe, expect, it } from "vitest";
import seed from "@examples/social_studio/workspace.json";
import * as A from "./actions";
import { approvalInbox, scopedWorkspace } from "./selectors";
import { integrityErrors } from "./integrity";
import { PERMISSIONS, ROLE_PERMISSIONS, can } from "./permissions";
import type { Workspace } from "./types";
import { validateWorkspace } from "./validate";
import { describeActivity } from "../i18n/activity";

let seq = 0;
const ctx = (actorId = "u_lena"): A.Ctx => ({ now: "2026-11-15T10:00:00.000Z", actorId, newId: (p) => `${p}_t${++seq}`, describe: (p) => describeActivity("de", p) });
const fresh = (): Workspace => structuredClone(seed) as Workspace;
/** Every state an action produces must satisfy the contract AND referential integrity. */
const valid = (ws: Workspace) => {
  expect(validateWorkspace(ws).errors).toEqual([]);
  expect(integrityErrors(ws)).toEqual([]);
  return ws;
};
const errorKey = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    if (e instanceof A.DomainError) return e.key;
    throw e;
  }
  return undefined;
};
const content = (ws: Workspace, id: string) => ws.contents.find((c) => c.id === id)!;

describe("seed", () => {
  it("is contract-valid", () => valid(fresh()));
});

describe("script workflow", () => {
  it("create → submit → request changes → submit → approve moves stages per rules", () => {
    let ws = fresh();
    const { ws: w1, value: ctId } = A.createContent(ws, ctx(), { clientId: "c_puls", title: "Test", format: "reel", platforms: ["instagram"] });
    ws = valid(w1);
    expect(content(ws, ctId).stage).toBe("idea");

    const { ws: w2, value: scId } = A.createScript(ws, ctx(), ctId);
    ws = valid(w2);
    expect(content(ws, ctId).stage).toBe("script");
    ws = valid(A.updateScript(ws, ctx(), scId, { hook: "Hook!", hashtags: ["#ok"] }));

    ws = valid(A.submitScript(ws, ctx(), scId));
    expect(content(ws, ctId).stage).toBe("script_review");
    expect(approvalInbox(ws).some((i) => i.id === scId)).toBe(true);

    expect(() => A.requestScriptChanges(ws, ctx(), scId, "   ")).toThrow(A.DomainError);
    ws = valid(A.requestScriptChanges(ws, ctx("u_paul_puls"), scId, "Hook kürzer"));
    expect(content(ws, ctId).stage).toBe("script");
    expect(ws.scripts.find((s) => s.id === scId)!.reviewNote).toBe("Hook kürzer");

    ws = valid(A.submitScript(ws, ctx(), scId));
    ws = valid(A.approveScript(ws, ctx("u_paul_puls"), scId));
    expect(content(ws, ctId).stage).toBe("shoot");
    expect(ws.scripts.find((s) => s.id === scId)!.reviewNote).toBeUndefined();
    expect(() => A.updateScript(ws, ctx(), scId, { hook: "x" })).toThrow(A.DomainError);

    const { ws: w3, value: v2 } = A.newScriptVersion(ws, ctx(), scId);
    ws = valid(w3);
    expect(A.currentScript(ws, ctId)!.id).toBe(v2);
    expect(A.currentScript(ws, ctId)!.version).toBe(2);
    expect(A.currentScript(ws, ctId)!.status).toBe("draft");
    expect(() => A.newScriptVersion(ws, ctx(), scId)).toThrow(A.DomainError); // not the latest
  });

  it("approving never moves a content backwards", () => {
    let ws = fresh();
    // ct_winterkarte is in script_review; force it to "edit" manually, then approve script
    ws = A.moveStage(ws, ctx(), "ct_winterkarte", "edit");
    ws = valid(A.approveScript(ws, ctx(), "sc_winterkarte_v1"));
    expect(content(ws, "ct_winterkarte").stage).toBe("edit");
  });

  it("rejects invalid hashtags", () => {
    const ws = fresh();
    expect(() => A.updateScript(ws, ctx(), "sc_eiweiss_v1", { hashtags: ["ohneRaute"] })).toThrow(A.DomainError);
  });
});

describe("media workflow", () => {
  it("raw: upload → release for edit → start edit", () => {
    let ws = fresh();
    const { ws: w1, value: id } = A.addMedia(ws, ctx("u_jonas"), { contentId: "ct_latte_art", kind: "raw", fileName: "a.mp4", sizeBytes: 10 });
    ws = valid(w1);
    expect(ws.media.find((m) => m.id === id)!.status).toBe("uploaded");
    expect(() => A.startEdit(ws, ctx(), id)).toThrow(A.DomainError);
    ws = valid(A.releaseForEdit(ws, ctx(), id));
    expect(content(ws, "ct_latte_art").stage).toBe("edit");
    ws = valid(A.startEdit(ws, ctx("u_mira"), id));
    expect(ws.media.find((m) => m.id === id)!.status).toBe("in_edit");
  });

  it("cut: version increments, review, changes, approve", () => {
    let ws = fresh();
    const { ws: w1, value: v3 } = A.addMedia(ws, ctx("u_mira"), { contentId: "ct_kniebeuge", kind: "cut", fileName: "v3.mp4", durationSec: 30 });
    ws = valid(w1);
    expect(ws.media.find((m) => m.id === v3)!.version).toBe(3); // seed has cut v2
    const inbox = approvalInbox(ws).filter((i) => i.content.id === "ct_kniebeuge" && i.kind === "media");
    expect(inbox.map((i) => i.id)).toEqual([v3]); // only newest version
    ws = valid(A.requestMediaChanges(ws, ctx("u_paul_puls"), v3, "Musik leiser"));
    expect(content(ws, "ct_kniebeuge").stage).toBe("edit");
    expect(ws.media.find((m) => m.id === v3)!.comments.at(-1)!.text).toBe("Musik leiser");
    const { ws: w2, value: v4 } = A.addMedia(ws, ctx("u_mira"), { contentId: "ct_kniebeuge", kind: "cut", fileName: "v4.mp4" });
    ws = valid(w2);
    expect(content(ws, "ct_kniebeuge").stage).toBe("cut_review");
    ws = valid(A.approveMedia(ws, ctx("u_paul_puls"), v4));
    expect(content(ws, "ct_kniebeuge").stage).toBe("scheduled");
  });

  it("comments clamp timestamps to duration and can be resolved", () => {
    let ws = fresh();
    ws = valid(A.addComment(ws, ctx(), "m_kb_cut_v2", "Zu spät", 999));
    const c = ws.media.find((m) => m.id === "m_kb_cut_v2")!.comments.at(-1)!;
    expect(c.timestampSec).toBe(27);
    ws = valid(A.toggleCommentResolved(ws, ctx(), "m_kb_cut_v2", c.id));
    expect(ws.media.find((m) => m.id === "m_kb_cut_v2")!.comments.at(-1)!.resolved).toBe(true);
  });
});

describe("shoots & shots", () => {
  it("keeps content.shootId and shoot.contentIds consistent when moving content between shoots", () => {
    let ws = fresh();
    const base = ws.shoots.find((s) => s.id === "sh_morgenrot_nov")!;
    const { ws: w1, value: newShoot } = A.createShoot(ws, ctx(), { ...base, title: "Nachdreh", date: "2026-12-01", contentIds: ["ct_latte_art"], status: "planned" });
    ws = valid(w1);
    expect(content(ws, "ct_latte_art").shootId).toBe(newShoot);
    expect(ws.shoots.find((s) => s.id === "sh_morgenrot_nov")!.contentIds).toEqual(["ct_winterkarte"]);
    ws = valid(A.deleteShoot(ws, ctx(), newShoot));
    expect(content(ws, "ct_latte_art").shootId).toBeUndefined();
  });

  it("rejects contents of other clients and inverted times", () => {
    const ws = fresh();
    const base = ws.shoots.find((s) => s.id === "sh_morgenrot_nov")!;
    expect(() => A.createShoot(ws, ctx(), { ...base, contentIds: ["ct_kniebeuge"] })).toThrow(A.DomainError);
    expect(() => A.createShoot(ws, ctx(), { ...base, startTime: "12:00", endTime: "10:00" })).toThrow(A.DomainError);
  });

  it("shot add/move/delete keeps contiguous order", () => {
    let ws = fresh();
    const { ws: w1, value: id } = A.addShot(ws, ctx(), "ct_latte_art", { description: "Neu", framing: "wide", angle: "pov", movement: "handheld", aspectRatio: "9:16" });
    ws = valid(w1);
    ws = A.moveShot(ws, ctx(), id, -1);
    expect(A.shotsFor(ws, "ct_latte_art").map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(A.shotsFor(ws, "ct_latte_art")[4]!.id).toBe(id);
    ws = valid(A.deleteShot(ws, ctx(), "shot_la_1"));
    expect(A.shotsFor(ws, "ct_latte_art").map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("delete content", () => {
  it("cascades and returns storage keys, leaving a valid workspace", () => {
    let ws = fresh();
    const { ws: w1 } = A.addMedia(ws, ctx(), { contentId: "ct_latte_art", kind: "raw", fileName: "x.mp4", storageKey: "k1" });
    const { ws: w2, value: keys } = A.deleteContent(w1, ctx(), "ct_latte_art");
    ws = valid(w2);
    expect(keys).toEqual(["k1"]);
    expect(ws.shots.some((s) => s.contentId === "ct_latte_art")).toBe(false);
    expect(ws.shoots.find((s) => s.id === "sh_morgenrot_nov")!.contentIds).toEqual(["ct_winterkarte"]);
  });
});

describe("visibility", () => {
  it("client users only see their client, no raw media, no internal notes", () => {
    const ws = A.setCurrentUser(fresh(), "u_paul_puls");
    const scoped = scopedWorkspace(ws, null);
    expect(scoped.clients.map((c) => c.id)).toEqual(["c_puls"]);
    expect(scoped.clients[0]!.brandNotes).toBeUndefined();
    expect(scoped.media.some((m) => m.kind === "raw")).toBe(false);
    expect(scoped.contents.every((c) => c.clientId === "c_puls")).toBe(true);
    expect(scoped.shots.some((s) => s.notes)).toBe(false);
    // client filter from the sidebar must not widen a client user's scope
    expect(scopedWorkspace(ws, "c_morgenrot").clients.map((c) => c.id)).toEqual(["c_puls"]);
  });

  it("agency filter narrows to one client", () => {
    const scoped = scopedWorkspace(fresh(), "c_berger");
    expect(new Set(scoped.contents.map((c) => c.clientId))).toEqual(new Set(["c_berger"]));
    expect(scoped.media.some((m) => m.kind === "final")).toBe(true);
  });
});

describe("review fixes", () => {
  it("a script with an empty hook can be saved (hook is required by the contract, but may be empty)", () => {
    let ws = fresh();
    ws = valid(A.updateScript(ws, ctx(), "sc_eiweiss_v1", { hook: "", caption: "nur Caption", cta: "" }));
    const s = ws.scripts.find((x) => x.id === "sc_eiweiss_v1")!;
    expect(s.hook).toBe("");
    expect(s.caption).toBe("nur Caption");
    expect("cta" in s).toBe(false); // optional + empty → omitted
  });

  it("an empty script cannot be submitted", () => {
    let ws = fresh();
    ws = A.updateScript(ws, ctx(), "sc_eiweiss_v1", { hook: "", scenes: [{ id: "s1", title: "Hook" }] });
    expect(errorKey(() => A.submitScript(ws, ctx(), "sc_eiweiss_v1"))).toBe("error.scriptEmpty");
  });

  it("texts are stored trimmed", () => {
    let ws = fresh();
    ws = valid(A.updateContent(ws, ctx(), "ct_latte_art", { title: "  Neu  ", brief: "   " }));
    expect(content(ws, "ct_latte_art").title).toBe("Neu");
    expect("brief" in content(ws, "ct_latte_art")).toBe(false);
  });

  it("removing a scene clears shot references to it", () => {
    let ws = fresh();
    const { ws: w1, value: v3 } = A.newScriptVersion(ws, ctx(), "sc_latte_art_v2");
    const scenes = w1.scripts.find((s) => s.id === v3)!.scenes.filter((s) => s.id !== "s3");
    ws = valid(A.updateScript(w1, ctx(), v3, { scenes }));
    expect(ws.shots.find((s) => s.id === "shot_la_3")!.sceneId).toBeUndefined();
    expect(ws.shots.find((s) => s.id === "shot_la_2")!.sceneId).toBe("s2");
  });

  it("a new version of a script in review takes the content out of the approval stage", () => {
    let ws = fresh();
    const { ws: w1 } = A.newScriptVersion(ws, ctx(), "sc_winterkarte_v1");
    ws = valid(w1);
    expect(content(ws, "ct_winterkarte").stage).toBe("script");
    expect(approvalInbox(ws).some((i) => i.content.id === "ct_winterkarte")).toBe(false);
  });

  it("only the newest cut can be approved or rejected", () => {
    let ws = fresh();
    const { ws: w1 } = A.addMedia(ws, ctx("u_mira"), { contentId: "ct_kniebeuge", kind: "cut", fileName: "v3.mp4" });
    ws = valid(w1);
    expect(errorKey(() => A.approveMedia(ws, ctx(), "m_kb_cut_v2"))).toBe("error.notLatestVersion");
    expect(errorKey(() => A.requestMediaChanges(ws, ctx(), "m_kb_cut_v2", "x"))).toBe("error.notLatestVersion");
  });
});

describe("permissions are enforced by the domain, not only by the UI", () => {
  const client = "u_paul_puls"; // client user of c_puls
  it("client users cannot manage production data", () => {
    const ws = fresh();
    const denied: (() => unknown)[] = [
      () => A.createContent(ws, ctx(client), { clientId: "c_puls", title: "x", format: "reel", platforms: ["instagram"] }),
      () => A.updateContent(ws, ctx(client), "ct_kniebeuge", { title: "x" }),
      () => A.moveStage(ws, ctx(client), "ct_kniebeuge", "published"),
      () => A.deleteContent(ws, ctx(client), "ct_kniebeuge"),
      () => A.updateScript(ws, ctx(client), "sc_eiweiss_v1", { hook: "x" }),
      () => A.submitScript(ws, ctx(client), "sc_eiweiss_v1"),
      () => A.updateShot(ws, ctx(client), "shot_kb_1", { done: false }),
      () => A.addMedia(ws, ctx(client), { contentId: "ct_kniebeuge", kind: "cut", fileName: "x.mp4" }),
      () => A.releaseForEdit(ws, ctx(client), "m_member_raw"),
      () => A.deleteMedia(ws, ctx(client), "m_kb_cut_v2"),
      () => A.addComment(ws, ctx(client), "m_kb_raw", "raw footage is internal"),
      () => A.createClient(ws, ctx(client), { name: "x", color: "#000000", active: true }),
      () => A.addMember(ws, ctx(client), { name: "x", role: "editor" }),
      () => A.deleteShoot(ws, ctx(client), "sh_puls_okt"),
    ];
    for (const [i, fn] of denied.entries()) expect(errorKey(fn), `action #${i}`).toBe("error.forbidden");
  });

  it("client users can review and comment – but only for their own client", () => {
    let ws = fresh();
    ws = valid(A.addComment(ws, ctx(client), "m_kb_cut_v2", "ok"));
    ws = valid(A.approveMedia(ws, ctx(client), "m_kb_cut_v2"));
    expect(errorKey(() => A.approveScript(ws, ctx(client), "sc_winterkarte_v1"))).toBe("error.forbidden"); // Café Morgenrot
    expect(errorKey(() => A.approveScript(ws, ctx("u_anna_cafe"), "sc_winterkarte_v1"))).toBeUndefined();
  });

  it("unknown actors are rejected", () => {
    expect(errorKey(() => A.moveStage(fresh(), ctx("u_ghost"), "ct_kniebeuge", "edit"))).toBe("error.forbidden");
  });

  it("every role has a permission list and client is a strict subset of agency", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) for (const p of perms) expect(PERMISSIONS).toContain(p);
    expect(ROLE_PERMISSIONS.client.every((p) => ROLE_PERMISSIONS.lead.includes(p))).toBe(true);
    expect(can({ id: "x", name: "x", role: "client", clientId: "c_a" }, "media.review", "c_b")).toBe(false);
  });

  it("client users do not see activity about raw footage or deleted files", () => {
    let ws = fresh();
    ws = A.addMedia(ws, ctx("u_jonas"), { contentId: "ct_kniebeuge", kind: "raw", fileName: "A-cam_take3.mov" }).ws;
    const rawId = ws.media.at(-1)!.id;
    ws = A.deleteMedia(ws, ctx("u_jonas"), rawId).ws;
    const scoped = scopedWorkspace(A.setCurrentUser(ws, client), null);
    expect(scoped.activity.some((a) => a.params?.fileName === "A-cam_take3.mov")).toBe(false);
  });
});

describe("integrity check", () => {
  it("accepts the seed and reports broken references", () => {
    expect(integrityErrors(fresh())).toEqual([]);
    const broken = fresh();
    broken.workspace.currentUserId = "u_nobody";
    broken.contents[0]!.clientId = "c_missing";
    broken.team = broken.team.map((m) => (m.id === "u_paul_puls" ? { ...m, clientId: "c_missing" } : m));
    const errors = integrityErrors(broken).join("\n");
    expect(errors).toMatch(/currentUserId/);
    expect(errors).toMatch(/unknown client c_missing/);
    expect(errors).toMatch(/client user without valid clientId/);
  });
});
