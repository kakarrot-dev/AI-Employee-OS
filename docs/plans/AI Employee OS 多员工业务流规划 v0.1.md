# AI Employee OS 多员工业务流规划 v0.1

> 文档类型：ADR / Spec 前置产品与架构规划
> 状态：Approved（2026-08-07）；授权生成 ADR-034 与 Spec，不授权立即编码
> 日期：2026-08-07
> 适用仓库：`/Users/kakarrot/Dev/AI Employee OS`
> 前置事实：现行 ADR-017 与 Generic Agent Runtime Specification v1.0 明确不在当前 MVP 实现 Multi-Agent

## 1. 结论

AI Employee OS 可以演进为支持多个 AI 员工协作的业务流系统，但不能通过共享私人聊天记录、员工之间自由互调或新建第二套执行状态机实现。

推荐模型：

```text
用户
 ├─ 与员工 A 的私人 Conversation
 ├─ 与员工 B 的私人 Conversation
 └─ Business Flow（独立工作区）
      └─ Root Task（业务目标与总验收）
           ├─ WorkOrder A → 员工 A → Child Task / Run
           │                           └─ Deliverable / ArtifactRef
           ├─ Handoff A → B（显式交付与授权）
           ├─ WorkOrder B → 员工 B → Child Task / Run
           │                           └─ Deliverable / ArtifactRef
           └─ Coordinator / Reviewer → 最终 Verified Deliverable
```

根 Task、员工子 Task、Action、Run、Approval、ToolExecution、Deliverable 与 Audit 继续由 Rust Runtime 和 SQLite 持有。Python Worker 只为当前 Task 提出 `ask_user | tool_call | complete`，不得创建员工、分配权限、直接启动子 Task 或调用其他员工。

## 2. 产品目标

用户可以把一个业务目标拆给多个员工完成，并获得：

- 明确的总负责人、参与员工、子目标、依赖和验收标准；
- 每项工作可独立执行、暂停、审批、失败、恢复和取消；
- 员工之间通过结构化交付物交接，不依赖不可审计的自然语言群聊；
- 一个可查看总体进度、阻塞、成本、证据和最终交付的业务流工作区；
- 保持每名员工与用户的一对一 Conversation 隔离；
- 保持员工 Memory、权限和 Capability Set 的最小授权边界。

## 3. 非目标

首轮不建设：

- AI 员工群聊驱动执行；
- 员工之间无限递归委派或自行创建永久员工；
- Python Worker 直接调用另一个 Worker；
- 把一个员工的完整 Conversation、Memory 或 ToolResult 自动复制给其他员工；
- 跨设备协作、Cloud Sync、企业 RBAC、Marketplace；
- 无上限并行、自动扩员或模型自行扩大预算；
- 用 LangGraph、Deep Agents 或第三方编排器建立第二套 Task/Action/Checkpoint 状态源；
- 失败后自动重放存在副作用或 `result_unknown` 的 Action。

## 4. 必须先解决的决策冲突

现行 ADR-017 的结论是“MVP 不实现 Multi-Agent 协作”，Generic Agent Runtime Specification v1.0 也将 Multi-Agent 列为非目标。实施前必须按以下顺序完成：

1. 新增 ADR-034，明确 supersede ADR-017，但保留“先验证单员工闭环”的历史背景。
2. 新建 `AI Employee OS Multi-Employee Business Flow Specification v1.0.md`，冻结实体、状态、权限、恢复和 API。
3. 用户确认 Spec 后，新建独立 Implementation Plan。
4. Implementation Plan 获批后才追加 Migration、机器契约和 Runtime 代码。

不得直接修改 ADR-017 的历史正文，也不得在 Swift Client 或 Python Worker 中先行加入隐式委派。

## 5. 核心设计

### 5.1 Conversation 与 Business Flow 分离

| 对象 | 用途 | Context 边界 | 是否触发工作 |
|---|---|---|---|
| 私人 Conversation | 用户与单名员工持续交流 | 仅该员工的 Message 与允许的 Memory | 只有明确识别为工作并创建 Task 后触发 |
| Business Flow | 多员工围绕同一业务目标协作 | Root Task、WorkOrder、共享引用和交付物 | 是 |
| WorkOrder | 分配给一名员工的结构化子目标 | 只包含显式输入、依赖交付物和授权 Context | 创建一个 Child Task |
| Handoff | 员工之间交接成果 | 只传 Deliverable、ArtifactRef、摘要和验收结论 | 不直接执行 Tool |

