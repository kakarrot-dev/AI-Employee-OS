# AI Employee OS Generic Agent Runtime Specification v1.0

> 文档类型：架构与运行契约规范
> 状态：Draft for approval
> 日期：2026-08-06
> 前置依据：`docs/plans/AI Employee OS 通用 Agent Runtime 重建计划 v0.1.md`
> 规范优先级：本文件获批后，必须先以新 ADR、Unified Data Model、`contracts/` 和 MVP API Spec 落实，才可成为实现事实源。

## 1. 结论

AI Employee OS 的工作执行主路径重建为与业务无关的 Generic Agent Runtime：

```text
Agent Snapshot
    + Skill Package
    + Bounded Context
    + Minimal Tool Surface
            |
            v
Rust Run Kernel <-> Python Task Worker
            |
            v
Rust ToolExecutor -> ToolResult / Artifact -> Deliverable
```

默认执行模式为 `agent_loop`。Python 只返回 `ask_user | tool_call | complete` 三类结构化决策；Rust 创建 Task、Run、Action、安全字段、审批、Tool 调用、Checkpoint、Deliverable、Evaluation 和最终状态。

首版只开放 Rust Native Tool Adapter。MCP 与 HTTP/OpenAPI 的统一 Adapter 接口在本规范中冻结，但不进入 v1.0 实现和发布门禁。Skill Resolver 首版支持显式 `skill_id` 与确定性规则选择；模型语义判别在确定性候选集小于等于 3 时可启用，但聊天接入前必须有歧义回退。`waiting_user` 是 Run phase，Task 保持 `running`，不新增 Task 状态。

## 2. 目标与成功标准

### 2.1 目标

- 任意已安装、已绑定、依赖满足且契约兼容的 Skill 可走同一条 Runtime 主链。
- 新增 Skill 不修改 Rust/Python Runtime；新增 Rust 已支持的 Native Tool 不修改 Python Worker。
- Runtime 不识别 PRD、研究、写作等业务语义，不硬编码员工 ID、Skill ID、固定资料或输出模板。
- 模型自主性被限制在锁定的 Agent、Capability Set、Context、Toolset、预算和停止规则内。
- 所有系统副作用都经过 Rust ToolExecutor，并可审计、恢复和验证。
- Deliverable 只能由真实 Artifact、ResultRef、ToolResult 或确定性验证证据支持。

### 2.2 发布级成功标准

以下条件必须同时成立：

1. 纯推理、单 Tool、多轮 Tool 三类测试 Skill 通过同一 Run Kernel。
2. 将测试 Skill ID 或员工 ID 替换为另一合法值时不修改 Runtime 源码。
3. 未声明 Tool 不进入模型可见动作空间；缺依赖在任何副作用前失败。
4. 运行中修改员工配置不改变已锁定 Run；新 Run 使用新 Prompt Hash。
5. ToolResult 已持久化后的恢复不重复执行 Tool；`result_unknown` 不自动重放。
6. 没有满足 output schema 和 evidence policy 时，Task 不得 `succeeded`，不得产生 `verified` Deliverable。
7. 删除或停用 `prd-generation` 后，其余通用测试 Skill 仍可运行。
8. `chat-send`、显式 `run-skill` 与 Swift Task Inspector 展示同一 canonical Task/Action/Run 事实。

## 3. 非目标

- 不恢复 `app.worker`，不修补或复制旧 `golden_path`。
- 不引入 Multi-Agent、Subagent、Computer Use、Cloud Sync、Marketplace 或企业 RBAC。
- 不允许 Skill 自带任意可执行脚本；Skill 不是 Plugin Runtime。
- 不在 v1.0 启用 MCP、HTTP/OpenAPI 或任意 CLI Tool Adapter。
- 不把 Deep Agents 或 LangGraph 作为持久化 Runtime 或状态事实源。
- 不为所有 Skill 强制 DAG；`workflow` 只服务确定顺序、高风险或可恢复分步流程。
- 不迁移历史 Golden Path 中间状态到新 Run；只保留只读 Task/Action/Audit 展示。
- 不持久化或展示模型私有 reasoning。

