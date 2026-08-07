# AI Employee OS Multi-Employee Business Flow Phase 1 Implementation Plan v1.0

> 文档类型：可执行实施计划
> 状态：Implemented / Release Candidate（2026-08-07）；Phase 1A → 1B → 1C → 1D 已实施并通过本地确定性门禁。真实 DeepSeek / Exa 多员工端到端仍属于明确未验证边界。
> 日期：2026-08-07
> 目标规范：`docs/AI Employee OS Multi-Employee Business Flow Specification v1.0.md`
> 前置决策：ADR-034 Accepted；ADR-017 Superseded
> 实施范围：Phase 1 场景定义、AI/手工草案、用户确认和串行 DAG 执行，不包含并行及运行中自主重排

## 1. 交付目标

交付独立「场景库（暂定）」以及可从 CLI 和 macOS 使用的多员工业务流。用户可以手工配置场景，也可以让受限 AI 场景协调器生成草案；确认后的场景以不可变版本启动运行：

```text
User goal ──> Manual Draft or AI Coordinator Proposal
        |
        v
Rust validates ──> User confirms Scenario Version
        |
        v
Root Task / Business Flow
        |
        v
WorkOrder A / Child Task A / Agent Run A
        |
 verified Deliverable + accepted Handoff
        v
WorkOrder B / Child Task B / Agent Run B
        |
 verified Deliverable + accepted Handoff
        v
Finalization WorkOrder / Coordinator Child Task
        |
        v
Root verified Deliverable / Root Task succeeded
```

Phase 1 固定并发 1，允许包含分支的有向无环节点图；Rust 按依赖满足后的稳定顺序执行。AI 可以建议员工和节点，但用户必须确认最终分配、权限、预算和验收。Root Task 不创建 AgentRun，每个节点的 Child Task 复用现有 Generic Run Kernel。私人 Conversation、Employee Memory、权限和 Tool surface 继续隔离。

## 2. 明确不做

- 不实现并行、Reviewer 自动返工、运行中自主增删节点、无需确认的智能分配或递归委派。
- 不修改 Python Worker 协议，不增加 Worker-to-Worker 调用。
- 不实现自由画布；首版使用节点列表和依赖选择器。
- 不把 Business Flow 写入员工私人 Conversation 时间线。
- 不新增 WorkOrder status、第二套 Task/Action/Event/Approval/Audit 状态源。
- 不引入 LangGraph、Deep Agents、消息队列、Cloud Sync 或 Marketplace。
- 不自动迁移历史 Task/Conversation，不恢复或扩展 Golden Path。
- 不把真实外部网络和收费模型调用作为无条件 CI 门禁。

## 3. 实施前工作区与变更所有权

当前工作区已有未提交的 Swift、Rust、脚本和设计文档修改，其中以下目标文件存在重叠修改：

- `runtime/rust-core/src/main.rs`
- `apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift`
- `apps/macos/AIEmployee/Tests/ClientModelChecks.swift`
- `scripts/check.sh` 的直接依赖脚本集合

开始实施前必须执行：

```bash
git status --short --branch -uall
git diff -- runtime/rust-core/src/main.rs \
  apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift \
  apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift \
  apps/macos/AIEmployee/Tests/ClientModelChecks.swift
./scripts/check.sh
```

规则：

- 保留当前聊天隔离、停止回复、知识库和界面改动，不回退、不覆盖。
- 不使用 `git add .`；每个提交只暂存本阶段明确路径。
- 若实施前出现 Migration 014，使用下一个可用编号并同步文档/测试；禁止重写已发布 Migration。
- 基线失败必须记录原始错误和范围，不把既有失败归因于本计划。

## 4. 全局不变量

- Root/Child Task 状态只允许 `pending | running | succeeded | failed | cancelled`。
- Action 状态只允许 `pending | running | succeeded | failed | blocked | result_unknown | cancelled`。
- Root Task 不创建 AgentRun；Child Task 一对一属于 WorkOrder 并使用 Generic Run Kernel。
- WorkOrder UI 状态只从 Child Task/Run/Action/Handoff 派生。
- 所有 Tool 调用经过 Rust ToolExecutor；Python 不执行 Tool、不读 SQLite。
- 下游只有在上游 Child succeeded、Deliverable verified、Handoff accepted 后才能启动。
- Handoff 不复制 Artifact 正文、Conversation、Memory、完整 Context 或未引用 ToolResult。
- Secret 不进入参数 JSON、SQLite、日志、Event、Audit、Memory、Artifact 或 Context Reference。
- `result_unknown` 阻止依赖链，禁止自动重放。
- Flow 启动要求显式 Token、Tool round 和 elapsed budget；缺失时拒绝。
- `business-flow-plan` 无写入、无模型调用、无 Tool 副作用。

