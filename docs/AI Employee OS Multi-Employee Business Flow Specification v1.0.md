# AI Employee OS Multi-Employee Business Flow Specification v1.0

> 文档类型：产品与 Runtime 契约规范
> 状态：Approved（2026-08-07）
> 日期：2026-08-07
> 前置规划：`docs/plans/AI Employee OS 多员工业务流规划 v0.1.md`
> 前置决策：ADR-034 Accepted
> 实施约束：本规范不授权立即编码；确认后还需生成并确认独立 Implementation Plan

## 1. 结论

AI Employee OS 的多员工协作采用独立 Business Flow 工作区：一个 Root Task 表达业务总目标，每个 WorkOrder 绑定一名员工和一个 canonical Child Task，员工之间通过 verified Deliverable、ArtifactRef 和结构化 Handoff 交接。

```text
Private Conversation A ─┐
Private Conversation B ─┤  不共享 Message / Memory
                        │
User ──> Business Flow ─┴─> Root Task（Rust 编排聚合，不运行 Agent）
                                |
                                +─ WorkOrder A ─> Child Task A / Agent Run A
                                |                       |
                                |                 Deliverable A
                                |                       |
                                +──────── Handoff A→B ──+
                                |
                                +─ WorkOrder B ─> Child Task B / Agent Run B
                                                        |
                                                  Deliverable B
                                                        |
                                +─ Finalization WorkOrder / Coordinator
                                                        |
                                              Root verified Deliverable
```

Phase 1 只实现用户显式指定的线性 `A → B` 顺序协作，最大并发固定为 1。模板、并行、Reviewer 返工和智能协调属于后续独立阶段，不进入 Phase 1 发布门禁。

## 2. 目标与成功标准

### 2.1 目标

- 两名不同员工可以在同一业务目标下顺序完成可验证的子工作。
- 每名员工继续使用自己的 Identity、Soul、Persona、Capability Set、权限和 Agent Memory。
- 上游只通过显式引用把已验证成果交给下游；不复制私人聊天或完整 Runtime Context。
- Root、Child、Action、Run、Approval、ToolExecution、Deliverable、Event 和 Audit 可恢复、可追溯、可取消。
- Swift 只展示 Runtime 投影，不编排员工、不推断完成、不维护第二套状态。

### 2.2 Phase 1 发布级成功标准

以下条件必须同时成立：

1. 用户创建两名 active 员工并显式指定 Coordinator、WorkOrder A 和 WorkOrder B 的 Assignee。
2. `business-flow-plan` 在不持久化、不调用模型、不执行 Tool 的前提下验证输入、员工、Capability、预算和线性依赖。
3. `business-flow-start` 原子创建 Root Task、A/B/Finalization 三个 Child Task、三个 WorkOrder、依赖和共享 Context 引用。
4. A 的 Child Task 复用 Generic Run Kernel；A 的 Deliverable 未 verified 前，B 保持 pending 且不调用模型或 Tool。
5. A verified 后，Runtime 创建并接受 Handoff；B 只能看到 Handoff 明确列出的引用。
6. B verified 后，Coordinator 的 Finalization WorkOrder 生成最终 Deliverable；Root Task 才能 succeeded。
7. App 或 Runtime 重启不会重复创建 Child Task、Handoff、Action 或 Tool 副作用。
8. 任一依赖 Action 为 `result_unknown` 时，下游不得启动，只有人工核验后才能继续或失败。
9. 员工 B 无法读取员工 A 的私人 Conversation、非授权 Memory、完整 Context 或未引用 ToolResult。
10. Work Library 可查看目标、员工、依赖、当前 Action、审批、阻塞原因、Artifact、成本和最终交付。

## 3. 非目标

Phase 1 不实现：

