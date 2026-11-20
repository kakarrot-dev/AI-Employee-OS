import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMatterStore } from "./matters.ts";
import { createMatterRoutes } from "./routes/matters.ts";
import type { RouteContext } from "./routes/table.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "omb-matters-test-")); dirs.push(dir);
  const uploads = join(dir, "attachments"); mkdirSync(uploads);
  const matters = createMatterStore(dir, uploads);
  const attachment = { kind: "file" as const, id: "a", path: join(uploads, "1234.txt"), name: "材料.txt", size: 3 };
  writeFileSync(attachment.path, "abc");
  return { dir, uploads, matters, attachment };
}

describe("matter storage", () => {
  it("persists drafts and accepts only real uploads within the attachment store", () => {
    const { dir, uploads, matters, attachment } = fixture();
    const saved = matters.create({ title: "", description: "", botId: "", attachments: matters.validateAttachments([attachment]) });
    expect(createMatterStore(dir, uploads).get(saved.id)).toEqual(saved);
    expect(() => matters.validateAttachments([{ ...attachment, path: join(dir, "secret.txt") }])).toThrow();
    expect(() => matters.validateAttachments([{ ...attachment, size: 2 }])).toThrow();
  });
});

describe("matter transitions", () => {
  it("requires an actual finished job and matching structured reply, then user confirmation", async () => {
    const { matters } = fixture();
    const messages: Array<Record<string, unknown>> = [];
    let jobState = "running";
    const route = createMatterRoutes({ matters, enabled: true, botExists: () => true, messages: () => messages as never,
      busy: () => false, liveTurn: () => undefined, deleteUpload: () => true,
      invoke: async (_ctx, kind, _path, body) => {
        if (kind === "task") return { status: 201, body: { task: { threadId: "thread" } } };
        if (kind === "message") { messages.push({ role: "user", kind: "text", sendId: (body as {sendId:string}).sendId }); return { status: 202, body: {} }; }
        return { status: 200, body: { state: jobState, reason: "finished" } };
      },
    });
    const call = async (method: string, path: string, body?: unknown) => {
      let result: { status: number; body: any } | undefined;
      await route({ path, method, auth: { scopes: ["admin"] }, readBody: async () => body,
        json: (_res: unknown, status: number, output: unknown) => { result = { status, body: output }; },
      } as unknown as RouteContext);
      return result!;
    };
    const created = await call("POST", "/api/matters", { title: "检查", description: "核对", botId: "b", attachments: [] });
    const id = created.body.matter.id;
    expect((await call("POST", `/api/matters/${id}/submit`)).body.matter.status).toBe("working");
    messages.push({ role: "bot", kind: "text", text: "[事项:待确认]结果" });
    expect((await call("GET", `/api/matters/${id}`)).body.matter.status).toBe("working");
    jobState = "completed";
    expect((await call("GET", `/api/matters/${id}`)).body.matter).toMatchObject({ status: "review", result: "结果" });
    expect((await call("POST", `/api/matters/${id}/confirm`)).body.matter.status).toBe("completed");
  });
  it("does not accept a later conversation turn as this matter's result", async () => {
    const { matters } = fixture();
    const m = matters.create({ title: "检查", description: "核对", botId: "b", attachments: [] });
    matters.save({ ...m, status: "working", sendId: "first", threadId: "thread", since: 1 });
    const messages = [{ role: "user", sendId: "first" }, { role: "user", sendId: "other" }, { role: "bot", kind: "text", text: "[事项:待确认] unrelated" }];
    const route = createMatterRoutes({ matters, enabled: true, botExists: () => true, messages: () => messages as never,
      busy: () => false, liveTurn: () => undefined, deleteUpload: () => true,
      invoke: async () => ({ status: 200, body: { state: "completed" } }) });
    let output: any;
    await route({ path: `/api/matters/${m.id}`, method: "GET", auth: { scopes: ["admin"] },
      json: (_res: unknown, _status: number, body: unknown) => { output = body; },
    } as unknown as RouteContext);
    expect(output.matter.status).toBe("failed");
    expect(output.matter.error).toContain("其他用户消息");
  });
});