## 5. 阶段与提交策略

四个实施阶段均必须保持 `./scripts/check.sh` 绿色并可独立合并：

1. Contract + Storage Foundation：冻结机器边界和可重放持久化；产品入口不变。
2. Runtime CLI Vertical Slice：提供可用的本地串行 DAG CLI；`A → B → Finalization` 作为标准验收样例。
3. macOS Scenario Library：增加独立主导航、场景编辑与运行工作区。
4. Recovery/Eval/Docs Gate：完成崩溃、取消、隔离、E2E 和下游文档同步，形成 Phase 1 RC。

每阶段一个单一目的提交；任一阶段未完成时，之前阶段仍安全可用，后续阶段不成为前一阶段正确性的前提。

---

## 6. Phase 1A：Contract + Storage Foundation

### 6.1 独立价值

建立可验证、可迁移、默认拒绝的机器契约和数据关系；现有聊天与单员工 Runtime 完全不变。即使后续 CLI/UI 暂停，新表和 Schema 也可作为只读、无入口的安全基础合并。

### 6.2 Canonical 文档同步

修改：

- `docs/AI Employee OS Unified Data Model v1.0.md`
- `docs/AI Employee OS MVP API & Interface Specification v1.0.md`
- `docs/AI Employee OS Generic Agent Runtime Specification v1.0.md`
- `docs/AI Employee OS Agent Runtime 深度设计 v1.0.md`
- `docs/AI Employee OS Security & Permission Architecture v1.0.md`
- `docs/AI Employee OS Memory Engineering Guide v1.0.md`
- `docs/AI Employee OS Observability & Evaluation Architecture v1.0.md`
- `docs/架构总览.md`
- `AGENTS.md`

动作：

1. 将本 Spec 的 Root/Child Task、WorkOrder、Handoff、SharedContextRef、权限、恢复和非目标写入对应事实源。
2. 明确 `business_flows` 与 `work_orders` 不保存 status；Root/Child 使用 canonical Task 状态。
3. 明确 Phase 1 目标能力尚未实现，直到 Phase 1D 验收前使用“目标/迁移中”措辞。
4. 保留 Conversation、Employee Memory 和 Capability Set 现有契约，不建立协作例外。

验收：文档中不存在“员工共享私人 Conversation”“Python 调用员工”“WorkOrder 独立状态机”或“Business Flow 自动获得全局权限”。

### 6.3 Machine Contracts

新增：

- `contracts/scenario-proposal.schema.json`
- `contracts/scenario-definition.schema.json`
- `contracts/scenario-validation.schema.json`
- `contracts/business-flow-plan.schema.json`
- `contracts/business-flow-status.schema.json`
- `contracts/work-order.schema.json`
- `contracts/handoff.schema.json`
- `contracts/shared-context-ref.schema.json`
- `contracts/examples/business-flow-plan.valid.json`
- `contracts/examples/business-flow-status.valid.json`
- `contracts/examples/work-order.valid.json`
- `contracts/examples/handoff.valid.json`
- `contracts/examples/shared-context-ref.valid.json`

新增 invalid fixtures：

- `contracts/fixtures/business-flow-plan.invalid-version.json`
- `contracts/fixtures/business-flow-plan.invalid-extra-field.json`
- `contracts/fixtures/business-flow-plan.invalid-budget.json`
- `contracts/fixtures/business-flow-plan.invalid-dependency-cycle.json`
- `contracts/fixtures/work-order.invalid-assignee.json`
- `contracts/fixtures/work-order.invalid-cross-flow-dependency.json`
- `contracts/fixtures/handoff.invalid-unverified-deliverable.json`
- `contracts/fixtures/handoff.invalid-target-grant.json`
- `contracts/fixtures/shared-context-ref.invalid-hash.json`
- `contracts/fixtures/shared-context-ref.invalid-sensitivity.json`

修改：

- `scripts/check_contracts.py`

契约规则：