- 员工群聊、员工自由对话或共享私人 Conversation；
- 模型自动选择员工、自动拆分 WorkOrder 或重排依赖；
- Python Worker 直接启动 Child Task、调用其他 Worker、访问 SQLite 或执行 Tool；
- 并行 WorkOrder、Reviewer 驳回与自动返工；
- Workflow Package 模板安装；
- 任意递归委派、动态创建员工、Subagent、Computer Use；
- Cloud Sync、Marketplace、企业 RBAC；
- LangGraph、Deep Agents 或第三方队列作为状态源；
- 对历史单员工 Task 自动推断或回填 Business Flow；
- 持久化模型 reasoning 或把自然语言群聊当作完成证据。

## 4. 事实源与文档变更顺序

本规范与现行 ADR-017、Generic Agent Runtime Specification v1.0 的 Multi-Agent 非目标存在明确冲突。实施前必须依次：

1. 用户确认本规范；
2. 将 ADR-034 状态改为 Accepted，并将 ADR-017 标记为 Superseded；
3. 更新 Unified Data Model，冻结新增表、字段、外键、CHECK、UNIQUE、索引和删除策略；
4. 新增 `contracts/` Schema、valid examples 和 invalid fixtures；
5. 更新 MVP API、Runtime、Security、Memory、Observability 与 design-system 文档；
6. 生成并确认 Multi-Employee Business Flow Implementation Plan；
7. 最后才追加 Migration 和实现代码。

在步骤 1–6 完成前，本文只表达目标契约，不是已实现事实。

## 5. 核心术语与所有权

| 对象 | 定义 | 唯一所有者 |
|---|---|---|
| Business Flow | 一个多员工业务目标及其 WorkOrder 集合 | Rust + SQLite |
| Root Task | Flow 的总目标、总预算、取消和最终交付聚合 | Rust Orchestrator；不创建 AgentRun |
| WorkOrder | 分配给一名员工的结构化子目标 | Rust + SQLite |
| Child Task | WorkOrder 的 canonical 执行 Task | Rust Generic Run Kernel |
| Coordinator | Root Task 的责任员工和 Finalization WorkOrder 执行者 | Agent Snapshot |
| Executor | 执行普通 WorkOrder 的员工 | Agent Snapshot |
| Dependency | WorkOrder 的启动前置关系 | Rust Scheduler |
| Handoff | verified Deliverable 到下游输入的显式交接 | Rust + SQLite |
| SharedContextRef | Flow 内授权共享的持久化引用 | Rust Context Pipeline |
| Flow Projection | 面向 Swift 的聚合读取模型 | Rust 生成，Swift 只读 |

## 6. Conversation、Task 与 Flow 边界

### 6.1 私人 Conversation

- Conversation 的 `agent_id` 必须等于当前员工 ID。
- 只包含用户与该员工的 Message。
- 可以提交一个 Business Flow 草案，但不承载其他员工的执行消息。
- Flow 启动后，私人 Conversation 最多追加一个 `business_flow_id` 引用和最终摘要。
- 其他员工的 Child Task、Action、Message 或 Runtime Event 不得出现在该 Conversation 时间线。

### 6.2 Root Task

Root Task 复用 canonical `tasks` 表与状态枚举，但不创建 `agent_runs`：

- `agent_id` 为 Coordinator；
- `input` 为业务目标的 canonical JSON；
- `pending → running`：Flow 与全部 Phase 1 WorkOrder 原子创建成功；
- `running → succeeded`：必需 Child Task 全部 succeeded，Root Deliverable verified；
- `running → failed`：不可恢复的编排、依赖或 Finalization 失败；
- `pending|running → cancelled`：用户取消，Child cancellation 已请求并完成 Root 收敛；
- Root Task 不使用 `blocked`，也不把 Child Action 状态复制到 Root 字段。

Root Task 的 `running` 可以包含“等待依赖、等待用户、等待审批、等待人工核验”；具体原因从 Child Run/Action 和 Flow Projection 得出。

### 6.3 Child Task

