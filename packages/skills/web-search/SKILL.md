---
name: web-search
description: Search public internet sources through Agent Reach and answer from returned evidence. Use when the user asks to search, research, verify, or inspect a public URL or online topic.
---

# 网络搜索

根据用户目标、对话上下文与可用数据源理解搜索意图，不使用预制关键词条件表代替模型判断。

先调用 `agent-reach-tool.search_web` 获取真实结果，再基于结果回答。默认请求 5 条结果。只引用返回结果中实际存在的 URL；搜索失败、来源不足或需要登录时必须明确说明。

`answer` 必须使用清晰、简洁的 Markdown：先用一段话给出结论，再用 `## 主要动态` 标题和项目符号逐条整理事实。每条以加粗的事件名称开头，日期紧随其后，说明控制在一至两句。不要在 `answer` 中重复输出来源 URL。`sources` 中每项必须包含搜索结果里的真实文章标题 `title` 和对应 `url`，由 Runtime 统一渲染为可点击来源卡片。

执行前阅读 [数据源路由](references/source-routing.md) 与 [认证边界](references/authentication-boundaries.md)。
