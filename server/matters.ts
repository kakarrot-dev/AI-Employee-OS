import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { writeFileAtomic } from "./atomic.ts";

export type MatterStatus = "draft" | "working" | "cancelling" | "needs_input" | "review" | "completed" | "failed" | "cancelled";
export interface MatterAttachment { kind: "file" | "image"; id: string; path: string; name: string; size: number; mime?: string }
export interface Matter {
  id: string; title: string; description: string; botId: string; attachments: MatterAttachment[];
  status: MatterStatus; createdAt: number; updatedAt: number; threadId?: string; sendId?: string;
  since?: number; result?: string; question?: string; error?: string; needsConversation?: boolean; lastText?: string; lastAttachments?: MatterAttachment[];
}

export function createMatterStore(dataDir: string, attachmentsDir: string) {
  const file = join(dataDir, "matters.json");
  let records: Matter[] = [];
  if (existsSync(file)) {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Invalid matters store");
    records = parsed as Matter[];
  }
  const write = (next: Matter[]) => {
    writeFileAtomic(file, JSON.stringify(next), { mode: 0o600 });
    records = next;
  };
  const validateAttachments = (input: unknown): MatterAttachment[] => {
    if (!Array.isArray(input) || input.length > 20) throw new Error("附件必须是最多 20 个文件");
    return input.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("无效的附件");
      const a = item as Record<string, unknown>;
      if ((a.kind !== "file" && a.kind !== "image") || typeof a.id !== "string" || a.id.length > 200 ||
          typeof a.path !== "string" || typeof a.name !== "string" || !a.name || a.name.length > 255 ||
          typeof a.size !== "number" || !Number.isSafeInteger(a.size) || a.size < 0 ||
          (a.kind === "image" && (typeof a.mime !== "string" || !a.mime.startsWith("image/")))) throw new Error("无效的附件");
      const path = resolve(a.path);
      const name = basename(path);
      if (dirname(path) !== resolve(attachmentsDir) || !/^[A-Za-z0-9-]+\.[A-Za-z0-9]{1,10}$/.test(name)) throw new Error("附件不在本机上传目录中");
      let stat;
      try { stat = lstatSync(path); } catch { throw new Error("附件不存在，请重新上传"); }
      if (!stat.isFile() || stat.size !== a.size) throw new Error("附件已变化，请重新上传");
      return { kind: a.kind, id: a.id, path, name: a.name, size: a.size, ...(a.kind === "image" ? { mime: a.mime as string } : {}) };
    });
  };
  const list = () => records.map((record) => structuredClone(record)).sort((a, b) => b.updatedAt - a.updatedAt);
  const get = (id: string) => { const found = records.find((one) => one.id === id); return found ? structuredClone(found) : null; };
  const save = (record: Matter) => { const next = records.filter((one) => one.id !== record.id); next.push(structuredClone(record)); write(next); return structuredClone(record); };
  const remove = (id: string) => write(records.filter((one) => one.id !== id));
  const create = (data: Pick<Matter, "title" | "description" | "botId" | "attachments">) => {
    const now = Date.now(); return save({ id: randomUUID(), ...data, status: "draft", createdAt: now, updatedAt: now });
  };
  return { list, get, save, remove, create, validateAttachments };
}
