# AI Employee OS Unified Task Entry Implementation Plan v1.0

> 状态：Confirmed / Task Room implemented（2026-08-12）
> 目标规范：`docs/AI Employee OS Unified Task Entry & Orchestration Specification v1.0.md`
> 执行原则：先冻结契约与数据，再实现 Runtime，最后切换客户端；不得在现有员工聊天或隐藏 Scenario 表单上添加兼容分支伪装统一入口。

## 1. 完成定义

用户能在办公室唯一 Composer 输入工作目标，经必要追问和一次确认，启动单员工或多员工 canonical Task；随后只在 Task Thread 中持续交互、审批、恢复和取得交付物。通讯录不再承担默认聊天导航，历史 Business Flow 仍可访问和恢复。

## 2. Phase 0：冻结事实与基线

### 工作

1. 记录现有 Swift `ConversationStore/TaskStore/ScenarioStore`、Runtime `chat-send/run-task/business-flow-*`、SQLite Conversation/Task/Flow 字段映射。
2. 建立失败基线：办公室无 Composer、工作库按员工会话分组、通讯录主按钮为开始对话、无 Task Proposal。
3. 保存历史 Scenario/Flow 数据库 fixture，作为后续 Migration/恢复门禁。

### 验收

- 形成 Swift → Runtime JSON → SQLite 对齐表；
- 现有 `./scripts/check.sh` 全绿；
- 不修改生产 Schema 或运行行为。

## 3. Phase 1：契约与 additive Migration

### 工作

1. 新增机器契约：
   - `task-proposal.schema.json`
   - `validated-task-proposal.schema.json`
   - `task-thread.schema.json`
   - 正反例 fixture。
2. 新增 append-only Migration：
   - `task_threads`
   - `task_thread_messages`
   - `task_proposals`
   - `task_thread_task_bindings`
3. 为多员工新入口解除对 ScenarioDefinition 的强制依赖，但保留历史外键与旧命令兼容；优先新增 nullable/source discriminator，不修改已发布 Migration。
4. 定义唯一键：thread message sequence、proposal revision/hash、confirmation idempotency、thread↔root task current binding。

### 验收

- fresh install、重复启动、Migration replay、外键、JSON 和唯一约束测试通过；
- 未知字段/枚举/Schema 拒绝；
- 历史 Scenario/Business Flow fixture 无损读取与恢复；
- 尚无客户端入口。

## 4. Phase 2：Proposal Worker 与 Rust Validator

### 工作

1. Python 新增 `task_proposal_worker`，输入用户目标、Thread 已确认输入和经过裁剪的 employee capability cards，只返回 Task Proposal。
2. 不使用关键词/regex 判断单多员工；建立代表性 eval dataset。
3. Rust 新增 Proposal validator：
   - active employee 与 readiness 硬过滤；
   - capability 匹配、DAG/上限、Acceptance、预算和权限差异；
   - missing input gate；
   - revision/hash/expiry。
4. 顶层协调逻辑不能读取员工私人 Conversation/Memory，不能生成安全 ID 或调用 Tool。

### 验收

- eval 至少覆盖：闲聊、简单单员工、必要多员工、不必要拆分、缺失输入、不可用员工、循环依赖、越权资源和 Prompt injection；
- Fake Decision 正反例确定性通过；
- 模型返回无法直接产生 Task/Action/ToolExecution；
- Secret 环境边界测试通过。

## 5. Phase 3：Task Thread 与物化 API

### 工作

1. 实现 `task-thread-create/list/get/message`。
2. 实现 `task-proposal-generate`：保存用户输入、调用 Worker、验证并原子保存 proposal revision。
3. 实现 `task-proposal-confirm`：CAS 校验 revision/hash/expiry/readiness，幂等物化：
   - 单员工 → canonical Task + Run Kernel binding；
   - 多员工 → Root/Child Task + WorkOrder + Dependency + Handoff + Root output binding。
4. 实现 `task-thread-continue`，统一 ask_user、approval projection、失败决策和交付追问；底层仍调用现有合法 continuation/resolve/cancel 路径。
5. Root/Task 状态投影回 Thread，不新增执行状态机。