- `schema_version` 固定 `1.0.0`；
- `additionalProperties: false`；
- ID、角色、failure policy、sensitivity、source type、budget、criterion 和引用数量按 Spec 约束；
- Projection status 只允许第 6.4 节派生值，不能作为 plan/start 输入；
- 结构性 invalid fixtures 必须在对应 JSON Pointer 失败，不能只证明 JSON 语法错误；依赖环、员工状态、跨 Flow 引用、Deliverable 验证和授权等语义 fixtures 由 Rust Domain/Service 测试及 `check_business_flow_runtime.py` 读取并断言稳定错误码。

### 6.4 Migration 014

新增：

- `storage/migrations/014_multi_employee_business_flows.sql`

修改：

- `runtime/rust-core/src/storage.rs`

Migration 必须：

1. `ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT CHECK (parent_task_id IS NULL OR parent_task_id != id)`。
2. 创建 `scenario_definitions`、`scenario_versions`、`scenario_nodes`、`scenario_edges`、`business_flows`、`business_flow_participants`、`work_orders`、`work_order_dependencies`、`handoffs`、`shared_context_refs`。
3. 使用 CHECK 固定 role、failure policy、handoff acceptance、source type、sensitivity、revision 和 required boolean。
4. 使用 UNIQUE 固定 Root/Flow、Child/WorkOrder、Handoff source-target-deliverable、Flow/source/hash 幂等关系。
5. 创建 `tasks(parent_task_id,status,created_at)`、Flow Root、WorkOrder Flow/Child/Assignee、Dependency successor、Handoff target/acceptance、SharedRef Flow/source 索引。
6. 插入 `schema_migrations(version=14)`；重复 migrate 不改变既有行。

数据库测试追加到 `runtime/rust-core/src/storage.rs`：

- fresh install 创建全部表/列/索引；
- Migration 013 → 014 保留现有 28 张表数据；
- 重复 migrate；
- Child parent FK、self-parent 拒绝、重复 Child/WorkOrder 拒绝；
- CHECK/UNIQUE/foreign key 正反例；
- 删除 Root/Agent/Deliverable 时按 Spec 限制；
- 祖先环由应用层测试拒绝，不声称 SQLite CHECK 可验证任意深度环。

### 6.5 Rust Domain Types

新增：

- `runtime/rust-core/src/business_flow.rs`

修改：

- `runtime/rust-core/src/lib.rs`

`business_flow.rs` 只包含：

- `ScenarioProposal`、`ScenarioDefinition`、`ScenarioVersion`、`ScenarioNodeSpec`、`ScenarioEdgeSpec`；
- `BusinessFlowPlanRequest`、`NormalizedBusinessFlowPlan`、`FlowBudget`；
- `WorkOrderSpec`、`AcceptanceCriterion`、`SharedContextRefSpec`；
- `WorkOrderProjectionStatus`、`HandoffAcceptance`、`FailurePolicy`；
- 严格反序列化、hard-limit、DAG、预算和 ID 校验；
- canonical JSON 序列化与 SHA-256 `plan_hash`；
- 不访问数据库、不启动 Task、不调用模型或 Tool。

单测覆盖：未知枚举、额外字段、2/3 WorkOrder 结构、依赖环、预算缺失/不守恒、员工数 >5、WorkOrder >12、Plan Hash 稳定性和不同输入 Hash 变化。

### 6.6 Phase 1A 验证

```bash
python3 scripts/check_contracts.py
cargo test --workspace storage::tests
cargo test --workspace business_flow::tests
./scripts/check.sh
git diff --check
```

提交范围：只包含本 Phase 文档、contracts、Migration、`storage.rs`、`business_flow.rs`、`lib.rs`、`check_contracts.py`。

回滚：移除未发布入口和 Domain module；保留已应用 Migration 014 与空表，不删除或降级数据库。

---

## 7. Phase 1B：Runtime CLI Vertical Slice

### 7.1 独立价值

无需 Swift UI，即可通过本地 CLI 生成或手工保存场景、校验版本，并运行、查看、取消和恢复串行 DAG；这是 Phase 1 的首个完整可执行产品面。

### 7.2 Persistence / Scheduler Service

新增：

- `runtime/rust-core/src/business_flow_service.rs`
- `runtime/python-agent/app/scenario_coordinator.py`

修改：

- `runtime/rust-core/src/lib.rs`
- `runtime/rust-core/src/task_service.rs`
- `runtime/rust-core/src/event.rs`
- `runtime/rust-core/src/context_pipeline.rs`
- `runtime/rust-core/src/recovery.rs`

