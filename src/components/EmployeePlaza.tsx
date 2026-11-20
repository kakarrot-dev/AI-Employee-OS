import { useState } from "react";
import { ArrowLeft, Search, UsersRound } from "lucide-react";
import { t } from "@/lib/i18n";
import { useShowThreads } from "@/lib/thread-preferences";
import { useStore } from "@/state/store";
import { openBot } from "@/state/thread-navigation";
import { BotAvatar } from "./Avatar";
import { useCaptionChrome } from "./DesktopCapabilities";

export function EmployeePlaza() {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const { dragProps } = useCaptionChrome();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const employees = state.bots.filter((bot) => !bot.hidden);
  const words = query.trim().toLocaleLowerCase();
  const filtered = employees.filter((entry) => [entry.name, entry.title, entry.description].some((value) => value.toLocaleLowerCase().includes(words)));
  const employee = employees.find((entry) => entry.id === selected);

  return <main className="relative flex h-full min-w-0 flex-1 flex-col bg-app text-ink">
    <header {...dragProps} className="flex shrink-0 items-center gap-2.5 border-b border-hairline/40 px-6 py-4 max-md:pl-12">
      {employee ? <button type="button" aria-label={t("employeePlaza.back")} className="rounded-lg p-1 text-ink-secondary hover:bg-raised" onClick={() => setSelected(null)}><ArrowLeft size={18} /></button> : <UsersRound size={18} className="text-ink-secondary" aria-hidden="true" />}
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{employee ? employee.name : t("employeePlaza.title")}</h1>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-6">
      {employee ? <section className="flex flex-col gap-5">
        <div className="flex items-center gap-4"><BotAvatar bot={employee} size={56} animated={false} label={employee.name} /><div className="min-w-0"><h2 className="break-words text-[18px] font-semibold">{employee.name}</h2><p className="mt-1 text-[13px] text-ink-secondary">{employee.title}</p></div></div>
        <section><h3 className="mb-2 text-[13px] font-medium">{t("employeePlaza.description")}</h3><p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-ink-secondary">{employee.description || t("employeePlaza.noDescription")}</p></section>
        <button type="button" className="ui-button ui-button-primary self-start" onClick={() => openBot(dispatch, employee, showThreads)}>{t("employeePlaza.start")}</button>
      </section> : <>
        <label className="flex items-center gap-2 rounded-lg border border-hairline bg-app px-3 text-ink-secondary focus-within:border-focus"><Search size={16} aria-hidden="true" /><input type="search" className="min-w-0 flex-1 bg-transparent py-2 text-[14px] text-ink outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("employeePlaza.search")} aria-label={t("employeePlaza.search")} /></label>
        <h2 className="text-[14px] font-medium">{t("employeePlaza.members")}</h2>
        {filtered.length === 0 ? <p className="py-5 text-[14px] text-ink-secondary">{t(words ? "employeePlaza.noMatches" : "employeePlaza.empty")}</p> :
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{filtered.map((entry) => <article key={entry.id} className="flex min-w-0 flex-col rounded-2xl border border-hairline/40 bg-card p-4">
            <div className="flex items-center gap-3"><BotAvatar bot={entry} size={40} animated={false} label={entry.name} /><div className="min-w-0"><h3 className="truncate text-[14px] font-medium">{entry.name}</h3><p className="truncate text-[12px] text-ink-secondary">{entry.title}</p></div></div>
            <p className="mt-3 min-h-[3.75em] whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-ink-secondary">{entry.description || t("employeePlaza.noDescription")}</p>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" aria-label={t("employeePlaza.detailsNamed", { name: entry.name })} className="ui-button" onClick={() => setSelected(entry.id)}>{t("employeePlaza.details")}</button><button type="button" className="ui-button ui-button-primary" onClick={() => openBot(dispatch, entry, showThreads)}>{t("employeePlaza.start")}</button></div>
          </article>)}</div>}
      </>}
    </div></div>
  </main>;
}