- 一个 WorkOrder 必须一对一关联一个 Child Task。
- Child Task `agent_id` 必须等于 WorkOrder `assignee_agent_id`。
- Child Task 复用现有 Generic Run Kernel、Capability Set、Action、ToolExecutor、Checkpoint、Deliverable、Evaluation 和 cancellation。
- 下游 WorkOrder 的 Child Task 可以提前创建为 `pending`，但在依赖满足前不得创建 AgentRun、调用模型或 Tool。
- Child Task 状态只能使用 canonical 五值，不增加 `waiting_dependency`。

### 6.4 WorkOrder 投影状态

以下值只存在于 API/UI Projection，不持久化为第二状态列：

| 投影状态 | 推导条件 |
|---|---|
| `waiting_dependency` | Child Task pending，至少一个必需上游未 succeeded/Handoff 未 accepted |
| `ready` | Child Task pending，全部依赖满足，尚未创建 AgentRun |
| `running` | Child Task running，且无下述更具体等待态 |
| `waiting_user` | Child Run phase=`waiting_user` |
| `waiting_approval` | 存在 Child Action blocked |
| `verification_required` | 存在 Child Action result_unknown |
| `succeeded` | Child Task succeeded 且 WorkOrder Deliverable verified |
| `failed` | Child Task failed |
| `cancelled` | Child Task cancelled |

## 7. Phase 1 角色与分配

| 角色 | Phase 1 规则 |
|---|---|
| Initiator | 当前本地用户 |
| Coordinator | 用户显式选择一名 active 员工；同时执行 Finalization WorkOrder |
| Executor A | 用户显式选择 active 员工，必须满足 WorkOrder A Capability requirement |
| Executor B | 用户显式选择 active 员工，必须满足 WorkOrder B Capability requirement |

允许 Coordinator 同时担任 A 或 B，但 Phase 1 E2E 必须使用至少两名不同员工。模型不得提出或修改分配。

员工在 Flow 启动后被停用：

- 已创建且已启动的 Child Task 按锁定 Snapshot 继续，除非用户取消；
- 尚未启动的 Child Task 不得再启动，Root 进入 `waiting_user` 投影并要求用户重新分配；
- 重新分配创建 WorkOrder revision、更新 Child Task/Assignee 关系并写 Audit，不覆盖已存在执行证据；Phase 1 UI 只允许在尚未产生 AgentRun 时重新分配。

## 8. WorkOrder 契约

### 8.1 机器字段

```text
schema_version          "1.0.0"
work_order_id           ^work_[a-z0-9_-]{8,64}$
business_flow_id        ^flow_[a-z0-9_-]{8,64}$
parent_task_id          Root Task ID
child_task_id           Child Task ID
assignee_agent_id       existing active Agent
role                    coordinator | executor
goal                    non-empty, max 8000 chars
input_refs[]            typed SharedContextRef IDs
acceptance_criteria[]   1..20 structured criteria
required_capabilities[] 1..20 Skill/Tool requirements
dependency_ids[]        Phase 1: 0..1 predecessor WorkOrder ID
deadline_at?            RFC 3339, later than created_at
budget                  token, tool_round, elapsed limits
failure_policy          stop | ask_user
revision                integer >= 1
created_at              RFC 3339
updated_at              RFC 3339
```

### 8.2 不变量

- WorkOrder ID、Flow ID、Root/Child Task ID 必须由 Rust 生成或验证；模型不得生成安全字段。
- 一个 Child Task 只能属于一个 WorkOrder；一个 WorkOrder 只能有一个当前 Child Task。
- `dependency_ids` 必须属于同一 Flow，不得自引用或成环。
- Phase 1 的依赖图必须是一条包含两个执行 WorkOrder 和一个 Finalization WorkOrder 的线性链。
- `acceptance_criteria` 在 Child Task 启动时进入 Snapshot；运行中修改只产生新 revision。
- `required_capabilities` 必须解析为 Assignee readiness=`ready` 的不可变 Capability Set。
- `failure_policy=ask_user` 时 Root 保持 running；`stop` 时未启动下游取消并由 Root 收敛 failed。
- WorkOrder 不保存 Secret、完整私人 Conversation、模型 reasoning 或完整 ToolResult。

### 8.3 Acceptance Criterion