`business_flow_service.rs` 负责：

- `validate_scenario`：严格验证手工草案或 AI 提案，生成 canonical JSON 和 Hash；
- `save_scenario`：在用户确认后幂等保存不可变版本；
- `plan_flow`：读取 Agent/readiness/SharedRef 元数据，返回 normalized plan/hash/expiry，无写入；
- `start_flow`：Immediate transaction 按 Scenario Version 创建 Root/Flow/Participants、每节点 Child/WorkOrder、Dependencies/SharedRefs/Audit/Root Event；
- `project_flow`：从 Root/Child/Run/Action/Handoff 派生 WorkOrder projection；
- `advance_flow`：幂等选择唯一 ready WorkOrder，Phase 1 并发固定 1；
- `accept_handoff`：验证 Deliverable、Evidence、Artifact Hash、sensitivity、allowed agents、目标 input schema；
- `complete_root`：Finalization verified 后创建 `business_flow_outputs` Root 输出绑定并收敛 Root Task；
- `cancel_root`：向未终结 Child 写 cancellation request，取消未启动 Child；
- `recover_flows`：从 Child/Checkpoint/Handoff 唯一键恢复，不根据 Message/UI 推断。

`TaskService` 最小扩展：

- 新增 `create_child(id, parent_task_id, agent_id, input, now)`；
- 新增仅供 Rust Orchestrator 使用的 `start_root_without_snapshot`，只允许 `business_flows.root_task_id` 对应 Root；
- 新增 Root completion gate：所有必需 Child succeeded、Deliverable verified、Handoff accepted、Root 输出绑定已指向 Finalization verified Deliverable；
- 不放宽普通 Task 的 Snapshot/Evaluation 要求。

### 7.3 Generic Run 接入

修改：

- `runtime/rust-core/src/run.rs`
- `runtime/rust-core/src/main.rs`

接入规则：

1. `advance_flow` 返回 ready WorkOrder，而不是在 Service 内直接递归执行模型。
2. `main.rs` 使用 WorkOrder Assignee、goal、input refs、acceptance 和 budget 调用现有 Generic Run Kernel。
3. Child Task 使用现有 Capability Set Resolver；Worker 每次 `tool_call.skill_id` 继续由 Rust 验证。
4. Child 完成后调用 `accept_handoff` 和下一次 `advance_flow`；无 ready 工作时返回 current projection。
5. `continue-run`、`resolve-action-result` 和 Child completion 的公共尾部调用 `advance_parent_flow_if_any`。
6. Finalization 是 Coordinator 的普通 Child Task；Root 不调用 Python。

禁止在 `run.rs` 硬编码员工 ID、业务主题、Skill ID 或 A/B 文案。

`scenario_coordinator.py` 只接收 Rust 提供的目标、约束和最小员工能力目录，返回 `ScenarioProposal`。它不能访问 SQLite、调用 Tool、启动 Child Task、读取私人 Conversation/Memory 或生成安全字段。Rust 对提案执行与手工草案相同的 Schema、DAG、员工、Capability、权限和预算校验。

### 7.4 CLI

修改：

- `runtime/rust-core/src/main.rs`

新增命令：

```text
scenario-list
scenario-get
scenario-propose
scenario-validate
scenario-save
scenario-disable
business-flow-plan
business-flow-start
business-flow-status
business-flow-continue
```

复用：

```text
cancel-task --task-id <root_task_id>
recover-runtime
resolve-action-result
```

参数与响应严格按 Spec；stdout 只输出一个 JSON 或 NDJSON 流，诊断写 stderr。`scenario-propose`、`start` 和继续 Child Run 只从受控环境读取 `DEEPSEEK_API_KEY`；手工场景 CRUD、validate、plan 和 status 不要求 API Key。

幂等：

- start request 必须带 idempotency key；
- 同 key + 同 plan hash 返回原 Flow；
- 同 key + 不同 hash 返回 `flow_revision_conflict`；
- Handoff、Root Deliverable 和 Child scheduling 使用 UNIQUE + transaction 防重。

### 7.5 Events / Audit

修改：

- `contracts/runtime-event.schema.json`
- `contracts/examples/runtime-event.valid.json`（若现有示例为多文件，则新增独立 Flow 示例）
- `scripts/check_contracts.py`
- `runtime/rust-core/src/event.rs`

加入 Spec 第 18 节事件。Root Event payload 只含 ID、稳定 reason code、非敏感摘要和 Hash；Child Event 不复制进 Root payload。