私人 Conversation 可以发起一个“业务流草案”，但业务流开始后，执行状态和交付回到独立业务流工作区；不得把其他员工的消息写回发起员工的私人会话。私人会话最多保存一个指向业务流的引用和最终摘要。

### 5.2 单一状态事实源

业务流不建立第二套 Task/Action 状态枚举：

- 每个 Business Flow 对应一个 Root Task；Root Task 的 `agent_id` 是显式选定的 Coordinator。
- 每个 WorkOrder 对应一个 Child Task，并通过 `parent_task_id` 指向 Root Task。
- Child Task 的 `agent_id` 是实际执行员工。
- WorkOrder 的展示状态从 Child Task / Run / Action 派生，不独立维护“运行中/完成”副本。
- Root Task 只有在所有必需 WorkOrder 成功、最终 Deliverable 通过验证时才能 `succeeded`。
- 任一 Child Action 为 `result_unknown` 时，依赖 WorkOrder 不得启动，Root Task 保持 `running` 并等待人工核验。
- 审批仍由具体 Child Action 的 `blocked` 表达；Root Task 不使用 `blocked`。

### 5.3 角色

| 角色 | 责任 | 首版选择方式 |
|---|---|---|
| Initiator | 提交业务目标、约束和总验收 | 当前用户 |
| Coordinator | 拆分/调度 WorkOrder，汇总最终结果 | 用户显式指定员工 |
| Executor | 执行一个 WorkOrder | 用户显式指定员工 |
| Reviewer | 按验收标准审核 Deliverable | 可选；用户显式指定员工 |

首版禁止模型自动挑选员工。后续只有在 Capability、成本、可用性和权限均可确定时，Coordinator 才能提出候选分配；Rust 验证，用户确认后生效。

### 5.4 WorkOrder 最小契约

```text
work_order_id
business_flow_id
parent_task_id
child_task_id
assignee_agent_id
role                 coordinator | executor | reviewer
goal
input_refs[]
acceptance_criteria[]
required_capabilities[]
dependency_ids[]
deadline_at?
budget
failure_policy       stop | ask_user | continue_independent
created_at
```

约束：

- 一个 WorkOrder 只属于一个执行员工；更换员工必须创建新 revision 并写 Audit。
- `input_refs` 只允许引用已持久化的 UserInput、Knowledge、Artifact、Deliverable 或前置 WorkOrder 结果。
- `acceptance_criteria` 在 Child Task 启动前锁定；运行中修改只影响新 revision。
- `required_capabilities` 必须在启动前解析为该员工 readiness=`ready` 的 Capability Set。
- WorkOrder 不保存 Secret、完整私人 Conversation、模型 reasoning 或未授权 Memory。

### 5.5 Handoff 最小契约

```text
handoff_id
business_flow_id
source_work_order_id
target_work_order_id
deliverable_id
artifact_refs[]
summary
acceptance_result     pending | accepted | rejected
rejection_reason?
created_at
resolved_at?
```

Handoff 不是聊天消息，也不是 Tool 调用。目标员工只能读取显式列出的交付物和 ArtifactRef；源员工的原始 Context、私人 Memory 和未引用 ToolResult 默认不可见。

### 5.6 共享 Context 与 Memory

Business Flow 的共享 Context 使用引用而不是内容复制：

```text
shared_context_ref
  source_type       user_input | knowledge | artifact | deliverable
  source_id
  sensitivity
  allowed_agents[]
  content_hash
  added_by
  added_at
```

规则：

- Employee Memory 继续按 `owner_type=agent, owner_id=<agent>` 隔离。
- 业务流经验若需要跨员工复用，必须写成带 Provenance 的 Flow Knowledge 候选，并经 Runtime 门禁或用户确认。
- Coordinator 默认只看到 Child Task 的结构化状态、摘要、证据引用和成本，不自动看到执行员工的完整模型 Context。
- 敏感 Artifact 必须单独授权目标员工和目标 WorkOrder；业务流参与身份不等于全量读取权限。

