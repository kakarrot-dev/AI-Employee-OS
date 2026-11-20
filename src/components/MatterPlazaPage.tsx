import { ArrowRight, LayoutGrid } from "lucide-react";
import { t } from "@/lib/i18n";
import { useStore } from "@/state/store";
import { useCaptionChrome } from "./DesktopCapabilities";

export function MatterPlazaPage() {
  const { dispatch } = useStore();
  const { dragProps } = useCaptionChrome();
  return <main className="relative flex h-full min-w-0 flex-1 flex-col bg-app text-ink">
    <header {...dragProps} className="flex shrink-0 items-center gap-2.5 border-b border-hairline/40 px-6 py-4 max-md:pl-12">
      <LayoutGrid size={18} className="text-ink-secondary" aria-hidden="true" />
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{t("matterPlaza.title")}</h1>
      <button type="button" className="ui-button" onClick={() => dispatch({ type: "showMatters" })}>{t("matterPlaza.viewMatters")}</button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <section className="rounded-xl border border-hairline bg-card p-5">
          <h2 className="text-[15px] font-semibold">{t("matterPlaza.generic")}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-secondary">{t("matterPlaza.description")}</p>
          <button type="button" className="ui-button ui-button-primary mt-4" onClick={() => dispatch({ type: "showMatters", start: true })}>
            {t("matterPlaza.start")}<ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>
      </div>
    </div>
  </main>;
}