## 4. 事实源与决策变更

本规范与现行 ADR-031、架构总览及部分 Runtime/Skill/API 文档存在明确冲突。实现前必须按以下顺序变更：

1. 在 `docs/AI Employee OS 技术决策记录 ADR（Architecture Decision Records）v1.0.md` 新增 ADR-032，标记 ADR-031 被取代。
2. 更新 `docs/AI Employee OS Unified Data Model v1.0.md`，加入 Run、Checkpoint、Deliverable、Artifact、Snapshot 的 canonical 持久化模型。
3. 新增/修订 `contracts/` 机器契约及正反例。
4. 更新 `docs/AI Employee OS MVP API & Interface Specification v1.0.md` 的 CLI/子进程协议。
5. 更新 Runtime、Skill、Tool、Security、Observability 专题文档。
6. 最后更新 `docs/架构总览.md`、`AGENTS.md` 和产品说明。

ADR-032 必须冻结：Rust 是 Task/Action/Run/权限/副作用事实源；`agent_loop` 是默认模式；`workflow` 为可选模式；Golden Path 仅作迁移期兼容入口；Deep Agents/LangGraph 不是状态源。

## 5. 核心术语与所有权

| 对象 | 定义 | 唯一所有者 |
|---|---|---|
| Agent | 执行主体及其 Identity/Soul/Persona/模型配置 | Rust + SQLite |
| Skill | 声明式工作方法、输入输出、Context、Tool 和预算约束 | 已安装 Package 快照 |
| Run | 一次 Task 的执行实例及循环状态 | Rust Run Kernel |
| Decision | Python 基于当前 Context 提出的下一步建议 | Python 产生，Rust 校验 |
| Action | 可审计的内部或 Tool 执行单元 | Rust |
| Tool | 已安装并由受信任 Adapter 实现的系统能力 | Rust Tool Registry/Executor |
| Observation | 已确认的模型调用或 Tool 结果摘要与引用 | Rust RunState |
| Artifact | 外置的内容或文件证据 | Rust 登记，受控存储持有 |
| Deliverable | 面向用户的交付记录及其验证状态 | Rust |
| Evaluation | 对结果、轨迹、副作用、恢复、成本、风险的判定 | Rust 编排 |

Conversation/Message、RunState、Memory、Knowledge 相互独立：Message 是交流事实；RunState 是执行事实；Memory 是跨 Run 可召回信息；Knowledge 是有来源的外部材料。任何摘要都不得取代 canonical 状态。

## 6. 进程与信任边界

### 6.1 Swift macOS Client

- 发起显式 Skill Run 或发送聊天消息。
- 通过 Runtime CLI 读取 capability readiness、Task、Action、Run、事件和 Deliverable。
- 展示、请求审批、继续等待中的 Run、取消 Task。
- 不选择 Tool、不拼接 Effective Prompt、不推理、不执行副作用、不推断本地成功状态。

### 6.2 Rust Runtime

- 读取并锁定 Agent/Skill/Tool/Context 配置。
- 创建 Task、Run、Action、Snapshot、Checkpoint、Event、Audit。
- 组装受信任边界明确的 Context，调用 Python Worker。
- 校验 Decision、生成安全字段、授权并执行 Tool。
- 验证输出、登记 Artifact/Deliverable、执行 Evaluation、收敛 Task。
- 仅从受控进程环境向 Python 注入模型 Secret；Secret 不进入请求 JSON。

### 6.3 Python Task Worker

- 接收一个已裁剪的 `AgentRunRequest`。
- 调用模型并返回一个 `AgentDecision`。
- 不打开 SQLite，不读取 Keychain，不调用本地 Tool，不生成系统安全字段，不改变状态。
- 每次调用均为可重试的无副作用决策调用；对话上下文由 Rust 明确传入。

### 6.4 Rust ToolExecutor

