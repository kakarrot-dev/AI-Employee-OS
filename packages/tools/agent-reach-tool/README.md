# Agent Reach 网络搜索 Tool

面向人的说明见同目录 [TOOL.md](./TOOL.md)。

该 Package 将 Agent Reach 当前选择的 Exa 搜索路径接入 Rust `ToolExecutor`。

- 模型只能提交 `query` 与 1–10 的 `num_results`，不能提交 shell 命令。
- Runtime 固定调用 `mcporter call exa.web_search_exa`，并使用 JSON 参数传递，避免命令注入。
- 执行需要 `network.search` 权限，查询和结果按现有 Tool 审计边界处理。
- Agent Reach 是能力路由层，不是搜索实现；实际结果由它配置的 Exa 后端返回。