Audit 写入 Flow 创建、分配、SharedRef、Handoff、取消传播、人工核验、Root 成功/失败。

### 7.6 Runtime 测试

新增：

- `scripts/check_business_flow_runtime.py`

Rust 单测放入 `business_flow_service.rs` 与现有相关模块，覆盖：

- plan 无写入、无模型/Tool；
- AI proposal 未确认前无 Scenario Version、Task、Action 或 ToolExecution；
- 手工草案与 AI 草案产生同一种 canonical Scenario Version；
- 修改已运行场景创建新版本，历史 Flow 的 scenario hash 不变；
- AI 提案中的依赖环、未知员工、越权 Context 和超预算在保存前拒绝；
- start 原子性与重复 key；
- A 未 verified 时 B 无 AgentRun；
- verified A → accepted Handoff → B ready；
- Handoff 缺 Evidence/Hash/授权时 rejected；
- Finalization 前 Root 不成功；
- Root completion Evidence 链完整；
- Child result_unknown 阻止 scheduler；
- Root cancel 传播；
- recover 不重复 Child/Handoff/ToolExecution；
- pending Assignee disabled 要求重分配；
- Root Task 普通 `start_with_snapshot` 和 Child 普通 Generic Run 无回归。

`check_business_flow_runtime.py` 使用临时数据库和确定性 Fake Decision：

1. 创建员工 `researcher-001`、`writer-002`；
2. 安装并绑定 `web-search`、`local-file-operations`；
3. 使用临时 fake `mcporter` 返回固定有来源结果；
4. A 执行 web-search 并产生 verified research Deliverable；
5. 测试通过 `business-flow-continue` 明确批准 B 的文件写入 Action；B 再通过 file-tool 在临时授权目录创建 Markdown Artifact；
6. Coordinator Finalization 产生 Root Deliverable；
7. 中途调用 recover，确认副作用计数不增加；
8. 查询 SQLite 证明 B Context 不含 A Conversation/Memory，只含 Handoff refs。

测试不得访问真实网络、真实 API Key 或用户 Application Support 数据库。

### 7.7 Phase 1B 验证

```bash
cargo test --workspace business_flow
python3 scripts/check_business_flow_runtime.py
python3 scripts/check_contracts.py
./scripts/check.sh
git diff --check
```

手动 CLI 验收使用临时数据库和仓库 Runtime binary，分别执行 `scenario-propose → validate → save → plan → start → status` 与 `manual draft → validate → save → start`，然后执行 recover/status；保存 Scenario Version/Flow/Root/Child/Handoff/Artifact ID 作为实施证据。

提交范围：Rust Service/Task/Run/Main/Event/Context/Recovery、runtime-event contract、业务流脚本；不包含 Swift。

回滚：从 CLI usage 移除新命令并停止创建 Flow；保留历史 Flow 只读 status，不能删除 Migration、Audit、Artifact 或已确认副作用。

---

## 8. Phase 1C：macOS Scenario Library

### 8.1 独立价值

用户无需 Terminal 即可用 AI 或手工方式创建场景、确认版本、启动运行，并在工作库查看运行记录；现有员工私人聊天与单员工工作继续可用。

### 8.2 Models / Service

新增：

- `apps/macos/AIEmployee/Sources/AIEmployee/Models/BusinessFlow.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Models/ScenarioDefinition.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Stores/BusinessFlowStore.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Stores/ScenarioStore.swift`

修改：

- `apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/App/AIEmployeeApp.swift`

`BusinessFlow.swift` 映射 plan/status/participant/work-order/handoff/budget/deliverable/error response；枚举未知值解码失败，不做默认映射。

`RuntimeService` 新增四个 CLI closure；`plan`/`status` 不注入 Key，`start`/continue 只注入 Keychain Key；stderr 仍通过 RuntimeError 投影。

当前最小实现由 `ScenarioStore` 同时持有 Scenario 与 Business Flow 聚合投影，职责仍按字段和 Runtime closure 分离，避免为 Phase 1 引入无调用收益的第二个 Store。它持有：

- Flow 列表和当前 Flow；
- 创建草案、plan preview、plan hash/expiry；
- start/continue/cancel 状态；
- Root event cursor 和轮询 Task；
- 错误与用户恢复动作。