- 只接受 Rust 内部构造且已通过 Schema、权限、审批、deadline 和幂等校验的 ToolCall。
- 将 ToolResult 与 side-effect state 原子持久化到可恢复边界。
- 对未知版本、权限、Tool、Action 或枚举默认拒绝。

## 7. Skill Package v2

### 7.1 目录

```text
<skill>/
├── manifest.yaml
├── SKILL.md
├── references/       # 可选，命中后按需加载
├── templates/        # 可选，命中后按需加载
├── evals/            # 必需，至少一个 happy path 和一个 failure case
└── workflows/        # execution.mode=workflow 时必需
```

安装时 Runtime 必须验证目录边界、Schema、引用存在性、Hash、版本兼容、Tool 依赖和 workflow 无环性；成功后保存不可变 Manifest Snapshot 和 package hash。运行期间不重新读取漂移后的文件。

### 7.2 Manifest 必需字段

```yaml
schema_version: 2.0.0
skill:
  id: structured-summary
  name: Structured Summary
  version: 1.0.0
  description: 将输入材料整理为结构化摘要
  category: general
  runtime_compatibility: ">=2.0.0 <3.0.0"
  status: active
  instructions: SKILL.md
  routing:
    explicit: true
    triggers: [summarize, 结构化摘要]
    positive_examples: ["总结这段材料"]
    negative_examples: ["创建一个本地文件"]
  context:
    required: []
    optional: []
    max_bytes: 65536
  tools: []
  input_schema: {type: object, additionalProperties: false, required: [text]}
  output_schema: {type: object, additionalProperties: false, required: [summary]}
  execution:
    mode: agent_loop
    max_model_turns: 4
    max_tool_calls: 0
    max_duration_ms: 60000
    on_result_unknown: stop
  deliverables:
    required: false
    allowed_types: [structured_result]
    evidence: output_schema
  evaluation:
    timing: before_delivery
    block_on_failure: true
    suite: evals/suite.json
```

完整 Schema 规则：

- 根对象和所有安全相关对象 `additionalProperties: false`。
- `schema_version` 首版只接受 `2.0.0`；未知版本拒绝安装和运行。
- `id`、`version`、文件引用、Tool Action、Context selector 均在安装时校验。
- `routing.explicit` 表示是否允许 CLI/UI 显式选择，不表示自动路由权限。
- `tools[]` 声明 `id`、版本范围、允许 Action、最大调用数、是否允许副作用及缺失策略。
- `execution.mode` 只允许 `agent_loop | workflow`。
- `workflow` 必须引用 `workflows/*.yaml`，不得内嵌可执行代码。
- `deliverables.evidence` 只允许 `output_schema | artifact | tool_verification | combined`。

Skill 指令属于已签名/锁定的受信任 Package 数据，但不能覆盖 Runtime Policy、权限、安全字段或 Tool 约束。

## 8. Capability Readiness 与 Skill Resolver

### 8.1 Readiness

废止单一 `tasks_enabled` 作为能力证明。Runtime 对每个 Agent-Skill 组合返回：

```text
ready | disabled | missing_dependency | incompatible | invalid_package
```

同时返回机器可读 `reason_codes[]`，至少包含：

- `agent_inactive`
- `skill_unbound`
- `skill_disabled`
- `runtime_incompatible`
- `tool_missing`
- `tool_action_missing`
- `permission_unavailable`
- `context_missing`
- `package_invalid`

`tasks_enabled` 在迁移期只可作为 `ready skills > 0` 的派生兼容字段，不再参与授权决策。

### 8.2 Resolver

执行顺序固定：

1. 过滤未绑定、停用、版本不兼容、依赖不满足的 Skill。
2. 若请求携带 `skill_id`，只校验该 Skill，不回退到其他 Skill。
3. 否则按 trigger/正反例做确定性召回并排序。
4. 只有候选数为 2–3 且分值接近时，才允许 Python 做结构化选择和 input extraction。
5. 无候选返回 `capability_not_found`；无法唯一选择返回 `skill_selection_ambiguous` 并请求用户澄清。

