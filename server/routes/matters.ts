import { randomUUID } from "node:crypto";
import type { Message } from "../store.ts";
import type { Matter, MatterAttachment, createMatterStore } from "../matters.ts";
import { PASS, type RouteContext, type RouteHandler } from "./table.ts";

type Result = { status: number; body: any };
type Deps = {
  matters: ReturnType<typeof createMatterStore>;
  enabled: boolean;
  botExists(id: string): boolean;
  messages(threadId: string): Message[];
  busy(botId: string, threadId: string): boolean;
  liveTurn(threadId: string): string | undefined;
  invoke(ctx: RouteContext, kind: "task" | "message" | "interrupt" | "job", path: string, body?: unknown): Promise<Result>;
  deleteUpload(path: string): boolean;
};

const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "&#10;").replaceAll("\r", "&#13;").replaceAll("\t", "&#9;");
const attachmentText = (attachments: MatterAttachment[]) => attachments.map((a) => `<attached-${a.kind === "image" ? "image" : "file"} path="${escape(a.path)}" name="${escape(a.name)}" />`).join("\n\n");
const instruction = "请处理以下事项。需要补充资料时，在最终回复开头写 [事项:需补充]，并说明具体问题；处理完成时，在最终回复开头写 [事项:待确认]，并给出完整结果。不要将用户尚未确认的结果称为已完成。";
const validText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