### 5.7 Runtime 调度边界

首版采用 Rust 确定性调度：

1. 验证业务流输入、参与员工、依赖图和总预算。
2. 原子创建 Root Task、Business Flow、WorkOrder 和依赖记录。
3. 只启动依赖已满足的 WorkOrder。
4. 每个 WorkOrder 创建正常 Child Task / Run，复用 Generic Run Kernel。
5. Child Deliverable 验证成功后创建 Handoff，并解锁下游 WorkOrder。
6. Reviewer 拒绝时，按 revision 和预算创建一次明确返工，不篡改历史 Deliverable。
7. 所有必需 WorkOrder 和最终验收通过后，Root Task 才成功。

Python Coordinator 只能在后续阶段提出结构化 `BusinessFlowPlan` 或 `WorkOrderRevisionProposal`；Rust 必须验证无环依赖、员工存在、Capability readiness、权限、预算和最大并发数。

## 6. 建议数据模型

正式 Spec 应冻结以下追加模型，Migration 只追加：

| 表/字段 | 用途 |
|---|---|
| `tasks.parent_task_id` | Root Task 与 Child Task 自关联；可空，禁止环 |
| `business_flows` | 业务流元数据、Root Task、Coordinator、模板版本和总预算 |
| `business_flow_participants` | 参与员工与 coordinator/executor/reviewer 角色 |
| `work_orders` | 子目标、Child Task、负责人、验收、失败策略和 revision |
| `work_order_dependencies` | WorkOrder 有向无环依赖 |
| `handoffs` | 已验证 Deliverable 向下游交接及接受结果 |
| `shared_context_refs` | 业务流显式共享 Context 引用和授权范围 |

不新增 `work_order_actions`、`workflow_tasks` 或第二套 Event/Audit 表；继续复用 canonical `tasks`、`actions`、`agent_runs`、`runtime_events`、`approvals`、`artifacts`、`deliverables` 和 `audit_logs`。

## 7. API 与机器契约方向

### 7.1 建议 CLI

```text
business-flow-plan      # 纯校验和预览；不持久化、不执行
business-flow-start     # 用户确认后原子创建 Root/Child 事实
business-flow-status    # 返回 Flow、WorkOrder、Task、Deliverable 投影
business-flow-continue  # 提交 ask_user、Handoff 接受或返工决策
cancel-task             # 对 Root Task 取消并向未终结 Child Task 传播请求
```

首版不提供“员工 A 直接调用员工 B”的 CLI。

### 7.2 建议 Schema

- `business-flow-plan.schema.json`
- `business-flow-status.schema.json`
- `work-order.schema.json`
- `handoff.schema.json`
- `shared-context-ref.schema.json`
- 对应 valid examples 与 unknown-version、依赖环、越权引用、预算超限、伪造状态等 invalid fixtures。

## 8. macOS 产品交互

业务流入口放在“工作库”，不放进员工私人聊天列表。

### 8.1 创建

1. 用户输入业务目标和总验收。
2. 选择 Coordinator。
3. 添加 WorkOrder，明确员工、目标、输入、依赖、验收和预算。
4. Runtime 执行 `business-flow-plan`，展示缺失 Capability、权限、依赖环和预算风险。
5. 用户确认后执行 `business-flow-start`。

### 8.2 运行工作区

采用连续工作台而非卡片仪表盘：

```text
业务流标题 / 总状态 / 总预算 / 取消
────────────────────────────────
工作顺序与依赖
  需求分析 · 员工 A · 已完成
      └─ Handoff：需求文档 v1
  方案设计 · 员工 B · 进行中
      └─ 当前 Action / 等待审批
  质量审核 · 员工 C · 等待依赖
────────────────────────────────
右侧 Inspector：当前 WorkOrder、证据、权限、失败恢复
```

一对一 Conversation 只显示“已创建业务流 / 最终结果”的引用，不渲染其他员工的消息或任务时间线。

## 9. 分阶段实施

每一阶段必须独立可合并、可使用、可回滚；前一阶段不依赖后一阶段才有价值。