模型不得选择候选集以外的 Skill。Resolver 失败不得创建 Tool Action，不得产生副作用。

聊天工作使用 Capability Set Resolver：Intent 只判断 `chat | task`；Rust 将员工全部 readiness=`ready` 的绑定 Skill 锁定为本 Run 候选集合。模型不在 Run 启动前唯一选择 Skill，而是在每个 `tool_call` 中声明候选集合内的 `skill_id`。显式 `run-skill` 仍构建只含目标 Skill 的 Capability Set。

## 9. Agent 与运行快照

Run 创建时必须原子锁定：

- `agent_id`、`agent_config_version`、`effective_prompt_sha256`、编译后 Prompt 引用；
- Capability Set 中每个 `skill_id`、`skill_version`、Manifest/Instructions/package hash；
- Tool ID、版本、Action、Manifest hash；
- Context selector 结果及 provenance/hash；
- 模型 provider/model 和非 Secret 配置；
- 预算、deadline、创建时间。

快照生成失败时 Task 保持 `pending` 或直接 `failed`，不得进入模型调用。运行中 Package/员工配置变化只影响新 Run。

## 10. Context Pipeline

### 10.1 信任等级与顺序

每次模型调用按固定顺序组装：

1. `runtime_policy`：trusted，Rust 固定提供。
2. `agent_prompt`：trusted，Rust 编译并锁定。
3. `skill_instructions`：trusted_package，锁定 Hash。
4. `tool_descriptions`：trusted_registry，仅当前允许 Action。
5. `task_input` / `user_messages`：untrusted_data。
6. `memory`：untrusted_data，含 provenance。
7. `knowledge`：untrusted_data，含 source URI/hash。
8. `observations`：trusted_fact_wrapper + untrusted_content。

后层不得覆盖前层规则。ToolResult 文本即使来自受信任 Tool，也只能作为数据，不升级为指令。

### 10.2 操作

Context Pipeline 必须支持：

- `write`：形成结构化 section，不直接拼接任意系统文本；
- `select`：按 Skill selector、预算和 provenance 选择；
- `compress`：只压缩内容，保留来源、Hash 和未压缩引用；
- `isolate`：大结果或不可信内容以 Artifact/ResultRef 外置；
- `trace`：记录模型实际可见 section 的类型、Hash、字节数和来源，不记录 Secret/私有 reasoning。

超限时优先外置 ToolResult，再压缩历史 Observation，再裁剪 optional Context；required Context 无法容纳则以 `context_budget_exceeded` 失败，不静默丢弃。

## 11. Runtime 生命周期

### 11.1 Phase

`RunPhase` 为独立字段，不改变 Task/Action 枚举：

```text
created
preflight
context_build
model_decision
waiting_user
authorize
waiting_approval
tool_execution
observe
validate_output
build_deliverable
evaluate
terminal
```

合法主路径：

```text
created -> preflight -> context_build -> model_decision
model_decision -> waiting_user -> context_build
model_decision -> authorize -> waiting_approval -> tool_execution
model_decision -> authorize -> tool_execution -> observe -> context_build
model_decision -> validate_output -> build_deliverable? -> evaluate -> terminal
```

Task 映射：Run 创建后 Task `running`；`waiting_user` 和 `waiting_approval` 时仍为 `running`；成功验证后为 `succeeded`；不可恢复错误为 `failed`；取消为 `cancelled`。审批等待必须由对应 Action `blocked` 表达。

### 11.2 停止条件

任一条件触发时禁止继续模型/Tool 循环：

- 达到 `max_model_turns`、`max_tool_calls`、`max_duration_ms` 或 deadline；
- 用户取消；
- Action `result_unknown`；
- Schema/权限/审批校验失败；
- 连续两次决策没有产生新信息、状态变化或有效用户请求；
- Worker 协议错误达到 2 次；
- required Context/Tool 失效。

预算耗尽返回明确错误并保留已有证据，不伪装为成功。

## 12. AgentDecision 协议

Python 每次只返回一个 JSON 对象：