```text
criterion_id
description
evidence_type          structured_output | artifact | tool_result | verification | evaluation
required               true | false
```

必需 criterion 缺少可定位 Evidence 时，Child Task 不得 succeeded，Handoff 不得创建。

## 9. Handoff 契约

### 9.1 字段

```text
schema_version          "1.0.0"
handoff_id
business_flow_id
source_work_order_id
target_work_order_id
deliverable_id
artifact_refs[]
summary
acceptance_result       pending | accepted | rejected
rejection_code?
created_at
resolved_at?
```

### 9.2 Phase 1 接受流程

1. Source Child Task 产生 verified Deliverable。
2. Rust 在事务中创建 Handoff=`pending`。
3. Rust 验证 Deliverable/Evidence 存在、Artifact Hash、敏感级别、目标 Agent 授权和目标 input schema。
4. 全部通过后同一事务写 Handoff=`accepted`、SharedContextRef 和 Runtime Event。
5. Scheduler 重新计算依赖；Target Child Task 从投影 `waiting_dependency` 变为 `ready`。
6. 任一验证失败写 Handoff=`rejected` 和稳定错误码；Target 不启动，Root 按 `failure_policy` 进入 waiting_user 或 failed。

Handoff 不调用模型或 Tool，不复制 Artifact 正文。`summary` 只用于用户和模型 Context 的有界说明，不能取代 Deliverable/Evidence。

## 10. Shared Context 与 Memory

### 10.1 SharedContextRef 字段

```text
shared_context_ref_id
business_flow_id
source_type             user_input | knowledge | artifact | deliverable
source_id
sensitivity             public | internal | confidential | restricted
allowed_agent_ids[]
content_hash
created_by              user | runtime | handoff
created_at
```

### 10.2 读取规则

- Rust Context Pipeline 同时验证 Flow、WorkOrder、Agent、source、Hash 和 allowed list。
- `allowed_agent_ids` 缺失或不包含当前 Assignee 时默认拒绝。
- Artifact 路径仍受授权根目录、符号链接和敏感字段规则约束。
- Coordinator 只读取显式共享引用、Child 状态、Evidence 摘要和成本投影。
- Source Agent 的完整 Context、Prompt、Conversation、Memory、非引用 ToolResult 和 reasoning 不进入共享 Context。

### 10.3 Memory 规则

- 现有 Employee Memory 继续使用 Agent owner，不因参与 Flow 自动共享。
- Phase 1 不新增 Flow Memory。
- Child Task 可以按既有门禁写入执行员工自己的 Memory，但必须保留 Task/Trace/Extractor Provenance。
- 跨员工可复用经验必须先转成 Knowledge Source 或显式 Artifact，由用户或受信任 Runtime 流程加入 SharedContextRef。

## 11. 数据模型

正式 Unified Data Model 更新必须通过追加 Migration 引入：

### 11.1 `tasks.parent_task_id`

- nullable self foreign key to `tasks(id)`；
- Root Task 为 NULL，Child Task 指向 Root；
- 禁止 Task 指向自身；
- 应用层事务验证祖先链无环；
- 索引 `(parent_task_id, status, created_at)`。

### 11.2 `business_flows`

```text
id PK
root_task_id UNIQUE FK tasks(id)
coordinator_agent_id FK agents(id)
title
objective
acceptance_json
budget_json
template_id NULL
template_version NULL
template_hash NULL
created_at
updated_at
```

不保存独立 `status`；状态读取 Root Task。

### 11.3 `business_flow_participants`

```text
business_flow_id FK
agent_id FK
role CHECK coordinator | executor
created_at
PRIMARY KEY (business_flow_id, agent_id, role)
```

### 11.4 `work_orders`

保存第 8 节字段。`child_task_id` UNIQUE；`revision >= 1`；`failure_policy` CHECK；不保存独立运行状态。

### 11.5 `work_order_dependencies`