禁止复用 `ConversationStore.messages` 或把 Flow 状态写入 `TaskStore.runs` 作为事实源；TaskStore 可继续显示 Child Task 历史，但 BusinessFlowStore 通过 `business-flow-status` 读取聚合投影。

`ScenarioStore` 持有列表、当前定义、草案、校验结果和保存状态。草案可以来自手工编辑或 AI 提案，但保存和启动必须分别经过用户确认；Store 不自行判断 DAG、readiness、权限或预算是否合法。

### 8.3 Views

新增：

- `apps/macos/AIEmployee/Sources/AIEmployee/Views/Scenario/ScenarioLibraryView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/Scenario/ScenarioEditorView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/Scenario/ScenarioProposalView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowCreationView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowWorkspaceView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowTimelineView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowInspectorView.swift`

修改：

- `apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Models/AppDestination.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/AppShell/ModuleRailView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/AppShell/ContextSidebarView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/CommandPaletteView.swift`

交互：

1. 新增 `AppDestination.scenes`，用户可见标题为「场景库（暂定）」，位于工作库和知识库之间。
2. 场景库以主区域页面承载创建与配置，不使用 Sheet；编辑页使用「业务 SOP」「节点配置」「校验与启动」三个页签。用户先写 Markdown SOP，再选择让 AI 基于 SOP 组织节点或手工配置节点。
3. 节点编辑器使用列表、依赖选择器和 Inspector，配置目标、员工、Capability、输入、验收、预算与失败策略；不做自由画布。
4. 保存前执行 scenario validate；启动前执行 business-flow plan。只有无 blocking issue、用户已确认且所需 Keychain Key 可用时允许相应操作。
5. 工作库展示 Flow 运行记录；Workspace 使用连续时间线展示依赖、Handoff 和 Finalization，不做卡片仪表盘。
6. Inspector 只展示当前 WorkOrder 的 Action、Evidence、Approval、Artifact、失败恢复。
7. Root cancel 使用现有危险操作确认；不提供删除 Flow。
8. 员工聊天时间线继续只按 employee/conversation 过滤，不渲染 Flow Child Task。

UI 状态：

- loading 不显示 Empty；refresh 保留旧投影；
- pending/unknown 不使用乐观成功；
- `waiting_dependency`、`waiting_user`、`waiting_approval`、`verification_required` 使用 Runtime 投影；
- 只有 Runtime 确认 cancelled/succeeded/failed 才显示终态；
- `result_unknown` 只显示人工核验，不显示“重试”。

### 8.4 Design System / Client Checks

修改：

- `docs/design-system/AI Employee macOS Main Interface Spec v2.0.md`
- `docs/design-system/AI Employee macOS UX State & Interaction Standard v1.0.md`
- `apps/macos/AIEmployee/Tests/ClientModelChecks.swift`
- `scripts/check_chat_feedback.py`

新增：

- `scripts/check_business_flow_ui.py`

检查：

- AppDestination 新增且只新增 `.scenes`，顺序为工作库、场景库、知识库；
- 场景定义与 Flow 运行实例分属场景库和工作库；
- AI 提案和手工草案复用同一编辑器与保存契约；
- BusinessFlow models 解码 valid payload、拒绝未知 enum/version；
- timeline 只使用 `flow.workOrders`，不使用全局 `TaskStore.runs`；
- Conversation timeline 继续使用 employee+conversation 过滤；
- stop/cancel/approval/result_unknown 操作映射正确；
- UI 不显示 Secret、Prompt、reasoning 或完整敏感 Context。

### 8.5 Phase 1C 验证

```bash
python3 scripts/check_business_flow_ui.py
python3 scripts/check_chat_feedback.py
swift build --package-path apps/macos/AIEmployee
./scripts/check.sh
./script/build_and_run.sh
git diff --check
```

真实 UI 验收：

1. 保修员工等无 Conversation 员工仍显示空私人聊天；
2. 场景定义只在场景库出现，运行实例只在工作库出现；
3. A/B/Finalization 状态与 SQLite/CLI status 一致；
4. 切换 Flow/员工不会显示上一个对象的消息、WorkOrder 或 streaming state；
5. 重启 App 后恢复当前 Flow 与 Root cursor；
6. 窗口宽度 760/1020 两个断点无内容遮挡，审批和核验操作可访问。

提交范围：BusinessFlow Swift model/store/views、必要的现有 Swift 调用方、design-system 和客户端检查；不重构无关页面。

