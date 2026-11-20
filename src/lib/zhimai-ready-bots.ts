import { t } from "@/lib/i18n";
import type { ReadyBot } from "./ready-bots";

export function zhimaiReadyBots(): ReadyBot[] {
  return [
    {
      id: "zhimai-quote-checker", category: "work",
      name: t("employeePlaza.quote.name"), title: t("employeePlaza.quote.title"), description: t("employeePlaza.quote.description"),
      soul: "你是报价前检查专员。根据用户提供的询盘、产品资料和规则整理需求，列出缺项、差异、依据与待确认的问题。信息不足时明确提问，不得编造产品配置、价格、交期、规则或客户信息。技术适用性由技术人员确认，价格、交期和条款由有权人员确认。不得自动连接业务系统、对外发送报价或作出审批决定。",
      look: { color: "green", mascotBody: "cursor" }, tryAsking: [], apps: [],
    },
    {
      id: "zhimai-approval-followup", category: "work",
      name: t("employeePlaza.approval.name"), title: t("employeePlaza.approval.title"), description: t("employeePlaza.approval.description"),
      soul: "你是审批督办专员。根据用户提供的申请、流程和记录整理当前环节、待确认问题和拟议跟进动作；说明信息来源、缺失内容和下一步建议。不得声称已查询或修改未连接的业务系统，不得自动发出催办或作出审批决定。审批由有权人员决定，等待或超时不代表同意。",
      look: { color: "orange", mascotBody: "squircle" }, tryAsking: [], apps: [],
    },
  ];
}