```text
business_flow_id FK
predecessor_work_order_id FK
successor_work_order_id FK
required BOOLEAN CHECK 0|1
created_at
PRIMARY KEY (predecessor_work_order_id, successor_work_order_id)
CHECK predecessor != successor
```

### 11.6 `handoffs`

保存第 9 节字段；`deliverable_id` FK；acceptance CHECK；同一 source/target/deliverable UNIQUE，防止恢复重复交接。

### 11.7 `shared_context_refs`

保存第 10 节字段；`source_type` 与 `sensitivity` CHECK；`content_hash` 非空；同一 Flow/source/hash UNIQUE。

### 11.8 复用与禁止新增

继续复用：`tasks`、`actions`、`agent_runs`、`run_snapshots`、`run_observations`、`run_checkpoints`、`tool_executions`、`runtime_events`、`task_cancellation_requests`、`approvals`、`artifacts`、`deliverables`、`deliverable_evidence`、`evaluations`、`audit_logs`。

禁止新增：`workflow_tasks`、`work_order_actions`、`multi_agent_runs`、第二套 Event、第二套 Approval、第二套 Audit 或 WorkOrder status 列。

## 12. Runtime 生命周期

### 12.1 Plan：纯验证

`business-flow-plan`：

1. 严格解析 `BusinessFlowPlanRequest`；未知字段/版本拒绝。
2. 验证目标、验收、员工 active、角色、线性依赖和硬上限。
3. 对每个 WorkOrder 解析 Capability readiness、输入 Schema、Tool 依赖和预算。
4. 验证 SharedContextRef 可访问但不读取超出预览所需的正文。
5. 返回标准化 Plan、风险、估算上限和 `plan_hash`。
6. 不写数据库、不调用模型、不执行 Tool、不访问 Keychain Secret。

### 12.2 Start：原子建档

`business-flow-start` 必须提交未过期的 `plan_hash` 和幂等键：

1. 重新执行所有可漂移 preflight；
2. 一个 SQLite Immediate transaction 中创建 Root Task、Flow、Participants、Child Tasks、WorkOrders、Dependencies、初始 SharedContextRefs、Audit 和 Root Event；
3. Root Task 从 pending 转 running；
4. 提交后只调度第一个 ready Child Task；
5. 相同 idempotency key 返回原 Flow，不创建副本。

### 12.3 Child 执行

- Scheduler 只选择一个 Phase 1 ready WorkOrder。
- Rust 为 Child Task 创建正常 AgentRun 和 Snapshots。
- 后续完全复用 Generic Run Kernel。
- Child complete 必须经过 Deliverable/Evidence/Evaluation gate。
- 成功后进入 Handoff；失败按 failure policy 收敛。

### 12.4 Finalization

Phase 1 必须把 Finalization 表达为最后一个 WorkOrder：

- Assignee 为 Coordinator；
- 输入只含 A、B verified Deliverable 和允许的 SharedContextRef；
- Acceptance 与 Root 总验收一致；
- 产生 Child verified Deliverable 后，Rust 创建 Root Deliverable，Evidence 引用 Finalization Deliverable 及其上游链；
- Root Deliverable verified 后 Root Task succeeded。

Root Task 本身不创建 AgentRun，避免一个 Task 同时承担编排和员工执行。

## 13. 取消、失败与恢复

| 场景 | 必须行为 |
|---|---|
| Root pending 取消 | Root 和全部 pending Child 转 cancelled，不创建 AgentRun |
| Root running 取消 | 为未终结 Child 写 cancellation request；已确认副作用不回滚 |
| Child 普通失败 + stop | 下游 pending Child cancelled，Root failed |
| Child 普通失败 + ask_user | Root running；Projection=`waiting_user`；用户决定重试/重分配/失败 |
| Child waiting approval | Root running；下游 waiting_dependency |
| Child result_unknown | Root running；Projection=`verification_required`；依赖链停止 |
| Handoff rejected | Target 不启动；按 source failure policy waiting_user 或 Root failed |
| Runtime 崩溃 | 从 Root/Child/Run/Checkpoint/Handoff 恢复；按唯一键避免重复事实 |
| App 退出 | Runtime 状态不变；重开后按 Root Task cursor 续读 |