describe("recovery and attachment ownership", () => {
  it("retries the last supplement rather than the original request", async () => {
    const { matters, attachment } = fixture();
    let m = matters.create({ title: "检查", description: "原始要求", botId: "b", attachments: [attachment] });
    m = matters.save({ ...m, status: "failed", threadId: "thread", lastText: "后续补充", lastAttachments: [attachment] });
    let sent: any;
    const route = createMatterRoutes({ matters, enabled: true, botExists: () => true, messages: () => [], busy: () => false,
      liveTurn: () => undefined, deleteUpload: () => true,
      invoke: async (_ctx, kind, _path, body) => { if (kind === "message") sent = body; return { status: 202, body: {} }; } });
    let result: any;
    await route({ path: `/api/matters/${m.id}/retry`, method: "POST", auth: { scopes: ["admin"] },
      json: (_res: unknown, _status: number, body: unknown) => { result = body; } } as unknown as RouteContext);
    expect(result.matter.status).toBe("working");
    expect(sent.text).toContain("后续补充");
    expect(sent.text).not.toContain("原始要求");
    expect(sent.text).toContain(attachment.path);
  });
  it("reports cancelling until the running thread is actually stopped", async () => {
    const { matters } = fixture();
    let m = matters.create({ title: "检查", description: "要求", botId: "b", attachments: [] });
    m = matters.save({ ...m, status: "working", threadId: "thread", sendId: "send", since: Date.now() });
    let running = true;
    const route = createMatterRoutes({ matters, enabled: true, botExists: () => true, messages: () => [], busy: () => running,
      liveTurn: () => "turn-1", deleteUpload: () => true,
      invoke: async (_ctx, kind) => ({ status: 200, body: kind === "job" ? { state: "running" } : { ok: true } }) });
    const call = async (method: string, path: string) => { let result: any; await route({ path, method, auth: { scopes: ["admin"] }, json: (_:unknown, status:number, body:unknown) => { result = { status, body }; } } as unknown as RouteContext); return result; };
    expect((await call("POST", `/api/matters/${m.id}/cancel`)).body.matter.status).toBe("cancelling");
    expect((await call("GET", `/api/matters/${m.id}`)).body.matter.status).toBe("cancelling");
    running = false;
    expect((await call("GET", `/api/matters/${m.id}`)).body.matter.status).toBe("cancelled");
  });
  it("cannot discard an attachment still owned by a draft", async () => {
    const { matters, attachment } = fixture();
    matters.create({ title: "", description: "", botId: "", attachments: [attachment] });
    let deleted = false;
    const route = createMatterRoutes({ matters, enabled: true, botExists: () => true, messages: () => [], busy: () => false,
      liveTurn: () => undefined, deleteUpload: () => { deleted = true; return true; }, invoke: async () => ({ status: 200, body: {} }) });
    let status = 0;
    await route({ path: "/api/matters/discard", method: "POST", auth: { scopes: ["admin"] }, readBody: async () => ({ attachment }),
      json: (_:unknown, code:number) => { status = code; } } as unknown as RouteContext);
    expect(status).toBe(409);
    expect(deleted).toBe(false);
  });
  it("retains files used by another matter when deleting", async () => {
    const { matters, attachment } = fixture();
    const first = matters.create({ title: "一", description: "", botId: "", attachments: [attachment] });
    matters.create({ title: "二", description: "", botId: "", attachments: [attachment] });
    let deleted = false;
    const route = createMatterRoutes({ matters, enabled: true, botExists: () => true, messages: () => [], busy: () => false,
      liveTurn: () => undefined, deleteUpload: () => { deleted = true; return true; }, invoke: async () => ({ status: 200, body: {} }) });
    let result: any;
    await route({ path: `/api/matters/${first.id}`, method: "DELETE", auth: { scopes: ["admin"] },
      json: (_:unknown, _code:number, body:unknown) => { result = body; } } as unknown as RouteContext);
    expect(result.retained).toEqual([attachment.name]);
    expect(deleted).toBe(false);
    expect(matters.list()).toHaveLength(1);
  });
  it("does not overwrite a concurrent cancellation with an older job read", async () => {
    const { matters } = fixture();
    let m = matters.create({ title: "检查", description: "要求", botId: "b", attachments: [] });
    m = matters.save({ ...m, status: "working", threadId: "thread", sendId: "send", since: Date.now() });
    let resolveJob!: (value: {status:number;body:unknown}) => void;
    const pending = new Promise<{status:number;body:unknown}>((resolve) => { resolveJob = resolve; });
    const route = createMatterRoutes({ matters, enabled: true, botExists: () => true, messages: () => [], busy: () => false,
      liveTurn: () => undefined, deleteUpload: () => true, invoke: async () => pending });
    let output: any;
    const read = route({ path: `/api/matters/${m.id}`, method: "GET", auth: { scopes: ["admin"] },
      json: (_:unknown, _code:number, body:unknown) => { output = body; } } as unknown as RouteContext);
    matters.save({ ...m, status: "cancelled", updatedAt: m.updatedAt + 1 });
    resolveJob({ status: 200, body: { state: "failed", reason: "late" } });
    await read;
    expect(output.matter.status).toBe("cancelled");
    expect(matters.get(m.id)?.status).toBe("cancelled");
  });
});