```json
{
  "schema_version": "1.0.0",
  "type": "tool_call",
  "skill_id": "local-file-operations",
  "tool_id": "document-tool",
  "action": "create_markdown",
  "arguments": {"path": "deliverables/summary.md", "content": "..."},
  "rationale_summary": "需要创建声明的交付文件"
}
```

三类决策字段：

| 类型 | 必需业务字段 | 语义 |
|---|---|---|
| `ask_user` | `question`, `required_input_schema` | 缺少必须由用户提供的信息 |
| `tool_call` | `skill_id`, `tool_id`, `action`, `arguments`, `rationale_summary` | 通过锁定 Skill 请求一个当前允许 Action |
| `complete` | `output`, `deliverable_candidates`, `evidence_refs` | 声明候选结果，等待 Rust 验证 |

Python 禁止返回 `call_id`、`action_id`、`idempotency_key`、`permission_context`、`approval_id`、`deadline`、`trace_id`、`attempt`。出现任一禁止字段即 `decision_forbidden_field`，不执行 Tool。

Rust Decision Validator 必须校验 Schema 版本、Decision 类型、预算、Tool surface、参数 Schema、路径边界、引用存在性和停止条件；然后由 Rust 生成全部系统字段。

## 13. Tool Surface 与 Adapter

### 13.1 最小动作空间

当前模型可见 Tool surface 是以下集合的交集：

```text
installed active Tool Actions
∩ Skill declared Actions
∩ current workflow step allowance
∩ permission/policy allowance
∩ runtime compatibility
```

描述中不暴露 Secret、内部入口路径或未授权 Action。

### 13.2 v1.0 Adapter

- `rust-native-v1`：本轮唯一启用类型；Adapter 必须在受信任 Rust Registry 显式注册。
- `mcp-v1`：只冻结能力接口，必须经 Tool Gateway、域名/Server allowlist、认证引用和响应 Schema；v1.0 返回 `adapter_not_enabled`。
- `http-openapi-v1`：只冻结能力接口，必须经域名 allowlist、认证引用、超时、大小限制和响应 Schema；v1.0 返回 `adapter_not_enabled`。

Manifest 不能创造执行能力。未注册 Adapter 或 Action 默认拒绝。

### 13.3 ToolCall 所有权

Rust 生成的 `idempotency_key` 必须由 `task_id + run_id + action_id + tool_id + action + normalized_arguments_hash` 确定性派生；模型重试不得改变同一逻辑副作用的 Key。副作用 Action 在结果未确认前不得自动重放。

## 14. RunState、Checkpoint 与恢复

### 14.1 RunState 最小字段

- `run_id`、`task_id`、`schema_version`、`revision`；
- Agent/Skill/Toolset/Context Snapshot 引用；
- `phase`、`waiting_reason`、`stop_reason`；
- `model_turns_used`、`tool_calls_used`、`started_at`、`deadline`；
- Observation 引用序列；
- 当前/最近 Action；
- Deliverable/Evaluation 引用；
- `created_at`、`updated_at`。

RunState 使用乐观 revision；写入必须在 SQLite transaction 中同时追加 Runtime Event。未知 phase 或 schema version 默认拒绝恢复。

### 14.2 Checkpoint

必须在以下边界持久化：

1. 模型调用前；
2. Decision 校验后；
3. Tool 执行前，Action 与 ToolExecution 已持久化；
4. ToolResult 已持久化；
5. Observation 已登记；
6. Deliverable 已验证。

Checkpoint 保存状态引用和 Hash，不复制 Secret，不存模型私有 reasoning。

### 14.3 恢复矩阵

| 已确认事实 | 恢复动作 |
|---|---|
| 模型调用前 checkpoint | 可重试模型，增加 attempt 并受预算限制 |
| Decision 已校验、无 Action | 重新由 Rust 物化 Action |
| Action 已创建、ToolExecution 未开始 | 重新校验授权/deadline 后执行 |
| ToolResult 已持久化 | 只重放 Observation，不执行 Tool |
| side effect 不确定 | Action=`result_unknown`，Run 停止并等待人工核验 |
| Deliverable 已验证 | 只执行 Evaluation/终态收敛，不重复生成 |