### Phase 1：显式顺序协作

交付：用户手动指定 Coordinator 和两名员工，创建线性 `A → B` 业务流；A 的 verified Deliverable 通过 Handoff 成为 B 的输入。

范围：

- ADR-034、Multi-Employee Spec、机器契约、追加 Migration；
- Root Task / Child Task、WorkOrder、单依赖 Handoff；
- Rust 串行调度与恢复；
- Work Library 最小创建页和运行时间线；
- 不支持自动员工选择、并行和 Reviewer 返工。

验收：

- 两名非默认员工可完成 `A → B`，B 看不到 A 的私人 Conversation；
- A 未通过 Deliverable gate 时 B 不启动；
- 重启后从已持久化边界继续，不重复 A 的副作用；
- 取消 Root Task 后，未启动 WorkOrder 取消，运行中的 Child Task收到 canonical cancellation request；
- 任一 `result_unknown` 阻止下游启动并要求人工核验；
- 总结果可追溯到 A、B、Finalization 三个 Child Task、Handoff 和 Artifact Hash。

回滚：隐藏业务流入口并停止创建新 Flow；保留 Migration 和历史 Flow 只读展示，不删除 Audit/Artifact。

### Phase 2：声明式业务流模板

交付：把稳定的顺序流程保存为仓库内 Workflow Package；用户只填写业务输入和员工映射即可启动。

范围：

- 模板包含 WorkOrder、依赖、Capability requirement、输入映射、验收和失败策略；
- 安装时验证 Schema、Hash、引用、无环和版本兼容；
- 模板只声明流程，不包含任意可执行代码；
- 运行时锁定 template/version/hash，更新只影响新 Flow。

验收：同一模板替换为另一组满足 Capability 的员工无需修改 Runtime；缺少能力时在任何模型或 Tool 调用前失败；历史 Flow 使用原模板快照恢复。

回滚：停止安装/启动新模板，显式 Phase 1 业务流继续可用。

### Phase 3：并行执行与 Reviewer

交付：支持无依赖 WorkOrder 的有界并行，以及独立 Reviewer 接受、拒绝和一次受预算约束的返工。

范围：

- 最大并发数由 Runtime 配置和 Flow Budget 共同限制；
- 同一有副作用资源默认串行；只有 Tool 声明 `concurrency_safe` 才允许并行；
- Reviewer 只读取验收标准和授权证据；拒绝必须提供 criterion、expected、actual 和建议动作；
- 返工创建新 WorkOrder revision，不覆盖历史结果。

验收：并行任务完成顺序不影响最终依赖解锁；取消、审批和 Tool 完成竞争只产生合法终态；Reviewer 不可自行扩大 Tool、Context 或预算。

回滚：将最大并发降为 1，并禁用 Reviewer 自动返工；已有 Flow 仍可串行收敛。

### Phase 4：受控智能协调

交付：Coordinator 可以提出员工分配、拆分或重排建议，但所有结构变更由 Rust 校验并在高影响变更前请求用户确认。

范围：

- Python 只产生严格的 `BusinessFlowPlanProposal`；
- Rust 校验员工、Capability、权限、依赖无环、预算、deadline 和最大 WorkOrder 数；
- v1 硬上限：每个 Flow 最多 5 名员工、12 个 WorkOrder、每个 WorkOrder 最多返工 1 次、最大并发 3；启动请求必须显式提交 Token 与 wall-clock 预算，缺失预算时拒绝启动；
- 不允许 Coordinator 创建新员工、安装 Package、授予 Secret 或扩大文件授权根目录。

验收：伪造员工、依赖环、越权 Context、超预算、递归委派和未知字段全部在执行前拒绝；用户拒绝重排后，当前 Flow 继续按原快照运行。

回滚：关闭智能提案入口，Phase 1–3 的显式/模板流程不受影响。

## 10. 失败、恢复与取消