回滚：隐藏场景库的新建与 AI 提案入口，保留历史场景和 Flow 只读；CLI/status/cancel 继续可用，不删除本地数据。

---

## 9. Phase 1D：Recovery、Eval 与 Release Gate

### 9.1 独立价值

把已可用的 Phase 1 能力提升为可发布候选：补齐故障矩阵、端到端证据、运行文档和回滚说明，不扩展产品范围。

### 9.2 故障注入

扩展：

- `scripts/check_business_flow_runtime.py`
- `runtime/rust-core/src/business_flow_service.rs` tests
- `runtime/rust-core/src/recovery.rs` tests

注入边界：

- Root transaction commit 前/后；
- Child AgentRun 创建前/后；
- A ToolResult 持久化后、Deliverable 前；
- Deliverable verified 后、Handoff 前；
- Handoff accepted 后、B AgentRun 前；
- Root cancel 与 Child Tool completion 并发；
- Finalization Deliverable 后、Root completion 前。

每个案例必须证明恢复后 ID、Action、ToolExecution、Handoff 和 Artifact 数量没有意外增加。

### 9.3 隔离与安全 Eval

新增固定 Eval cases 到 `scripts/check_business_flow_runtime.py` 的测试数据：

- B 请求 A 的 Conversation message ID；
- B 请求 A 的 Agent Memory；
- Handoff 引用未授权 confidential Artifact；
- Coordinator 尝试扩展文件授权根目录；
- Plan 带未知员工/Skill/Tool、额外字段、缺预算、依赖环；
- Worker Decision 伪造 child_task_id、assignee、permission、budget；
- 恶意 Artifact 内容要求绕过 Runtime Policy。

全部必须在副作用前拒绝，并验证错误码与 Audit 不含敏感正文。

### 9.4 门禁集成

修改：

- `scripts/check.sh`

加入：

```bash
python3 scripts/check_business_flow_runtime.py
python3 scripts/check_business_flow_ui.py
```

保持总门禁在本地可确定运行；fake mcporter、Fake Decision 和临时授权目录由脚本自行创建和清理。

### 9.5 Release 文档

新增：

- `docs/releases/Phase 1 Multi-Employee Business Flow.md`

内容：

- 用户场景与边界；
- Root/Child/WorkOrder/Handoff 数据路径；
- 安装/升级 Migration 014；
- CLI 和 macOS 操作；
- 错误/恢复/取消；
- 已验证证据和未验证边界；
- 回滚为只读、不得删除 Audit/Artifact；
- Phase 2 至 4 仍未实现。

更新 `README.md` 仅在当前 README 已包含产品能力表时添加 Phase 1 状态；不得提前宣称并行、自动分配或员工群聊。

### 9.6 Phase 1D 最终验收

```bash
./scripts/check.sh
swift build --package-path apps/macos/AIEmployee
./script/build_and_run.sh
git diff --check
git status --short --branch -uall
```

人工检查：

- 使用本地 App 完成一次 A → B → Finalization；
- 在 A 完成后退出并重启 Runtime/App，B 继续且 A ToolExecution 不增加；
- Root cancel 与 `result_unknown` 各验证一次；
- 从 Root Deliverable 反查 Finalization、B、A、Handoff、Artifact Hash；
- 确认私人 Conversation 和 Employee Memory 未跨员工出现。

交付报告必须分开说明：自动化门禁、Swift build、真实 App UI、Fake external service、真实外部服务未验证项。没有真实 DeepSeek/Exa E2E 时不得声称真实网络链通过。

提交范围：故障/Eval 脚本、`check.sh`、release docs 和必要测试；不加入 Phase 2 功能。

回滚：关闭新建入口并保留 status/只读历史；如发现安全问题，同时拒绝 `business-flow-start`，但继续允许 `business-flow-status`、cancel 和人工核验。

## 10. 计划中的新文件清单

### Documents / Contracts

- `contracts/scenario-proposal.schema.json`
- `contracts/scenario-definition.schema.json`
- `contracts/scenario-validation.schema.json`
- `contracts/business-flow-plan.schema.json`
- `contracts/business-flow-status.schema.json`
- `contracts/work-order.schema.json`
- `contracts/handoff.schema.json`
- `contracts/shared-context-ref.schema.json`
- 5 个 valid examples、10 个 invalid fixtures
- `docs/releases/Phase 1 Multi-Employee Business Flow.md`

### Storage / Rust