恢复必须幂等。人工核验只能将 `result_unknown` 收敛为 `succeeded | failed`，并追加 Audit，不修改历史事件。

## 15. Deliverable、Artifact 与 Evidence

### 15.1 ArtifactRef

ArtifactRef 至少包含：`artifact_id`、`kind`、`uri`、`media_type`、`size_bytes`、`sha256`、`created_by_action_id`、`created_at`、`sensitivity`、`verification_status`。本地路径必须位于 Runtime 授权根目录内，禁止 `..` 和符号链接逃逸。

### 15.2 Deliverable

Deliverable 至少包含：

- `deliverable_id`、`task_id`、`run_id`；
- Agent/Skill Snapshot 引用；
- `type`、`title`、`summary`；
- `artifact_refs[]`、`tool_result_refs[]`、`verification_refs[]`；
- `status: candidate | verified | rejected`；
- output schema 校验结果和 Evaluation 引用；
- `created_at`、`verified_at`。

`complete` 只是候选完成。Rust 依次执行 output schema、evidence policy、Artifact 可读性/Hash、Tool verification、Evaluation gate；全部满足后才写 `verified` 并将 Task 标记为 `succeeded`。

纯推理 Skill 可用通过 output schema 的结构化结果作为 Evidence；声明 `artifact` 或 `tool_verification` 的 Skill 缺少对应证据时必须失败。

## 16. `workflow` 模式

`workflow` 复用 canonical Task/Action 状态，不新增节点状态表。Workflow 只声明业务 Step、依赖、允许 Tool、输入映射、输出名、超时和失败策略；Run Kernel 仍控制模型、权限、审批、Checkpoint 和 Deliverable。

每个 Step 必须物化为 Action。无 Tool 的模型 Step 仍是内部 Action；有副作用的 Tool Step 默认 `max_attempts: 1`。下游只在依赖 Action `succeeded` 后运行。Workflow 初始化失败必须收敛已创建 Action 和 Task，不留下孤立 `running` 状态。

## 17. CLI 与子进程接口

### 17.1 Runtime CLI

新增：

```text
run-skill --database <path> --repository-root <path>
          --agent-id <id> --skill-id <id> --input-json <json>
          [--conversation-id <id>] [--stream-events]

continue-run --database <path> --run-id <id>
             --input-json <json> [--stream-events]

run-status --database <path> --run-id <id>

capability-readiness --database <path> --repository-root <path>
                     --agent-id <id>
```

命令 stdout 只输出一个 JSON 对象或 NDJSON 事件流；诊断写 stderr；非零退出码表示命令/协议失败，不代表已持久化 Task 一定失败。所有响应包含 `schema_version`。

迁移期保留 `run-task`，内部转发到明确指定的兼容 Skill；聊天切换完成后删除其 Golden Path 实现。不得让 `run-task` 静默选择硬编码 Alex/PRD。

### 17.2 Python Worker

Rust 使用受控 stdin/stdout NDJSON：

```text
python3 -m app.task_worker
```

每次请求一个 `AgentRunRequest`，每次响应一个 `AgentDecision`。Worker 启动和单次决策分别有超时；stdout 非 JSON、额外字段、未知版本、提前退出或超时均为协议错误。stderr 可写脱敏诊断，不得输出 Secret 或完整 Context。

## 18. 数据模型

采用 append-only Migration 新增：

- `agent_runs`：Task 一对多 Run，保存 phase、revision、预算计数、等待/停止原因。
- `run_snapshots`：Agent/Skill/Toolset/Context 的不可变 JSON 引用与 Hash。
- `run_observations`：按 sequence 保存已确认 observation 摘要和 ResultRef。
- `run_checkpoints`：按 revision 保存 checkpoint kind、state hash 和时间。
- `artifacts`：外置内容元数据、Hash、敏感级别和验证状态。
- `deliverables`：候选/已验证/拒绝交付记录。
- `deliverable_evidence`：Deliverable 到 Artifact/ToolResult/Verification/Evaluation 的类型化引用。