恢复顺序：

1. reconcile canonical Child Action/ToolExecution；
2. resolve `result_unknown` 或等待人工；
3. 校验 Child Deliverable；
4. 幂等创建/接受 Handoff；
5. 计算 ready WorkOrder；
6. 最多启动一个 Child；
7. 检查 Finalization 与 Root 收敛。

恢复不得从 UI 状态、Message 文本或模型摘要推断完成。

## 14. 权限与安全

- 每次 ToolCall 仍验证 `Child Task → Assignee → Capability Set → Skill → Tool → Action → Permission`。
- Approval 必须绑定 Child Task、Action、Agent、Resource 和期限。
- Root Task 或 Flow ID 不能替代 Resource grant。
- Handoff 只能扩大 Context 可见引用，不能扩大 Tool、文件根目录、Secret 或系统权限。
- Secret 只由 Keychain 注入当前受控进程，不进入 Flow、WorkOrder、Handoff、SharedContextRef、Event、Audit、Memory 或 Artifact。
- 未知 Agent、状态、版本、Role、Sensitivity、FailurePolicy、SourceType 或权限默认拒绝。
- Coordinator 不得创建员工、安装 Package、绑定 Skill、修改其他员工 Persona、授权 Secret 或扩大预算。

## 15. 预算与硬上限

Phase 1：

- 至少 2 名不同员工参与 E2E；产品允许 Coordinator 与 Executor 重合；
- 最多 5 名参与员工；
- 最多 12 个 WorkOrder，Phase 1 产品只创建 3 个：A、B、Finalization；
- 最大并发固定为 1；
- 每个 WorkOrder Phase 1 不自动返工；
- Start 请求必须包含 Flow 和每个 WorkOrder 的 `max_input_tokens`、`max_output_tokens`、`max_tool_rounds`、`max_elapsed_ms`；
- Flow 聚合预算必须大于等于 WorkOrder 预算之和，且不得超过 Runtime 本地配置硬上限；
- 达到预算时不静默扩容，Child Run 进入 waiting_user 或按 failure policy 失败。

成本展示按 Child Task 实际 ModelCall/ToolExecution 聚合；预估必须标注 estimate，不当作账单。

## 16. CLI 与响应

### 16.1 `business-flow-plan`

```text
ai-employee-runtime business-flow-plan \
  --database <path> \
  --repository-root <path> \
  --input-json <BusinessFlowPlanRequest>
```

返回：`schema_version`、标准化 plan、`plan_hash`、`expires_at`、每个 WorkOrder readiness、风险和预算上限。

### 16.2 `business-flow-start`

必须提交 `plan_hash`、完整 normalized plan、`idempotency_key`。返回 `business_flow_id`、`root_task_id`、WorkOrder/Child Task ID 和初始 projection。

### 16.3 `business-flow-status`

按 `business_flow_id` 返回 Root Task、参与者、WorkOrder projection、依赖、Handoff、Artifact/Deliverable refs、预算和最新 event cursor；不得返回完整 Prompt、Secret 或未授权内容。

### 16.4 `business-flow-continue`

Phase 1 只接受：

- Child Run `ask_user` 的结构化用户输入；
- `result_unknown` 人工核验结果继续走现有 resolve 命令；
- 尚未启动 WorkOrder 的重新分配确认；
- 失败后的 `retry_once | fail_flow` 决策。

所有 continuation 使用 revision 和 idempotency key，过期 revision 拒绝。

### 16.5 取消

继续使用 `cancel-task --task-id <root_task_id>`。Runtime 识别 Root Task 后传播 cancellation request；不新增第二取消 API。

## 17. 错误码

新增错误码至少包括：

