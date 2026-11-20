import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, ClipboardList, Plus, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { fileAttachmentFromFile, imageAttachmentFromFile, isImageFile, type FileAttachment, type ImageAttachment } from "@/lib/composer-attachments";
import { cn } from "@/lib/cn";
import { useShowThreads } from "@/lib/thread-preferences";
import { allowMatterNavigation, setMatterNavigationGuard } from "@/lib/matter-navigation-guard";
import { api, openThread, useStore } from "@/state/store";
import { useCaptionChrome } from "./DesktopCapabilities";
import { ConfirmDialog } from "./ConfirmDialog";

type MatterStatus = "draft" | "working" | "needs_input" | "review" | "completed" | "failed" | "cancelling" | "cancelled";
type MatterFile = FileAttachment | ImageAttachment;
interface Matter {
  id: string;
  title: string;
  description: string;
  botId: string;
  threadId?: string;
  status: MatterStatus;
  attachments: MatterFile[];
  result?: string;
  question?: string;
  error?: string;
  needsConversation?: boolean;
  createdAt: number;
  updatedAt: number;
}
type MatterInput = Pick<Matter, "title" | "description" | "botId" | "attachments">;
type Screen = { kind: "list" } | { kind: "detail"; id: string } | { kind: "form"; id?: string };
const STATUS_KEYS = {
  draft: "matters.status.draft", working: "matters.status.working", needs_input: "matters.status.needs_input",
  review: "matters.status.review", completed: "matters.status.completed", failed: "matters.status.failed", cancelling: "matters.status.cancelling", cancelled: "matters.status.cancelled",
} as const;
const field = "w-full rounded-lg border border-hairline bg-app px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-focus";
const discardFile = (attachment: MatterFile) => api("/api/matters/discard", { method: "POST", body: JSON.stringify({ attachment }) }).catch(() => undefined);