### 验收

- 重复确认只生成一套执行事实；
- readiness 漂移使旧 proposal 失效；
- crash points 覆盖 proposal 保存前后、物化事务、Child 启动、Handoff 前后；
- `result_unknown` 不自动重放；
- Task Thread 不含私人 Conversation/Memory/Secret/完整 ToolResult。

## 6. Phase 4：macOS 统一入口与 Task Thread

### 工作

1. 办公室顶部增加唯一 `TaskComposer`；用量概览下移。
2. 新建 `TaskThreadStore` 和窄 `RuntimeService` 调用；不让 `ConversationStore` 承担新入口。
3. 工作库 Sidebar 从员工会话改为 Task Thread；详情时间线展示 proposal、clarification、confirmation、canonical execution projection 和 Deliverable。
4. Proposal 确认卡只展示用户可理解字段；权限、预算和高风险动作明确。
5. 通讯录：Profile/能力为主；「聊聊」降为次级菜单；「交给他工作」将 preferred employee 带到统一 Composer。
6. 员工私人聊天继续隔离，但不再成为工作库默认容器。
7. 历史 Flow 以 legacy Task Thread/只读运行投影进入工作库，不恢复场景库导航。

### 验收

- 启动 App 后第一工作主锚点是办公室 Composer；
- 用户无需先选择员工；
- 单/多员工 proposal、缺失输入和确认交互可通过键盘完成；
- 切换 Thread 不串消息、streaming、approval 或 Deliverable；
- 通讯录没有醒目的默认“开始对话”主按钮；
- VoiceOver label、Focus、Reduce Motion、窄窗口通过；
- 真实 packaged App 截图/辅助功能树确认，不以 Swift 编译代替。

## 7. Phase 5：切换、兼容与清理

### 工作

1. 将 App 默认工作入口和 Command Palette 新建工作指向办公室 Composer。
2. 删除仅服务旧“员工会话即工作”主路径的客户端耦合；保留私人聊天所需最小代码。
3. `ScenarioLibraryWorkspaceView`、Scenario 创建/提案 Store 方法若已无客户端调用，先通过引用证明后删除 UI 源；Runtime 兼容 API 与数据继续保留。
4. 更新 Main Interface Spec、API Spec、Unified Data Model、Generic Runtime Spec、架构总览、README 和 Release note。
5. 增加 telemetry：proposal generated/invalidated/confirmed、materialization type、missing input、Thread recovery；不记录 Prompt、Secret 或敏感正文。

### 验收

- 全仓无产品路径能打开 Scenario Builder；
- 历史 Flow list/status/continue/cancel/resolve 保持；
- 新装和升级用户默认进入办公室统一入口；
- 无第二套 Task/Action/Event/Approval/Audit 状态。

## 8. 验证矩阵

```text
./scripts/check.sh
```

在现有门禁基础上新增：

- contract fixtures：Proposal/Thread 正反例；
- Rust：validator、CAS、idempotency、Migration、materialization、recovery；
- Python：proposal schema/eval/provider error；
- Swift：TaskThread decode、selection isolation、confirmation state、legacy Flow projection；
- E2E：单员工只读、单员工文件写入审批、多员工研究→文档、缺失输入、取消、崩溃恢复；
- packaged App：办公室 Composer、工作库 Task Thread、通讯录次级聊天、无场景库。

真实 DeepSeek/外部 Tool 测试与 Fake Decision 分开报告；任何未运行项必须明确。

## 9. 停止条件

出现以下任一情况暂停并请求决策：

- 必须修改已发布 Migration；
- Task Thread 需要复制员工私人 Conversation/Memory 才能运行；
- Python/Swift 必须直接创建 Task、调用 Tool 或扩大权限；
- 多员工物化无法复用 ADR-034 Root/Child/WorkOrder/Handoff；
- 工作区出现与上述核心文件不可安全合并的重叠漂移；
- 需要提前实现 Task Room Revision 之外的社交群聊、并行、递归委派、Runbook Builder 或自动化触发。