| 类别 | 错误码 |
|---|---|
| Plan | `business_flow_schema_invalid`, `business_flow_limit_exceeded`, `plan_hash_stale` |
| 员工 | `coordinator_unavailable`, `assignee_unavailable`, `assignee_not_ready` |
| WorkOrder | `work_order_invalid`, `work_order_dependency_invalid`, `work_order_dependency_cycle` |
| Context | `shared_context_forbidden`, `shared_context_hash_mismatch`, `shared_context_source_missing` |
| Handoff | `handoff_evidence_missing`, `handoff_artifact_invalid`, `handoff_target_forbidden`, `handoff_rejected` |
| 调度 | `child_task_conflict`, `scheduler_no_ready_work`, `flow_revision_conflict` |
| 预算 | `flow_budget_required`, `flow_budget_exceeded`, `work_order_budget_exceeded` |

现有 `result_unknown`、`approval_required`、`cancelled`、`checkpoint_conflict`、`evaluation_failed` 等错误码继续复用。

## 18. Runtime Events 与 Audit

新增 Root Task 事件：

- `business_flow.created`
- `business_flow.started`
- `work_order.ready`
- `work_order.started`
- `work_order.waiting_dependency`
- `work_order.completed`
- `handoff.created`
- `handoff.accepted`
- `handoff.rejected`
- `business_flow.waiting_user`
- `business_flow.verification_required`
- `business_flow.completed`
- `business_flow.failed`
- `business_flow.cancel_requested`

事件只引用 ID、状态、稳定 reason code、非敏感摘要和 Hash。Child Task 继续拥有自己的单调 event sequence；Root 事件通过 Root Task sequence 提供业务流时间线，不复制 Child 完整事件。

Audit 至少记录：Flow 创建、分配、重新分配、预算、SharedContextRef 授权、Handoff 接受/拒绝、取消传播、人工核验和 Root 收敛。

## 19. macOS 产品交互

### 19.1 信息架构

- 一对一聊天仍在“员工会话”；
- 多员工协作入口和运行记录位于“工作库”；
- Business Flow 是独立详情，不混入任一员工私人时间线；
- 员工私人聊天可显示一个只读 Flow 引用，但默认不自动插入。

### 19.2 创建流程

1. 输入目标、总验收和 Flow Budget；
2. 选择 Coordinator；
3. 配置 WorkOrder A、B 的 Assignee、目标、Capability、输入、验收、预算；
4. 自动生成 Coordinator Finalization WorkOrder；
5. 调用 plan，展示 readiness、依赖、权限和预算风险；
6. 用户确认后 start。

### 19.3 运行工作区

连续时间线展示：

- Root 目标、总体状态和预算；
- A / Handoff / B / Finalization 顺序；
- 每个 WorkOrder 的员工、投影状态、当前 Action、审批、Evidence 和 Deliverable；
- 失败的 expected/actual/recoverable/recommendedAction；
- 一个主要操作：当前需要用户处理的审批、输入、核验或取消。

禁止：卡片式全局仪表盘、展示模型 reasoning、把历史 terminal Task 冒充当前工作、跨员工消息混入时间线、客户端推断成功。

## 20. Machine Contracts

Implementation Plan 必须新增：

- `contracts/business-flow-plan.schema.json`
- `contracts/business-flow-status.schema.json`
- `contracts/work-order.schema.json`
- `contracts/handoff.schema.json`
- `contracts/shared-context-ref.schema.json`
- valid examples；
- invalid fixtures：未知版本/字段、员工不存在、非 active、依赖环、跨 Flow 依赖、越权 Context、Hash 不符、缺 Evidence、预算缺失/超限、伪造状态、重复 Handoff。

所有 Schema 默认 `additionalProperties: false`；未知 `schema_version` 默认拒绝。

## 21. Eval 与测试矩阵