export function MattersPage({ initialForm = false }: { initialForm?: boolean }) {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const { dragProps } = useCaptionChrome();
  const [items, setItems] = useState<Matter[]>([]);
  const [screen, setScreen] = useState<Screen>(initialForm ? { kind: "form" } : { kind: "list" });
  const [tab, setTab] = useState<"mine" | "needsMe">("mine");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<"cancel" | "delete" | null>(null);
  const [replies, setReplies] = useState<Record<string, { text: string; files: MatterFile[]; uploading: boolean; error: string | null }>>({});
  const bots = state.bots.filter((bot) => !bot.hidden);
  const item = screen.kind === "list" || !screen.id ? undefined : items.find((candidate) => candidate.id === screen.id);
  const reply = item ? replies[item.id] ?? { text: "", files: [], uploading: false, error: null } : { text: "", files: [], uploading: false, error: null };
  const updateReply = (id: string, patch: Partial<{ text: string; files: MatterFile[]; uploading: boolean; error: string | null }>) =>
    setReplies((before) => ({ ...before, [id]: { ...(before[id] ?? { text: "", files: [], uploading: false, error: null }), ...patch } }));

  const refresh = useCallback(async (background = false) => {
    try {
      const response = await api<{ matters: Matter[] }>("/api/matters", { background });
      if (!Array.isArray(response.matters)) throw new Error(t("matters.error"));
      setItems(response.matters);
      if (!background) setError(null);
    } catch (cause) {
      if (!background) setError(cause instanceof Error ? cause.message : t("matters.error"));
    } finally {
      if (!background) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!busy) void refresh(true); }, 3000);
    return () => window.clearInterval(timer);
  }, [busy, refresh]);

  const save = async (value: MatterInput, id?: string): Promise<Matter> => {
    const previous = id ? items.find((candidate) => candidate.id === id)?.attachments ?? [] : [];
    const response = await api<{ matter: Matter }>(id ? `/api/matters/${encodeURIComponent(id)}` : "/api/matters", {
      method: id ? "PATCH" : "POST", body: JSON.stringify(value),
    });
    setItems((before) => [response.matter, ...before.filter((candidate) => candidate.id !== response.matter.id)]);
    for (const removed of previous.filter((file) => !value.attachments.some((current) => current.path === file.path))) void discardFile(removed);
    return response.matter;
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("matters.error")); }
    finally { setBusy(false); }
  };
  const action = (matter: Matter, name: "submit" | "continue" | "confirm" | "cancel" | "retry", body?: object) =>
    api<{ matter: Matter }>(`/api/matters/${encodeURIComponent(matter.id)}/${name}`, { method: "POST", body: JSON.stringify(body ?? {}) });
  const act = (matter: Matter, name: "submit" | "continue" | "confirm" | "cancel" | "retry", body?: object) => void run(async () => {
    const { matter: updated } = await action(matter, name, body);
    setItems((before) => before.map((candidate) => candidate.id === updated.id ? updated : candidate));
    if (name === "continue") updateReply(matter.id, { text: "", files: [] });
    await refresh();
  });
  const list = tab === "mine" ? items : items.filter((candidate) => candidate.status === "needs_input" || candidate.status === "review");
  return <main className="relative flex h-full min-w-0 flex-1 flex-col bg-app text-ink">
    <header {...dragProps} className="flex shrink-0 items-center gap-2.5 border-b border-hairline/40 px-6 py-4 max-md:pl-12">
      {screen.kind !== "list" ? <button type="button" aria-label={t("matters.back")} className="rounded-lg p-1 text-ink-secondary hover:bg-raised" onClick={() => { if (initialForm && screen.kind === "form" && !screen.id) { dispatch({ type: "showMatterPlaza" }); return; } if (!allowMatterNavigation()) return; if (item) updateReply(item.id, { text: "", files: [], error: null }); setScreen({ kind: "list" }); setError(null); }}><ArrowLeft size={18} /></button> : <ClipboardList size={18} className="text-ink-secondary" />}
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{screen.kind === "form" ? t(screen.id ? "matters.edit" : "matters.new") : screen.kind === "detail" && item ? item.title || t("matters.status.draft") : t("matters.title")}</h1>
      {screen.kind === "list" && <button type="button" className="ui-button ui-button-primary" onClick={() => { setScreen({ kind: "form" }); setError(null); }}><Plus size={16} />{t("matters.new")}</button>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
      {error && <p role="alert" className="rounded-lg bg-card px-3 py-2 text-[13px] text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-card px-3 py-2 text-[13px] text-ink-secondary">{notice}</p>}
      {screen.kind === "list" && <>
        <div role="tablist" aria-label={t("matters.title")} className="flex gap-5 border-b border-hairline/40">
          {(["mine", "needsMe"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cn("border-b-2 px-1 pb-2 text-[14px]", tab === key ? "border-ink font-medium text-ink" : "border-transparent text-ink-secondary hover:text-ink")}>{t(key === "mine" ? "matters.mine" : "matters.needsMe")}</button>)}
        </div>
        {loading ? <p role="status" className="text-[13px] text-ink-secondary">{t("matters.loading")}</p> : list.length === 0 ? <p className="py-5 text-[14px] text-ink-secondary">{t("matters.empty")}</p> :
          <ul className="divide-y divide-hairline/40">{list.map((matter) => <li key={matter.id}><button type="button" onClick={() => { setScreen({ kind: "detail", id: matter.id }); setError(null); }} className="flex w-full items-center gap-4 rounded-lg px-2 py-3 text-left hover:bg-raised/50">
            <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium">{matter.title || t("matters.status.draft")}</span><span className="mt-1 block truncate text-[12px] text-ink-secondary">{bots.find((bot) => bot.id === matter.botId)?.name ?? ""}</span></span>
            <span className="shrink-0 text-[12px] text-ink-secondary">{t(STATUS_KEYS[matter.status])}</span>
          </button></li>)}</ul>}
      </>}
      {screen.kind === "form" && <MatterForm key={screen.id ?? "new"} item={item} bots={bots} busy={busy} save={(value, submit) => void run(async () => {
        const saved = await save(value, screen.id);
        setScreen({ kind: "detail", id: saved.id });
        if (submit) {
          const { matter: started } = await action(saved, "submit");
          setItems((before) => before.map((candidate) => candidate.id === started.id ? started : candidate));
        }
        await refresh();
      })} />}
      {screen.kind === "detail" && item && <>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-secondary"><span>{t(STATUS_KEYS[item.status])}</span><span aria-hidden="true">·</span><span>{bots.find((bot) => bot.id === item.botId)?.name ?? item.botId}</span></div>
        <section><h2 className="mb-2 text-[14px] font-medium">{t("matters.instructions")}</h2><p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{item.description}</p></section>
        <FileList files={item.attachments ?? []} />
        {item.question && <section className="rounded-xl bg-card p-4"><h2 className="mb-2 text-[14px] font-medium">{t("matters.question")}</h2><p className="whitespace-pre-wrap text-[14px]">{item.question}</p></section>}
        {item.result && <section className="rounded-xl bg-card p-4"><h2 className="mb-2 text-[14px] font-medium">{t("matters.result")}</h2><p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{item.result}</p></section>}
        {item.error && <p role="alert" className="text-[13px] text-danger">{item.error}</p>}
        {item.needsConversation && <p role="status" className="text-[13px] text-ink-secondary">{t("matters.needsConversation")}</p>}
        {!item.needsConversation && (item.status === "needs_input" || item.status === "review") && <section className="flex flex-col gap-3"><label htmlFor="matter-reply" className="text-[14px] font-medium">{t("matters.reply")}</label><textarea id="matter-reply" className={field} rows={4} value={reply.text} onChange={(event) => updateReply(item.id, { text: event.target.value })} />
          <AttachmentPicker files={reply.files} onChange={(files) => updateReply(item.id, { files })} uploading={reply.uploading} onUploading={(uploading) => updateReply(item.id, { uploading })} onError={(error) => updateReply(item.id, { error })} />
          {reply.error && <p role="alert" className="text-[13px] text-danger">{reply.error}</p>}
          <button type="button" className="ui-button self-start" disabled={busy || reply.uploading || (!reply.text.trim() && !reply.files.length)} onClick={() => act(item, "continue", { text: reply.text, attachments: reply.files })}>{t("matters.continue")}</button></section>}
        <div className="flex flex-wrap gap-2 border-t border-hairline/40 pt-4">
          {item.status === "draft" && <><button type="button" className="ui-button" onClick={() => setScreen({ kind: "form", id: item.id })}>{t("matters.edit")}</button><button type="button" disabled={busy || !item.title.trim() || !item.description.trim() || !item.botId} className="ui-button ui-button-primary" onClick={() => act(item, "submit")}>{t("matters.submit")}</button></>}
          {item.status === "review" && <button type="button" disabled={busy} className="ui-button ui-button-primary" onClick={() => act(item, "confirm")}>{t("matters.confirm")}</button>}
          {item.status === "failed" && <button type="button" disabled={busy} className="ui-button" onClick={() => act(item, "retry")}>{t("matters.retry")}</button>}
          {item.status === "cancelled" && <button type="button" disabled={busy} className="ui-button" onClick={() => void run(async () => { const draft = await save({ title: item.title, description: item.description, botId: item.botId, attachments: item.attachments ?? [] }); setScreen({ kind: "form", id: draft.id }); })}>{t("matters.restart")}</button>}
          {item.threadId && <button type="button" className="ui-button" onClick={() => { dispatch({ type: "showChat" }); openThread(dispatch, { botId: item.botId, threadId: item.threadId! }, state, showThreads); }}>{t("matters.openChat")}</button>}
          {!["draft", "completed", "cancelling", "cancelled"].includes(item.status) && <button type="button" disabled={busy} className="ui-button" onClick={() => setAsk("cancel")}>{t("matters.cancel")}</button>}
          {["draft", "completed", "failed", "cancelled"].includes(item.status) && <button type="button" disabled={busy} className="ui-button" onClick={() => setAsk("delete")}>{t("matters.delete")}</button>}
        </div>
        <ConfirmDialog open={ask !== null} title={t(ask === "delete" ? "matters.delete" : "matters.cancel")} body={t(ask === "delete" ? "matters.confirmDelete" : "matters.confirmCancel")} confirmLabel={t(ask === "delete" ? "matters.delete" : "matters.cancel")} onCancel={() => setAsk(null)} onConfirm={() => {
          const choice = ask; setAsk(null);
          if (choice === "cancel") act(item, "cancel");
          if (choice === "delete") void run(async () => { const result = await api<{ retained: string[] }>(`/api/matters/${encodeURIComponent(item.id)}`, { method: "DELETE" }); setScreen({ kind: "list" }); await refresh(); setNotice(result.retained?.length ? t("matters.retained", { files: result.retained.join(", ") }) : null); });
        }} />
      </>}
    </div></div>
  </main>;
}

