# Unified Task Entry Phase 0 Field Map

> 基线：2026-08-12。本文只记录迁移前真实调用链，作为后续验收证据。

| 用户表面 | Swift | Runtime JSON / CLI | SQLite |
|---|---|---|---|
| 员工私聊 | `ConversationStore.employeeID` + `conversation_<employee>_primary` | `chat-send --conversation-id --employee-id --input` | `conversations.agent_id`、`messages.conversation_id` |
| 单员工工作 | `TaskStore` / `TaskRun.agentID` | `chat-send` intent=`task` 或兼容 `run-task` | `tasks.agent_id`、`run_snapshots`、`actions`、`deliverables` |
| 多员工工作 | `ScenarioStore` | `business-flow-plan/start/continue` | `scenario_*`、`business_flows`、Root/Child `tasks`、`work_orders`、`handoffs` |
| 工作库 | `EmployeeChatWorkspaceView` | `list-tasks` + `business-flow-list` | Task/Flow 投影，UI 仍按 employee conversation 组织 |
| 办公室 | `OfficeWorkspaceView` | `usage-summary` | `model_calls` 聚合；无工作 Composer |

失败基线：办公室无统一输入；`TaskStore.confirmAndRun` 明确要求先从员工对话选择员工；通讯录“开始对话”是主操作；不存在 Task Thread/Proposal 契约和持久化表。

兼容不变量：现有 `conversation_id + employee_id` 所有权校验、Task/Action 状态、Scenario/Flow 历史和所有 Migration 不得被覆盖或回填伪造。