| 类别 | 必测案例 | 通过标准 |
|---|---|---|
| Happy path | A → B → Finalization | Root/Child/Deliverable/Handoff 全链可追溯 |
| Conversation 隔离 | B 请求 A 私人消息 | Runtime 拒绝，B Context 不含 A Message |
| Memory 隔离 | B 请求 A Agent Memory | 无 SharedContextRef 时拒绝 |
| Capability | B 缺依赖 Skill/Tool | start 前失败，无模型/Tool 调用 |
| Evidence | A 仅文字声明完成 | A 不 succeeded，Handoff 不创建 |
| Dependency | A failed/result_unknown | B 不创建 AgentRun |
| Idempotency | 重复 start/恢复/Handoff | 无重复 Child、Action、Handoff、副作用 |
| Crash recovery | ToolResult 后、Handoff 前后崩溃 | 从持久化边界恢复，ToolExecution 不增加 |
| Cancellation | Root cancel 与 Child Tool 完成竞争 | 只产生 canonical 合法终态，证据不丢失 |
| Reassignment | pending B 员工被停用 | 要求用户重分配，历史 revision 保留 |
| Budget | Child 或 Flow 达上限 | 明确 waiting_user/failed，不超支继续 |
| UI | 切换员工/Flow | 无跨员工 Message/Task，状态来自 Runtime |

发布前必须通过：

```bash
./scripts/check.sh
```

并完成真实本地 E2E：用户创建的两名员工、两个不同 Skill、一个 Handoff、一个 verified Artifact、一次 Runtime 重启恢复和最终 Root Deliverable 验证。

## 22. 迁移与兼容

- Migration 只追加，不修改已发布文件；
- fresh install、重复启动、从当前 schema 升级、外键、唯一约束和依赖无环必须测试；
- 现有 Task 的 `parent_task_id` 为 NULL，不自动归入 Flow；
- 现有 Conversation、Message、Run、Deliverable 和 Audit 不迁移、不重写；
- 未启用 Business Flow 时，现有单员工聊天和 Generic Run 行为保持不变；
- 回滚实现时保留新表和历史 Flow 只读，隐藏新建入口，不删除证据文件。

## 23. 分阶段边界

### Phase 1：本规范范围

显式两员工顺序协作、固定并发 1、手工分配、自动验证 Handoff、Coordinator Finalization。

### Phase 2：后续 Spec 增量

声明式 Workflow Package、模板快照和员工映射。

### Phase 3：后续 Spec 增量

有界并行、资源冲突控制、Reviewer 接受/拒绝和一次返工。

### Phase 4：后续 Spec 增量

Python 只提出 BusinessFlowPlanProposal；Rust 校验、用户确认、高影响变更门禁。

任何后续阶段不得削弱 Phase 1 的 Conversation/Memory 隔离、Rust 单一事实源、ToolExecutor、Evidence、预算、取消和恢复不变量。

## 24. 最脆弱前提

本规范假设业务能够拆成“明确输入、单一负责人、可验证输出”的 WorkOrder。如果某类业务必须依赖开放讨论，未来可以增加 Flow-scoped comment/event，但评论只能补充信息，不能替代 WorkOrder、Task、Handoff、Evidence 或 Deliverable。

若该前提不成立，系统应停止自动协作并请求用户重新定义目标和验收，而不是退化为不可恢复、不可授权、不可计量的员工群聊。

## 25. Approved Design Summary

- **Building**：独立 Business Flow 工作区，使用 Root Task、每员工 Child Task、WorkOrder、SharedContextRef、Handoff 和 verified Root Deliverable 支持可恢复的两员工顺序协作。
- **Not building**：员工群聊、自由互调、自动分配、并行、Reviewer 返工、递归委派和第二套状态源。
- **Approach**：Rust 确定性编排并复用 Generic Run Kernel；私人 Conversation/Memory 隔离；成果通过显式引用交接。
- **Key decisions**：Root Task 不创建 AgentRun；WorkOrder 状态只做派生投影；Handoff 不复制正文；Phase 1 并发固定 1；最终汇总是 Coordinator 的显式 Finalization WorkOrder。
- **Unknowns**：无阻塞设计决策。当前最新 Migration 为 013，因此无并发漂移时使用 014；若实施前已有新 Migration，只能使用下一个可用编号，不得改写已发布 Migration。目标文件与提交拆分在下一份 Implementation Plan 中逐项列出。