- `storage/migrations/014_multi_employee_business_flows.sql`
- `runtime/rust-core/src/business_flow.rs`
- `runtime/rust-core/src/business_flow_service.rs`

### Swift

- `apps/macos/AIEmployee/Sources/AIEmployee/Models/ScenarioDefinition.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Stores/ScenarioStore.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/Scenario/ScenarioLibraryView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/Scenario/ScenarioEditorView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/Scenario/ScenarioProposalView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Models/BusinessFlow.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Stores/BusinessFlowStore.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowCreationView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowWorkspaceView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowTimelineView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/BusinessFlow/BusinessFlowInspectorView.swift`

### Verification

- `scripts/check_business_flow_runtime.py`
- `scripts/check_business_flow_ui.py`

## 11. 明确修改的现有文件

- `AGENTS.md`
- 8 份 canonical/专题/总览文档（第 6.2 节）
- `contracts/runtime-event.schema.json`
- `scripts/check_contracts.py`
- `scripts/check.sh`
- `runtime/rust-core/src/storage.rs`
- `runtime/rust-core/src/lib.rs`
- `runtime/rust-core/src/task_service.rs`
- `runtime/rust-core/src/event.rs`
- `runtime/rust-core/src/context_pipeline.rs`
- `runtime/rust-core/src/recovery.rs`
- `runtime/rust-core/src/run.rs`
- `runtime/rust-core/src/main.rs`
- `runtime/python-agent/app/scenario_coordinator.py`
- `apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/App/AIEmployeeApp.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/ContentView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Models/AppDestination.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/AppShell/ModuleRailView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/AppShell/ContextSidebarView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/CommandPaletteView.swift`
- `apps/macos/AIEmployee/Tests/ClientModelChecks.swift`
- 2 份 design-system 文档（第 8.4 节）

预计显著超过 8 个文件并跨 Rust/Swift/SQLite/JSON Schema/文档五个边界。这是独立架构能力，必须使用以上四阶段和单一目的提交，不得压缩成一个补丁。

## 12. 提交顺序

建议提交消息：

1. `feat(runtime): add business flow contracts and storage foundation`
2. `feat(runtime): add persisted sequential business flow CLI`
3. `feat(macos): add scenario library and flow workspace`
4. `test(runtime): gate business flow recovery and isolation`

每次提交前：

```bash
git diff --check
./scripts/check.sh
git diff --cached --name-status
git diff --cached --check
```

只暂存当前阶段路径；当前聊天隔离/知识库等重叠改动若不属于该阶段，必须保留在工作区并在交付中列为未包含。

## 13. 停止条件

出现以下任一情况，停止当前阶段并返回 Spec/Plan 重新决策：

- 实现需要 Root Task 创建 AgentRun 或 Python Worker 启动 Child Task；
- 需要新增 WorkOrder status、第二套 Event/Approval/Audit；
- Handoff 必须复制私人 Conversation、Memory 或完整 ToolResult 才能运行；
- Generic Run 不能在不硬编码 Skill/员工/业务场景的情况下执行 Child；
- Migration 需要修改 001 至 013；
- UI 需要用本地状态覆盖 Runtime canonical 状态；
- Phase 1 必须依赖并行、Reviewer、无需确认的自动分配或运行中自主改图才可使用；
- 真实副作用无法建立幂等键、明确超时和可验证结果。

## 14. 实施完成定义

Phase 1 只有在以下全部成立时完成：

- ADR/Spec/canonical/机器契约一致；
- Migration 014 fresh/replay/upgrade/constraints 全通过；
- CLI `plan/start/status/continue/cancel/recover` 可运行；
- A → Handoff → B → Handoff → Finalization → Root verified 全链通过；
- restart/cancel/result_unknown/approval/idempotency/预算/隔离通过；
- macOS 场景库可通过 AI 或手工方式创建同契约场景，工作库可查看 Flow，私人聊天无串流；
- `./scripts/check.sh`、Swift build、真实 App 验收通过；
- release 文档如实区分 Fake external service 与真实网络未验证项；
- 未实现 Phase 2 至 4，且没有以隐藏入口或业务硬编码提前加入。

## 15. 下一步授权边界

用户确认本 Implementation Plan 后，实施者按 Phase 1A → 1B → 1C → 1D 顺序执行；每阶段完成并验证后可继续下一阶段，不再重复询问。只有命中第 13 节停止条件、权限/安全阻塞或工作区出现不可安全合并的重叠漂移时才暂停请求决策。
