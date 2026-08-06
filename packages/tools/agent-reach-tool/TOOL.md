# Agent Reach 网络搜索

通过 Agent Reach 当前选定的 Exa 后端，搜索公开网页并返回带来源的结果。

## 能做什么

- 按查询文本检索公开网页
- 指定返回条数（1–10）
- 在工具库查看各数据源的脱敏诊断状态

## 不能做什么

- 提交任意 shell 命令
- Computer Use 或任意站点抓取
- 读取、展示 Cookie / Token / API Key 原文
- 在未配置可用搜索后端时伪造结果

## 运行方式

Runtime 固定调用 `mcporter call exa.web_search_exa`，以 JSON 传参，避免命令注入。Agent Reach 只做能力路由，真实结果来自已配置的 Exa 后端。

## 前置条件

- 本机可用 `mcporter` 与 Agent Reach 所选 Exa 配置
- 需要 `network.search` 权限

## 审计原则

查询文本按敏感字段处理；数据源状态只展示脱敏诊断，不暴露凭据原文。