现有 `tasks`、`actions`、`tool_executions`、`runtime_events`、`approvals`、`audit_logs`、`evaluations` 继续复用。不得创建第二套 Task/Action 状态列。

删除策略：Run/Checkpoint/Observation 随 Task 级联；有 Audit/Approval 的 Task 继续受 canonical 删除规则约束；Artifact 文件删除必须先检查 Deliverable 引用并追加 Audit，不能仅依赖数据库级联删除文件。

## 19. 错误码

错误响应统一包含 `code`、`message`、`retryable`、`task_id?`、`run_id?`、`action_id?`。首版必须覆盖：

| 类别 | 错误码 |
|---|---|
| Package/能力 | `skill_not_found`, `skill_unbound`, `skill_not_ready`, `package_invalid`, `runtime_incompatible` |
| Resolver/Input | `capability_not_found`, `skill_selection_ambiguous`, `input_schema_invalid`, `required_context_missing` |
| Context | `context_budget_exceeded`, `context_source_unavailable` |
| Worker/Decision | `worker_timeout`, `worker_disconnect`, `decision_schema_invalid`, `decision_forbidden_field`, `decision_no_progress` |
| Tool/Security | `tool_not_allowed`, `tool_action_not_allowed`, `permission_denied`, `approval_required`, `deadline_exceeded`, `result_unknown` |
| Output | `output_schema_invalid`, `evidence_missing`, `artifact_invalid`, `evaluation_failed` |
| 状态/恢复 | `invalid_transition`, `checkpoint_conflict`, `recovery_requires_verification`, `cancelled` |

错误信息不得包含 Secret、完整 Prompt、完整 Tool 参数或敏感文件内容。

## 20. Runtime Events 与用户可见状态

新增事件类型至少包括：

- `run.created`, `run.phase_changed`, `run.waiting_user`, `run.resumed`；
- `skill.resolved`, `context.built`, `model.decision_received`；
- `action.authorization_required`, `action.result_unknown`；
- `artifact.registered`, `deliverable.candidate`, `deliverable.verified`；
- `evaluation.completed`, `run.failed`, `run.cancelled`, `run.succeeded`。

Swift 显示映射：

| Runtime 事实 | 用户文案 |
|---|---|
| `preflight/context_build` | 正在准备工作环境 |
| `model_decision` | 正在分析下一步 |
| `waiting_user` | 需要你补充信息 |
| Action `blocked` | 等待你的批准 |
| `tool_execution` | 正在执行已授权操作 |
| Action `result_unknown` | 执行结果待人工确认 |
| `validate_output/evaluate` | 正在核验交付结果 |

客户端不得用动画或本地计时器伪造阶段，不得把 candidate Deliverable 标为已完成。

## 21. 安全要求

- API Key 只从 macOS Keychain 经受控环境注入需要它的 Python 进程；不进入 CLI 参数、SQLite、Context、Trace、Artifact 或日志。
- Skill、Memory、Knowledge、User Input 和 ToolResult 中的指令冲突时，Runtime Policy 始终优先。
- Tool 参数必须通过 JSON Schema、路径/域名策略、权限、审批和敏感字段脱敏。
- 未知 Schema/枚举/权限/Adapter 默认拒绝。
- Audit 只追加，记录决策结果、政策版本和引用 Hash，不记录模型私有 reasoning。
- 取消只阻止尚未开始的 Action；正在进行的不可中断副作用必须等待结果并正确收敛。

## 22. Evaluation 与发布门禁

每个 Run 记录：

1. 结果：input/output schema、Deliverable、用户目标。
2. 轨迹：Skill/Tool 选择、调用顺序、无进展循环、禁止动作。
3. 副作用：幂等、审批、重复执行、`result_unknown`。
4. 恢复：崩溃、等待用户、等待审批、取消。
5. 成本：模型轮次、Token、Tool 调用、时延。
6. 风险：越权、Secret、Prompt Injection、未知字段/版本。

