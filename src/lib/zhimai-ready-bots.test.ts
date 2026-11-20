import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { READY_BOTS, readyBot, readyBotTemplate } from "./ready-bots";
import { zhimaiReadyBots } from "./zhimai-ready-bots";
import type { NewBotDefaults } from "../../shared/new-bot-defaults";

afterEach(() => setLocale("en"));

describe("Zhimai employee templates", () => {
  it("resolves each template through the existing create flow without changing the upstream gallery", () => {
    setLocale("zh");
    const presets = zhimaiReadyBots();
    expect(presets.map((preset) => preset.name)).toEqual(["报价检查专员", "审批督办专员"]);
    for (const preset of presets) {
      expect(readyBot(preset.id)).toEqual(preset);
      expect(READY_BOTS.some((other) => other.id === preset.id)).toBe(false);
      expect(preset.apps).toEqual([]);
    }
  });

  it("keeps the user's model and permissions while applying the chosen role", () => {
    const defaults: NewBotDefaults = { profile: { name: "Default", modelSelection: { instanceId: "test", model: "example" }, approvalMode: "ask", computer: "off", color: "green" }, memory: {}, skills: [], routines: [] };
    const role = readyBot("zhimai-approval-followup")!;
    const created = readyBotTemplate(defaults, role);
    expect(created.profile.name).toBe(role.name);
    expect(created.profile.soul).toContain("不得自动发出催办或作出审批决定");
    expect(created.profile).toMatchObject({ modelSelection: defaults.profile.modelSelection, approvalMode: "ask", computer: "off" });
    expect(created.skills).toEqual([]);
    expect(created.routines).toEqual([]);
  });
});