function MatterForm({ item, bots, busy, save }: { item?: Matter; bots: Array<{ id: string; name: string }>; busy: boolean; save: (input: MatterInput, submit: boolean) => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [botId, setBotId] = useState(item?.botId ?? "");
  const [attachments, setAttachments] = useState<MatterFile[]>(item?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = title !== (item?.title ?? "") || description !== (item?.description ?? "") || botId !== (item?.botId ?? "") ||
    attachments.length !== (item?.attachments.length ?? 0) || attachments.some((file, i) => file.path !== item?.attachments[i]?.path);
  useEffect(() => {
    if (!dirty && !uploading) return;
    const unregister = setMatterNavigationGuard(() => window.confirm(t("matters.unsavedLeave")));
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, uploading]);
  const value = { title, description, botId, attachments };
  return <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (!busy && !uploading) save(value, true); }}>
    <label className="flex flex-col gap-2 text-[14px] font-medium">{t("matters.titleField")}<input required className={field} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="flex flex-col gap-2 text-[14px] font-medium">{t("matters.instructions")}<textarea required className={field} rows={6} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <label className="flex flex-col gap-2 text-[14px] font-medium">{t("matters.bot")}<select required className={field} value={botId} onChange={(event) => setBotId(event.target.value)}><option value="">{t("matters.bot")}</option>{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
    {!bots.length && <p className="text-[13px] text-ink-secondary">{t("matters.noBots")}</p>}
    <AttachmentPicker files={attachments} onChange={setAttachments} uploading={uploading} onUploading={setUploading} onError={setError} />
    {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || uploading || !title.trim() || !description.trim() || !botId} className="ui-button ui-button-primary">{t("matters.submit")}</button><button type="button" disabled={busy || uploading} className="ui-button" onClick={() => save(value, false)}>{t("matters.saveDraft")}</button></div>
  </form>;
}

function FileList({ files }: { files: MatterFile[] }) {
  if (!files.length) return null;
  return <section><h2 className="mb-2 text-[14px] font-medium">{t("matters.attachments")}</h2><ul className="flex flex-col gap-1 text-[13px] text-ink-secondary">{files.map((file) => <li key={file.id}>{file.name}</li>)}</ul></section>;
}

function AttachmentPicker({ files, onChange, uploading, onUploading, onError }: { files: MatterFile[]; onChange: (files: MatterFile[]) => void; uploading: boolean; onUploading: (value: boolean) => void; onError: (value: string | null) => void }) {
  const mounted = useRef(false);
  const currentFiles = useRef(files);
  currentFiles.current = files;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const file of currentFiles.current) void discardFile(file); };
  }, []);
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []); event.target.value = "";
    if (!picked.length) return;
    onUploading(true); onError(null);
    const added: MatterFile[] = [];
    const errors: string[] = [];
    for (const file of picked) {
      try {
        const saved = isImageFile(file) ? await imageAttachmentFromFile(file) : await fileAttachmentFromFile(file);
        if (saved) added.push(saved); else errors.push(file.name);
      } catch (cause) { errors.push(`${file.name}: ${cause instanceof Error ? cause.message : t("matters.error")}`); }
    }
    if (!mounted.current) { for (const file of added) void discardFile(file); return; }
    currentFiles.current = [...currentFiles.current, ...added];
    onChange(currentFiles.current);
    if (errors.length) onError(errors.join("; "));
    onUploading(false);
  };
  return <section className="flex flex-col gap-2"><label className="text-[14px] font-medium">{t("matters.attachments")}<input type="file" multiple disabled={uploading} onChange={(event) => void upload(event)} className="mt-2 block w-full text-[13px] text-ink-secondary file:mr-3 file:rounded-lg file:border file:border-hairline file:bg-card file:px-3 file:py-1.5 file:text-ink" /></label>
    <p className="text-[12px] text-ink-secondary">{uploading ? t("matters.uploading") : t("matters.filesHelp")}</p>
    {files.length > 0 && <ul className="flex flex-col gap-1">{files.map((file) => <li key={file.id} className="flex items-center gap-2 text-[13px]"><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" aria-label={`${t("matters.removeFile")}: ${file.name}`} className="rounded p-1 text-ink-secondary hover:bg-raised" onClick={() => { const remaining = files.filter((candidate) => candidate.id !== file.id); currentFiles.current = remaining; onChange(remaining); void discardFile(file); }}><X size={15} /></button></li>)}</ul>}
  </section>;
}