## 10. 实施顺序与提交边界

确认本计划后按 Phase 0 → 1 → 2 → 3 → 4 → 5 执行。每阶段独立验证；代码提交保持单一目的，禁止 `git add .`。在 Phase 3 Runtime 契约通过前不切换客户端，在 Phase 4 真实 App 验证前不删除旧 UI 源。

## 11. Task Room Revision 实施计划

该 Revision 复用已完成的统一入口和多员工 Runtime，不重做 Proposal/Business Flow Kernel。确认后按 R1 → R4 实施。

### R1：Timeline 契约与字段映射

1. 定义 `task-thread-timeline` 输出和 Swift DTO，Timeline Item 使用稳定 canonical ID 与单调 sequence。
2. 建立 `TaskThreadMessage / Task / Run / Action / Approval / Handoff / Deliverable / Artifact → Timeline Item` 字段映射。
3. `role=agent` 必须绑定 Thread 内 Task、Run 和 Agent；员工私人 Conversation Message 永不进入投影。
4. 优先从现有表和 Event 重建；只有无法稳定保存用户可读 Agent 输出时，才提出 additive Migration，禁止修改 Migration 016。

验收：正反契约、跨员工归属、越权引用、稳定 ID、重复读取无重复、Secret/Prompt/完整 ToolResult 不泄漏。

### R2：Rust Task Room Projection

1. 在 Rust 聚合 Thread 消息和 canonical 执行事件，按稳定顺序输出。
2. 将 Agent Run 用户可读输出、Tool activity、Approval、Handoff 和 Deliverable 转成不同 Timeline kind。
3. 提供 Task Room continuation：普通补充、ask_user 回答、Approval resolve、失败恢复和 `@员工` 路由提示继续调用既有合法 Runtime 路径。
4. Mention 非当前 Assignee 或要求改变依赖/范围时，不直接启动员工；返回需要重编排的确定性结果。

验收：真实研究→写作 Flow 的两名员工身份、审批、Handoff 和最终 Artifact 顺序正确；重启后可继续；`result_unknown` 不被聊天消息掩盖。

### R3：macOS 群聊式 Task Workspace

1. 将现有 `TaskThreadWorkspaceView` 的消息块和 WorkOrder 列表重构为群聊 Timeline。
2. 标题区显示参与员工和当前状态；用户右侧、员工左侧、系统事件/任务卡使用独立语义。
3. Approval 卡原位批准/拒绝；Handoff、Deliverable、错误和恢复均在原 Timeline 操作。
4. 增加唯一 Composer 和 Mention picker；不复用 `ConversationStore`，不创建群 Conversation。
5. 增加右侧 Inspector/Workspace，展示 WorkOrder 与 verified Artifact，不恢复 Scenario Builder。

验收：键盘、VoiceOver、Reduce Motion、窄窗口、长消息、大量 Timeline Item、切换 Task 和待审批恢复通过；员工身份和 Runtime 状态不可混淆。

### R4：真实闭环与清理

1. Fake 门禁覆盖单员工、多员工、等待输入、拒绝审批、失败、恢复和 Mention 越权。
2. 真实 Provider + `web-search → Handoff → local-file-operations` 在 packaged App 完成一次 Task Room 闭环。
3. 验证工作库 Row 最近事件、Task Room Timeline、Inspector、Workspace 和最终交付一致。
4. 删除被 Task Room 取代且确认无引用的临时 WorkOrder 展示，不删除私人聊天和历史 Runtime 兼容能力。

验收：`./scripts/check.sh` 通过；打包 App 中用户无需进入任何员工私聊即可看到两名员工回复、真实活动、审批、交接和最终文件。

### Revision 停止条件

- 必须把 Task Room 建成多人 `Conversation` 才能继续；
- 无法从 canonical Runtime 事实生成稳定 Timeline；
- 需要让 Swift/Python 自行判定 Tool、Approval、Handoff 或完成状态；
- Mention 必须绕过 WorkOrder/Capability/Permission；
- 需要修改已发布 Migration 或共享私人 Employee Memory。