| 场景 | 必须行为 |
|---|---|
| Child Task 普通失败 | 按 WorkOrder failure policy：停止、询问用户或继续独立分支 |
| Child Action 等待审批 | Child Task 与 Root Task 保持 running；下游等待依赖 |
| `result_unknown` | 停止相关依赖链；禁止自动重放；人工核验后继续或失败 |
| Runtime 崩溃 | 从 Root/Child Task、Checkpoint、Handoff 恢复；不重新创建已存在 Child Task |
| Coordinator 不可用 | 已创建 WorkOrder 可继续；需要新决策时进入 waiting_user |
| 员工被停用 | 已运行 Child Task 按锁定 Snapshot 完成或由用户取消；新 WorkOrder 不得分配 |
| Root Task 取消 | 对未终结 Child Task 写入 cancellation request；保留已确认副作用和交付证据 |
| Handoff 被拒绝 | 保留原 Deliverable，创建有界 revision；不覆盖历史 |

## 11. 安全与成本边界

- 权限绑定 Child Task / Action / Agent / Resource，不能只绑定 Business Flow。
- Flow 参与者身份不自动授予其他参与者的文件、Memory、Knowledge 或 Conversation 访问权。
- 所有 Tool 调用继续经过 Rust ToolExecutor。
- 每个 Child Task 记录独立模型、Token、时间、Tool 调用、失败原因和 Deliverable 质量；Root Task 聚合但不伪造计费事实。
- 启动前计算静态预算上限；运行中达到 Flow Budget 时进入 `waiting_user`，不得静默超支。
- 多员工成本增长主要来自重复模型调用、重复 Context、Reviewer 和返工；不能用员工数量直接推算账单。

## 12. Eval 与发布门禁

每阶段至少覆盖：

1. Happy path：两员工顺序交付并产生 verified 最终结果。
2. 隔离：目标员工无法读取源员工私人 Conversation 和非授权 Memory。
3. 能力缺失：员工 Skill/Tool readiness 不满足时副作用前失败。
4. 依赖：上游失败、未验证或 `result_unknown` 时下游不启动。
5. 权限：Handoff 不会扩大 Child Task 的 Tool/文件权限。
6. 恢复：模型调用前、ToolResult 后、Handoff 创建后、下游启动前分别崩溃并恢复。
7. 幂等：重复 start/continue/cancel 不创建重复 Child Task、Handoff 或副作用。
8. 取消：Root 与 Child 并发取消符合 canonical 状态机。
9. 预算：Token、Tool round、返工和并发达到上限时明确停止。
10. UI：私人聊天只展示本员工消息；业务流工作区只展示当前 Flow 的 WorkOrder 和交付。

统一门禁仍为：

```bash
./scripts/check.sh
```

此外必须提供至少一个真实本地 E2E：用户创建的两名员工、两个不同 Skill、一个 Handoff、一个 verified Artifact、重启恢复、最终 Deliverable 可追溯。

## 13. 影响范围与实施成本

完整实现预计超过 8 个文件，并跨越：

- ADR、Unified Data Model、MVP API、Generic Runtime、Security、Memory、Observability 文档；
- `contracts/` Schema、正反例和检查脚本；
- SQLite 追加 Migration；
- Rust Runtime 调度、恢复、权限、事件和 CLI；
- Python 结构化协调提案（Phase 4 才进入）；
- Swift Work Library、业务流工作区和 Inspector；
- Runtime/Python/Swift/E2E 测试。

这是新的产品能力和架构阶段，不应与当前聊天隔离 Bug 修复混在同一提交或发布中。

## 14. 最脆弱前提

本规划假设业务可以被拆为“明确输入、单一负责人、可验证输出”的 WorkOrder。如果实际业务必须依靠多个员工无限自由讨论才能推进，结构化 Handoff 会显得受限；但放弃该约束会直接失去权限隔离、恢复、预算、责任和验收。因此即使未来增加协作讨论，也只能作为 Business Flow 内的审计事件或评论，不得替代 WorkOrder、Task 和 Deliverable。

## 15. 已确认的设计结论

用户已确认本规划。下一步只生成 ADR-034 草案和 Multi-Employee Business Flow Specification v1.0，不写实现代码。已确认结论：

> 多员工协作采用“Root Task + 每员工 Child Task + WorkOrder + Handoff + Verified Deliverable”，私人 Conversation 与员工 Memory 继续隔离；首版只做用户显式指定的两员工顺序协作。