确定性事实必须用代码判断；只有内容质量可使用 Rubric、人工或 LLM Judge。LLM Judge 失败或不可用不得覆盖确定性失败。

发布前必须通过：Schema 正反例、Rust 单元/集成、Python 协议、Fake Provider E2E、fresh/replay migration、恢复/不重复副作用、Secret 边界、`./scripts/check.sh`。聊天/UI 阶段还需 `./script/build_and_run.sh` 和真实 App 三类 Skill 手动验收。

## 23. 关键序列

### 23.1 单 Tool 成功

```text
Client -> Rust: run-skill(agent, skill, input)
Rust -> SQLite: Task + Run + Snapshots
Rust -> Python: AgentRunRequest
Python -> Rust: tool_call(tool, action, args)
Rust -> SQLite: Action + pre-tool checkpoint
Rust -> ToolExecutor: authorized ToolCall
ToolExecutor -> SQLite: ToolResult + Artifact
Rust -> SQLite: Observation + checkpoint
Rust -> Python: next AgentRunRequest
Python -> Rust: complete(output, evidence_refs)
Rust -> SQLite: verified Deliverable + Evaluation + Task succeeded
Rust -> Client: canonical events/result
```

### 23.2 结果不确定

Tool 超时且无法证明副作用未发生时，ToolExecutor 写 `side_effect_state=unknown`，Action 转为 `result_unknown`，Run 停止在 `terminal` 且 `stop_reason=result_unknown`，Task 保持 `running`。只有人工核验命令追加证据并收敛 Action 后，Run 才能继续或失败；禁止自动重放。

### 23.3 等待用户

Python 返回 `ask_user`，Rust 保存问题、所需输入 Schema 和 checkpoint，Run=`waiting_user`、Task=`running`。`continue-run` 校验用户输入和 Run revision 后追加 Message/Observation，再进入 `context_build`；重复提交同一 continuation key 不得产生两次恢复。

## 24. 兼容与退出策略

1. 新增 Schema/Table/CLI，不修改已发布 Migration。
2. 先让显式 `run-skill` 可独立工作；旧聊天/Golden Path 不受影响。
3. 新增 capability readiness，同时保留派生 `tasks_enabled` 供旧 Client 使用。
4. 聊天切换到 Resolver/Run Kernel 后，旧 `run-task` 仅做兼容转发。
5. 通过新旧路径对照和回归门禁后，删除 Golden Path 产品入口、`golden_path.rs`、`app.worker` 引用和固定 Demo 数据。
6. 历史 Task/Action/Audit 只读展示；不伪造新 Run，也不回填无法证明的 Snapshot/Deliverable。

每阶段回滚只回滚入口和代码，不回滚或改写已执行 Migration。新增表在回滚版本中保持未使用，已有 Audit/Artifact 不删除。

## 25. 最脆弱前提

本规范假设 Skill 是声明式工作方法和约束，Tool 才是可执行能力。如果产品要求 Skill 自带任意代码，当前信任模型立即失效，必须另立 Plugin Runtime Spec，覆盖签名、Sandbox、依赖供应链、资源配额、Secret 隔离与进程权限；不得在本规范内以脚本入口绕过。

## 26. 决策摘要

- **Building**：Rust 所有、可恢复、有证据的通用 Agent Run Kernel，支持默认 `agent_loop` 与可选 `workflow`。
- **Not building**：任意 Skill 代码执行、MCP/HTTP 实际接入、Multi-Agent、Computer Use、第二套状态源。
- **Approach**：先显式 Skill Run 和 Rust Native Tool，再渐进加载/Resolver，再聊天接入，最后恢复能力与旧路径退出。
- **Key decisions**：`agent_loop` 默认；Rust 生成安全字段；`waiting_user` 是 Run phase；Deliverable 必须验证；`tasks_enabled` 降为派生兼容字段。
- **Unknowns**：无阻塞实现的未决项。MCP/HTTP 的认证与网络策略由后续独立 Spec 负责，不属于本轮交付。