export function createMatterRoutes(deps: Deps): RouteHandler {
  const { matters } = deps;
  const locks = new Set<string>();
  const update = (matter: Matter, patch: Partial<Matter>) => matters.save({ ...matter, ...patch, updatedAt: Date.now() });
  const reconcile = async (ctx: RouteContext, m: Matter): Promise<Matter> => {
    if (locks.has(m.id)) return m;
    if (m.status === "cancelling") {
      if (!m.threadId || !deps.busy(m.botId, m.threadId)) return update(m, { status: "cancelled", error: undefined });
      return m;
    }
    if ((m.status !== "working" && !(m.status === "needs_input" && m.needsConversation)) || !m.threadId || !m.sendId || m.since === undefined) return m;
    const observed = m;
    const apply = (patch: Partial<Matter>) => {
      const latest = matters.get(observed.id);
      if (!latest) return observed;
      if (latest.status !== observed.status || latest.sendId !== observed.sendId || latest.updatedAt !== observed.updatedAt) return latest;
      return update(latest, patch);
    };
    const path = `/api/threads/${m.threadId}/job?scope=turn&since=${m.since}&full=1`;
    const job = await deps.invoke(ctx, "job", path);
    if (job.status !== 200) return apply({ status: "failed", error: "无法读取执行状态，请检查关联会话。" });
    const state = job.body?.state;
    if (state === "running") return m.status === "needs_input" ? apply({ status: "working", question: undefined, needsConversation: undefined }) : matters.get(m.id) ?? m;
    if (state === "failed" || state === "stalled") return apply({ status: "failed", error: String(job.body?.reason ?? "执行未完成") });
    if (state === "needs-input" && m.status === "needs_input" && m.needsConversation) return matters.get(m.id) ?? m;
    if (state === "needs-input") return apply({ status: "needs_input", needsConversation: true, question: String(job.body?.needsInput?.[0]?.question ?? job.body?.reason ?? "请在关联会话中处理请求。") });
    if (state === "idle" && Date.now() - m.since > 30000) return apply({ status: "failed", error: "无法确认本次运行的结果；请查看关联会话后重试。" });
    if (state !== "completed") return matters.get(m.id) ?? m;
    const messages = deps.messages(m.threadId);
    const sent = messages.findIndex((row) => row.role === "user" && row.sendId === m.sendId);
    if (sent < 0) return apply({ status: "failed", error: "找不到本次提交的消息，请查看关联会话。" });
    const following = messages.slice(sent + 1);
    if (following.some((row) => row.role === "user")) return apply({ status: "failed", error: "关联会话中出现了其他用户消息，无法安全确认本次结果。请查看会话。" });
    const reply = following.filter((row) => row.role === "bot" && row.kind === "text" && typeof row.text === "string").at(-1)?.text ?? "";
    const marker = reply.match(/^\s*\[事项:(待确认|需补充)\]\s*/);
    if (!marker || !reply.slice(marker[0].length).trim()) return apply({ status: "failed", error: "智能体结束了本次运行，但未按约定提交有效结果。请查看会话后重试。" });
    const text = reply.slice(marker[0].length).trim();
    return marker[1] === "需补充" ? apply({ status: "needs_input", needsConversation: false, question: text, error: undefined }) : apply({ status: "review", result: text, question: undefined, error: undefined });
  };
  const run = async (ctx: RouteContext, m: Matter, text: string, attachments: MatterAttachment[]) => {
    if (!deps.botExists(m.botId)) throw Object.assign(new Error("所选智能体不存在"), { status: 404 });
    if (!m.threadId) {
      const created = await deps.invoke(ctx, "task", `/api/bots/${m.botId}/tasks`, { title: m.title, select: false });
      if (created.status >= 400 || !created.body?.task?.threadId) throw Object.assign(new Error(created.body?.error ?? "无法创建会话"), { status: created.status });
      m = update(m, { threadId: created.body.task.threadId });
    }
    const sendId = randomUUID();
    m = update(m, { status: "working", sendId, since: Date.now() - 1, error: undefined, question: undefined, result: undefined, needsConversation: undefined, lastText: text, lastAttachments: attachments });
    const prompt = `${instruction}\n\n事项：${m.title}\n\n${text}${attachments.length ? `\n\n${attachmentText(attachments)}` : ""}`;
    try {
      const sent = await deps.invoke(ctx, "message", `/api/bots/${m.botId}/messages`, { threadId: m.threadId, sendId, text: prompt });
      if (sent.status >= 400) throw new Error(sent.body?.error ?? "无法发送工作要求");
      return m;
    } catch (error) {
      update(m, { status: "failed", error: error instanceof Error ? error.message : "提交失败" });
      throw error;
    }
  };
  return async (ctx) => {
    const { req, res, path, method, auth, json, readBody } = ctx;
    if (!path.startsWith("/api/matters")) return PASS;
    if (!deps.enabled || !auth.scopes.includes("admin")) return json(res, 403, { error: "事项功能仅供本机管理员使用" });
    if (path === "/api/matters/discard" && method === "POST") {
      try {
        const body = await readBody(req) as Record<string, unknown>;
        const [attachment] = matters.validateAttachments([body?.attachment]);
        if (!attachment || matters.list().some((m) => m.attachments.some((a) => a.path === attachment.path)) || !deps.deleteUpload(attachment.path)) return json(res, 409, { error: "附件仍被事项或会话引用" });
        return json(res, 200, { ok: true });
      } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : "无效的附件" }); }
    }
    if (path === "/api/matters" && method === "GET") {
      const all: Matter[] = [];
      for (const m of matters.list()) all.push(await reconcile(ctx, m));
      return json(res, 200, { matters: all });
    }
    if (path === "/api/matters" && method === "POST") {
      const body = await readBody(req) as Record<string, unknown>;
      if (!body || !validText(body.title, 200) || !validText(body.description, 100000) || !validText(body.botId, 200)) return json(res, 400, { error: "事项内容无效" });
      try { return json(res, 201, { matter: matters.create({ title: String(body.title).trim(), description: String(body.description).trim(), botId: String(body.botId), attachments: matters.validateAttachments(body.attachments ?? []) }) }); }
      catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : "无效的附件" }); }
    }
    const match = path.match(/^\/api\/matters\/([\w-]+)(?:\/(submit|continue|confirm|cancel|retry))?$/);
    if (!match) return PASS;
    const id = match[1]!; const action = match[2];
    let m = matters.get(id);
    if (!m) return json(res, 404, { error: "事项不存在" });
    if (method === "GET" && !action) return json(res, 200, { matter: await reconcile(ctx, m) });
    if (locks.has(id)) return json(res, 409, { error: "事项操作正在进行，请稍后重试" });
    m = await reconcile(ctx, m);
    if (locks.has(id)) return json(res, 409, { error: "事项操作正在进行，请稍后重试" });
    locks.add(id);
    try {
      m = matters.get(id)!;
      if (method === "PATCH" && !action) {
        if (m.status !== "draft") return json(res, 409, { error: "只有草稿可以修改" });
        const body = await readBody(req) as Record<string, unknown>;
        if (!body || !validText(body.title, 200) || !validText(body.description, 100000) || !validText(body.botId, 200)) return json(res, 400, { error: "事项内容无效" });
        return json(res, 200, { matter: update(m, { title: String(body.title).trim(), description: String(body.description).trim(), botId: String(body.botId), attachments: matters.validateAttachments(body.attachments ?? []) }) });
      }
      if (method === "DELETE" && !action) {
        if (m.status === "working" || m.status === "cancelling" || (m.threadId && deps.busy(m.botId, m.threadId))) return json(res, 409, { error: "请先停止正在执行的事项" });
        matters.remove(id);
        const kept = new Set(matters.list().flatMap((one) => one.attachments.map((a) => a.path)));
        const retained = m.attachments.filter((a) => kept.has(a.path) || !deps.deleteUpload(a.path)).map((a) => a.name);
        return json(res, 200, { ok: true, retained });
      }
      if (method !== "POST" || !action) return PASS;
      if (action === "confirm") {
        if (m.status !== "review") return json(res, 409, { error: "事项还没有等待确认的结果" });
        return json(res, 200, { matter: update(m, { status: "completed" }) });
      }
      if (action === "cancel") {
        if (m.status === "completed" || m.status === "cancelled") return json(res, 409, { error: "事项已结束" });
        if (m.status === "cancelling") return json(res, 200, { matter: m });
        if (m.threadId && deps.busy(m.botId, m.threadId)) {
          const stopped = await deps.invoke(ctx, "interrupt", `/api/bots/${m.botId}/interrupt`, { threadId: m.threadId, turnId: deps.liveTurn(m.threadId) });
          if (stopped.status >= 400) return json(res, 409, { error: String(stopped.body?.error ?? "停止请求失败") });
          if (stopped.body?.outcome === "already-stopped" && deps.busy(m.botId, m.threadId)) return json(res, 409, { error: "原运行已结束，会话正在执行其他工作；请检查会话。" });
          if (deps.busy(m.botId, m.threadId)) return json(res, 202, { matter: update(m, { status: "cancelling" }) });
        }
        return json(res, 200, { matter: update(m, { status: "cancelled" }) });
      }
      if (action === "submit" || action === "retry") {
        if ((action === "submit" && m.status !== "draft") || (action === "retry" && m.status !== "failed" && m.status !== "cancelled")) return json(res, 409, { error: "当前状态不能执行此操作" });
        if (!m.title.trim() || !m.description.trim() || !m.botId) return json(res, 400, { error: "请填写标题、工作要求并选择智能体" });
        const retryText = action === "retry" ? m.lastText ?? m.description : m.description;
        const retryAttachments = action === "retry" ? m.lastAttachments ?? m.attachments : m.attachments;
        matters.validateAttachments(retryAttachments);
        return json(res, 200, { matter: await run(ctx, m, retryText, retryAttachments) });
      }
      if (action === "continue") {
        if (m.status !== "needs_input" && m.status !== "review") return json(res, 409, { error: "当前状态不能补充要求" });
        if (m.needsConversation) return json(res, 409, { error: "请先打开关联会话处理待审批或提问卡。" });
        const body = await readBody(req) as Record<string, unknown>;
        if (!body || !validText(body.text, 100000)) return json(res, 400, { error: "请输入补充内容" });
        const extra = matters.validateAttachments(body.attachments ?? []);
        if (!String(body.text).trim() && !extra.length) return json(res, 400, { error: "请输入补充内容或上传资料" });
        matters.validateAttachments([...m.attachments, ...extra]);
        m = update(m, { attachments: [...m.attachments, ...extra] });
        return json(res, 200, { matter: await run(ctx, m, String(body.text), extra) });
      }
      return PASS;
    } catch (error) {
      return json(res, (error as { status?: number })?.status ?? 400, { error: error instanceof Error ? error.message : "事项操作失败" });
    } finally { locks.delete(id); }
  };
}
