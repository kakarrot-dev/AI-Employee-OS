# Claude Code 项目说明

本仓库所有 Agent 统一遵循根目录 [AGENTS.md](./AGENTS.md)。

## 开始工作前

1. 阅读 [AGENTS.md](./AGENTS.md)（项目目标、架构边界、状态/安全不变量、验证与 Git 规则）。
2. 按任务读取相关 canonical 文档（事实源优先级见 AGENTS.md）。
3. 以 AGENTS.md 的「主验证路径」与「进行中」为准；[README.md](./README.md) / [README.zh-CN.md](./README.zh-CN.md) 为对外摘要，`docs/架构总览.md` 与部分专题文档可能滞后。

当前主验证工作路径是 `local-file-operations`（非 `structured-summary` / 非 Manifest 1.0 的 `prd-generation`）。不要把已移出 bootstrap 或仅作浏览的旧 Skill 当成默认执行路径。

当前产品入口以办公室统一输入框为主：模型只能生成并校验 Task Proposal，确认后由 Rust Runtime 创建 Task Thread，并在任务协作群中投影参与员工、回复、审批、交接、进度和交付。通讯录私聊是次级入口；工作库只展示当前 Task Thread；私聊和工作记录的历史统一进入归档页，且继续遵循各自的 Runtime 删除语义。场景库只作为高级 Runbook / 自动化能力，不得恢复为默认入口。

不要复制或改写 AGENTS.md 中的状态、安全、验证与 Git 规则，以免产生配置漂移。
