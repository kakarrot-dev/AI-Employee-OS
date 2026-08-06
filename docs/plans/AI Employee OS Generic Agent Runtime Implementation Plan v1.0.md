# AI Employee OS Generic Agent Runtime Implementation Plan v1.0

> 文档类型：可执行实施计划
> 状态：Draft for approval
> 日期：2026-08-06
> 目标规范：`docs/AI Employee OS Generic Agent Runtime Specification v1.0.md`
> 约束：本计划不授权立即编码；规范与计划获批后方可实施。

## 1. 交付目标

将当前 `chat-send/run-task -> golden_path -> app.worker` 的业务硬编码路径，迁移为：

```text
explicit run-skill
    -> Rust Run Kernel
    -> Python task_worker decisions
    -> Rust ToolExecutor
    -> verified Deliverable
    -> chat resolver integration
    -> Golden Path retirement
```

五个阶段均可独立合并、验证和回滚。任何阶段未完成时，已合并阶段仍提供可使用能力；旧产品路径直到新聊天路径验收完成前保持可用。

预计涉及超过 8 个文件和 Rust/Python/Swift/SQLite/JSON Schema 五个边界，这是架构迁移，不作为隐性 Bug Fix 处理。每阶段使用单一目的提交，且只暂存列出的路径。

## 2. 实施前基线

开始任何代码修改前执行：

```bash
git status --short --branch -uall
git diff -- runtime/rust-core/src/main.rs runtime/python-agent/app apps/macos/AIEmployee
./scripts/check.sh
```

当前已知工作区在 2026-08-06 存在未提交的 Swift、Rust、Python、脚本和设计文档修改。实施者必须逐文件读取 diff，禁止覆盖、还原或全量暂存；若目标文件有不属于本计划的重叠修改，先在同一文件内保留并围绕其最小编辑。

基线证据保存为实施记录，不将失败基线误记为本计划回归。

## 3. 全局不变量

- Task 状态只允许 `pending | running | succeeded | failed | cancelled`。
- Action 状态只允许 `pending | running | succeeded | failed | blocked | result_unknown | cancelled`。
- 所有 Tool 调用经过 Rust ToolExecutor；Python 不获得系统权限。
- 未知 Schema、枚举、权限、Tool 或 Adapter 默认拒绝。
- Migration 只追加；fresh install、重复启动、外键和完整性必须测试。
- Secret 不进入参数、数据库、日志、Trace、Memory、Context 或 Artifact。
- 无验证 Evidence 不产生 `verified` Deliverable，不将 Task 标记为 `succeeded`。
- `result_unknown` 禁止自动重放。
- 不硬编码 Alex、`ai-product-manager`、`prd-generation` 或固定 Knowledge。

## 4. Phase 1：冻结决策、契约与显式 Run Kernel

### 4.1 独立价值

用户或测试可用明确的 Agent/Skill/Input 启动一个无 Tool 或 Rust Native Tool 的通用 Run；不依赖聊天路由。旧 `run-task` 保持现状，因此本阶段可独立发布。

### 4.2 文档与 ADR

修改：

- `docs/AI Employee OS 技术决策记录 ADR（Architecture Decision Records）v1.0.md`
- `docs/AI Employee OS Unified Data Model v1.0.md`
- `docs/AI Employee OS MVP API & Interface Specification v1.0.md`
- `docs/AI Employee OS Agent Runtime 深度设计 v1.0.md`
- `docs/AI Employee OS Skill Engineering Guide v1.0.md`
- `docs/AI Employee OS Tool Runtime Engineering Guide v1.0.md`
- `docs/AI Employee OS Security & Permission Architecture v1.0.md`
- `docs/AI Employee OS Observability & Evaluation Architecture v1.0.md`

动作：

1. 新增 ADR-032，supersede ADR-031，但说明 Golden Path 在迁移完成前仍是兼容路径。
2. 将 Spec 的表、状态所有权、CLI、Decision、Deliverable 和 Adapter 边界写入相应 canonical 文档。
3. 文档不得先声称聊天主路径已切换；使用“目标路径/迁移期”措辞。

验收：事实源优先级无冲突；Task/Action 枚举未变化；没有文档宣称 Python 执行 Tool 或保存 canonical RunState。

### 4.3 机器契约

新增：

- `contracts/agent-run-request.schema.json`
- `contracts/agent-run-state.schema.json`
- `contracts/agent-decision.schema.json`
- `contracts/skill-run-result.schema.json`
- `contracts/deliverable.schema.json`
- `contracts/artifact-ref.schema.json`
- `contracts/context-snapshot.schema.json`
- `contracts/toolset-snapshot.schema.json`
- 对应 `contracts/examples/*.valid.json`
- 对应 `contracts/fixtures/*.invalid-*.json`

修改：

- `contracts/skill-manifest.schema.json`：升级 `2.0.0`，加入 `instructions/routing/context/tools/execution/deliverables/evaluation`，允许 `agent_loop | workflow`。
- `contracts/runtime-event.schema.json`：加入 Run/Deliverable/Evaluation 事件。
- `scripts/check_contracts.py`：注册全部正反例和未知版本/字段拒绝测试。

兼容策略：保留 v1 Skill Manifest 的解析器仅供旧路径安装；新 `run-skill` 只运行 v2 Manifest。安装记录必须能区分 Schema 版本，禁止把 v1 静默解释为 v2。

关键反例：Decision 带 `call_id`；未知 Decision type；Tool 不在 Toolset；Deliverable 缺 Evidence；RunState 未知 phase；Skill `agent_loop` 带 workflow；Artifact 路径逃逸。

### 4.4 数据库

新增：

- `storage/migrations/011_generic_agent_runs.sql`
- 在 `runtime/rust-core/src/storage.rs` 注册 Migration 011 并更新测试计数。

Migration 创建：`agent_runs`、`run_snapshots`、`run_observations`、`run_checkpoints`、`artifacts`、`deliverables`、`deliverable_evidence`，以及 Task/Run、Run/Observation、Deliverable/Evidence 必需索引。

完整性约束：

- `agent_runs.task_id` 外键指向 `tasks`；phase 和计数带 CHECK。
- Snapshot 类型只允许 `agent | skill | toolset | context | model`，Hash 非空。
- Observation sequence 在 Run 内唯一递增。
- Deliverable 状态只允许 `candidate | verified | rejected`。
- Evidence 类型只允许 `artifact | tool_result | verification | evaluation | structured_output`。

测试：fresh migration、重复 migrate、从 Migration 010 升级、外键开启、CHECK/UNIQUE 拒绝、已有 Task 数据保持不变。

### 4.5 Rust Run Kernel

新增模块：

- `runtime/rust-core/src/run.rs`：RunPhase、RunState、合法转换和预算计数。
- `runtime/rust-core/src/run_service.rs`：Task/Run/Snapshot/Observation/Checkpoint 事务。
- `runtime/rust-core/src/run_kernel.rs`：固定生命周期协调器。
- `runtime/rust-core/src/decision.rs`：AgentDecision 反序列化与禁止字段校验。
- `runtime/rust-core/src/deliverable.rs`：候选、Evidence 验证和终态收敛。
- `runtime/rust-core/src/tool_surface.rs`：Skill 声明与 Tool Registry 的交集。

修改：

- `runtime/rust-core/src/lib.rs`：导出新模块。
- `runtime/rust-core/src/main.rs`：新增 `run-skill`、`run-status`，不改旧 `run-task/chat-send` 路由。
- `runtime/rust-core/src/skill_package.rs`：安装并锁定 v2 Package hash/Instructions hash。
- `runtime/rust-core/src/tool_executor.rs`：接收 Rust 生成的安全字段及 Run/Action 引用。
- `runtime/rust-core/src/task_service.rs`、`event.rs`、`evaluation.rs`：复用 canonical 状态并支持新事件/Evidence。

最小实现顺序：

1. 读取 Agent、Skill binding、v2 Manifest、Native Tool Manifest。
2. 原子创建 Task/Run/Snapshots 和 pre-model checkpoint。
3. 构造 `AgentRunRequest`，调用 Python Worker 获得 Decision。
4. 对 `ask_user` 持久化等待；对 `tool_call` 创建 Action、安全字段并调用 ToolExecutor；对 `complete` 执行 output/evidence 验证。
5. 按边界保存 Observation/Checkpoint/Event。
6. 只有 Deliverable/Evaluation gate 通过才成功收敛 Task。

### 4.6 Python Task Worker

新增：

- `runtime/python-agent/app/task_worker.py`：stdin/stdout NDJSON 入口。
- `runtime/python-agent/app/decision.py`：三类 Decision 的严格解析与生成。
- `runtime/python-agent/test_task_worker.py`
- `runtime/python-agent/test_decision.py`

修改：

- `runtime/python-agent/app/loop.py`：移除模型生成 `call_id/idempotency_key` 的协议；Loop 只产生业务 Decision。保留旧调用方所需兼容类时必须标记为 legacy 且不被新 Worker 使用。
- `runtime/python-agent/app/provider.py`：支持 Fake Provider 的确定性 Decision 序列。

Worker 不接收数据库路径、Keychain 引用或完整环境；只接收 Runtime 裁剪后的请求。Rust 必须使用现有受控 Python/Sandbox 启动机制，但入口改为 `app.task_worker`。

### 4.7 测试 Package

新增三个 v2 测试 Skill 中的前两个：

- `packages/skills/structured-summary/`：纯推理、无 Tool、结构化输出。
- `packages/skills/write-note/`：单次 `document-tool.create_markdown`，生成 Artifact。

每个包含 `manifest.yaml`、`SKILL.md`、`evals/cases.json`、`evals/suite.json`。不得复用 PRD 文案或固定 Alex。

### 4.8 Phase 1 验证

```bash
python3 scripts/check_contracts.py
cargo test --manifest-path runtime/rust-core/Cargo.toml
python3 -m unittest discover -s runtime/python-agent -p 'test_*.py'
./scripts/check.sh
```

手动/集成验收：

```bash
ai-employee-runtime run-skill --database <temp-db> --repository-root . \
  --agent-id <non-alex-agent> --skill-id structured-summary \
  --input-json '{"text":"..."}'
```

- 返回真实 `task_id/run_id` 和通过 Schema 的 structured result。
- `write-note` 仅在批准后调用 Tool，并登记 Hash 可读的 Artifact/verified Deliverable。
- 将模型 Decision 注入 `call_id` 时在 Tool 执行前拒绝。
- crash after ToolResult 后恢复时 ToolExecution 计数不增加。

### 4.9 Phase 1 回滚

回滚 CLI 入口和新模块；保留 Migration 011 和新表，不删除已有 Run/Audit/Artifact。旧 `run-task/chat-send` 未切换，可继续使用。

## 5. Phase 2：渐进 Context、Readiness 与 Resolver

### 5.1 独立价值

多个通用 Skill 可共存；Runtime 只加载命中 Skill 的完整说明，并按依赖返回真实 readiness。显式 `run-skill` 继续可用，即使聊天尚未接入。

### 5.2 实现文件

新增：

- `runtime/rust-core/src/capability_readiness.rs`
- `runtime/rust-core/src/skill_resolver.rs`
- `runtime/rust-core/src/context_pipeline.rs`
- `runtime/python-agent/app/skill_selector.py`
- 对应 Rust/Python 测试文件（遵循仓库现有内联 Rust test 风格时可放同模块）。

修改：

- `runtime/rust-core/src/main.rs`：新增 `capability-readiness`；`capabilities` 的 `tasks_enabled` 改为 readiness 派生值。
- `runtime/rust-core/src/run_kernel.rs`：接入 Resolver、Context Pipeline 和动态 Tool surface。
- `runtime/rust-core/src/skill_package.rs`：校验 `SKILL.md`、references/templates/evals 文件引用及 Hash。
- `runtime/rust-core/src/decision_context.rs`：兼容读取旧 DecisionContext；新路径由 ContextSnapshot 取代，不复用旧字段冒充新语义。
- `contracts/decision-context.schema.json`：标记 legacy 使用范围；不删除文件。

### 5.3 Resolver 规则

- 显式 `skill_id` 永远优先且不回退。
- 自动模式先过滤绑定/状态/版本/Tool/Context，再按 trigger/正反例评分。
- 单候选直接选择；2–3 个近似候选调用 `skill_selector`；0 个或无法唯一选择返回可见澄清。
- Python 只能从 Rust 给定候选 ID 中选择并提取 input；额外 ID 或字段默认拒绝。

### 5.4 Context 与 ResultRef

- 初始模型调用只放 Skill catalog metadata；选中后加载 `SKILL.md`。
- references/templates 依据 selector 和当前 Decision 按需加入。
- 大 ToolResult 超过 Manifest/Tool limit 时写入 Artifact/ResultRef；模型只见摘要、类型、Hash 和引用。
- 每次模型调用写 Context Snapshot：section 类型、trust level、source ref、Hash、字节数。
- required Context 缺失/超预算必须在副作用前失败。

### 5.5 第三个测试 Skill

新增 `packages/skills/inspect-and-summarize/`：允许两次可逆只读/写入 Tool 调用，第二次决策依赖第一次 Observation；覆盖 Tool 失败、ResultRef 和无进展停止。若现有 Tool 无法提供无业务语义的可逆读取 Action，应先为现有 `file-tool` 增加受控只读 Action，而不是在 Skill 中执行脚本。

### 5.6 Phase 2 验证

- 三个 Skill 同时安装，Runtime 源码无 Skill ID 分支。
- 未绑定/缺 Tool/版本不兼容分别返回准确 readiness reason。
- 未声明 Tool 不出现在 AgentRunRequest。
- 两个歧义候选请求澄清，不随机执行。
- ToolResult 注入“忽略系统规则”不会改变 Tool surface 或权限。
- 删除/停用 `prd-generation` 后三类通用 Skill 仍通过。
- 执行 Phase 1 全部自动门禁和 `./scripts/check.sh`。

### 5.7 Phase 2 回滚

关闭自动 Resolver，仅保留显式 `run-skill`；readiness 和 Context Snapshot 表/数据继续只读保留。

## 6. Phase 3：聊天与 macOS 产品接入

### 6.1 独立价值

用户在任意启用员工的对话中发出工作请求时，进入同一 Resolver/Run Kernel；闲聊继续走 chat worker。Task Inspector 只展示真实 RunState。

### 6.2 Rust 接入

修改：

- `runtime/rust-core/src/main.rs`：`chat-send` 的工作意图分支调用 Resolver/Run Kernel，删除该入口对 `complete_chat_as_task -> run_golden_path` 的调用。
- `runtime/rust-core/src/run_kernel.rs`：接受 `conversation_id/user_message_id` 并建立 Task/Run 关联。
- `runtime/rust-core/src/event.rs`：保证 Task 内 sequence 单调，聊天流与 Run 事件可续读。
- `runtime/rust-core/src/employee_prompt.rs`：确保 Effective Prompt snapshot 从当前员工配置单向编译并锁定。

行为：

- 普通闲聊不创建 Task。
- 工作意图无 ready Skill 时返回能力不足/依赖原因，不回退到 Golden Path。
- Resolver 歧义或 `ask_user` 将问题写回同一 Conversation，同时 Run=`waiting_user`。
- 同一 user message 重试必须复用/发现既有 Task，禁止重复创建。

### 6.3 Swift 接入

修改：

- `apps/macos/AIEmployee/Sources/AIEmployee/Services/RuntimeService.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Models/RuntimeCapabilities.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Models/Conversation.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Stores/CapabilityStore.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Stores/ConversationStore.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Support/TaskPresentation.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/EmployeeChat/EmployeeChatWorkspaceView.swift`
- `apps/macos/AIEmployee/Sources/AIEmployee/Views/AppShell/ContextSidebarView.swift`
- `apps/macos/AIEmployee/Tests/ClientModelChecks.swift`

动作：

- 解码 per-Skill readiness、Run phase、waiting reason、Deliverable verification。
- 继续用户输入时调用 `continue-run`，携带 `run_id` 和 revision/continuation key。
- Task Inspector 映射 Spec 定义的状态，不用本地进度覆盖 Runtime。
- candidate Deliverable 不展示为完成；`result_unknown` 提供“待核验”而非“重试”。
- UI 不提供创建 Skill/Tool Package 的入口。

### 6.4 Phase 3 验证

```bash
./scripts/check.sh
./script/build_and_run.sh
```

真实 App 手动矩阵：

1. 非 Alex 员工 + 纯推理 Skill：跨重启恢复 Conversation 和 Run 结果。
2. 非 Alex 员工 + 单 Tool Skill：审批、Artifact、Deliverable 与真实文件一致。
3. 多轮 Tool Skill：Task Inspector 顺序与 Runtime Event 一致。
4. 无匹配 Skill：明确能力不足，不创建 Tool Action。
5. 歧义 Skill：请求补充，不错误执行。
6. 运行时编辑员工 Prompt：旧 Run Hash 不变，新 Run Hash 改变。
7. 取消：未开始 Action 不执行，Task 收敛 `cancelled`。

### 6.5 Phase 3 回滚

通过单一内部路由开关将 `chat-send` 恢复到旧路径；显式 `run-skill` 和新数据继续可用。该开关只允许代码级兼容期使用，不新增用户配置或长期双轨产品语义。

## 7. Phase 4：Workflow、完整恢复与 Evaluation

### 7.1 独立价值

在已可用的 Agent Loop 上补齐确定顺序流程、用户/审批继续、崩溃恢复、人工核验与完整质量/成本门禁；聊天主路径在本阶段缺失时仍可运行短任务。

### 7.2 Workflow

修改：

- `runtime/rust-core/src/graph_runtime.rs`：从旧 Golden Path 解耦，成为 Run Kernel 的 `workflow` 执行器；只编排业务 Step。
- `runtime/rust-core/src/run_kernel.rs`：按 `execution.mode` 调用 agent loop 或 workflow。
- `runtime/rust-core/src/action.rs`、`task_service.rs`：保证每 Step 复用 canonical Action 状态。
- `runtime/rust-core/src/skill_package.rs`：workflow 文件 Schema、引用和 DAG 校验。

迁移 `requirement-analysis` 或新建一个不含 PRD 语义的 workflow 测试 Skill；不得用固定 PRD Golden Path 作为唯一验收。

### 7.3 Continuation 与恢复

新增/修改：

- `runtime/rust-core/src/recovery.rs`：按 Spec 恢复矩阵扫描和收敛 Run。
- `runtime/rust-core/src/approval.rs`：审批结果追加后继续原 Run。
- `runtime/rust-core/src/main.rs`：完成 `continue-run` 与人工核验命令 `resolve-action-result --action-id --status succeeded|failed --evidence-json`。
- `runtime/rust-core/src/run_service.rs`：revision compare-and-swap、continuation key 幂等。

测试注入每个 checkpoint 的进程中断，逐一证明恢复后 Task/Action/ToolExecution/Deliverable 数量符合预期。

### 7.4 Evaluation

修改：

- `runtime/rust-core/src/evaluation.rs`
- `runtime/rust-core/src/observability.rs`
- `runtime/python-agent/app/eval_runner.py`
- `contracts/eval-report.schema.json`

增加 result/trajectory/side_effect/recovery/cost/risk 六类报告。Rust 先执行确定性规则；只有内容质量 Rubric 才调用 Judge。记录模型轮次、Token、Tool 数、总时延和各阶段时延，不记录 Secret/私有 reasoning。

### 7.5 Phase 4 验证

- `waiting_user` 跨进程重启后可继续，重复 continuation 不重复推进。
- `waiting_approval` 对应 Action `blocked`，批准后只执行一次。
- 每个副作用边界 crash 后恢复不重复 Tool。
- `result_unknown` 在人工核验前始终停止；核验追加 Audit 后正确继续/失败。
- Workflow 下游只在依赖 Action succeeded 后启动。
- 确定性失败不能被 LLM Judge 覆盖。
- 成本超限准确停止并返回已用预算。
- 执行全部 `./scripts/check.sh` 和 App 手动矩阵。

### 7.6 Phase 4 回滚

停止创建新的 workflow Run，只允许恢复已有 Run；保留 agent_loop。不得删除等待中的审批、`result_unknown` 或 Audit 数据。

## 8. Phase 5：Golden Path 退出与单一语义收敛

### 8.1 进入条件

只有以下证据齐备才开始：

- Phase 1–4 自动门禁全部通过。
- 真实 App 三类 Skill、等待、审批、取消、恢复、Deliverable 验收通过。
- `chat-send` 不再调用 Golden Path，且至少一个非 Alex 员工通过工作执行。
- 仓库代码搜索确认业务主路径不依赖 `prd-generation`。

### 8.2 删除与修改

删除：

- `runtime/rust-core/src/golden_path.rs`
- `runtime/rust-core/src/lib.rs` 中 `golden_path` 导出。
- `runtime/rust-core/src/main.rs` 中 `run_golden_path`、`complete_chat_as_task` 的旧实现和 `app.worker` 启动引用。

视实际调用关系处理：

- `runtime/rust-core/src/graph_runtime.rs` 若已被 Phase 4 workflow 复用则保留并改名语义；若只剩旧路径引用则删除。
- `run-task` 若仍有旧 Client/脚本调用，则保留为 `run-skill` 的显式兼容转发并输出 deprecation 字段；否则删除。
- `packages/skills/prd-generation` 作为普通 v2 Skill 可保留，但不得享有 Runtime 特判。

更新：

- `docs/架构总览.md`
- `AGENTS.md`
- Runtime/Skill/API/ADR 文档中的迁移期措辞
- `scripts/check.sh` 和 `scripts/check_employee_runtime.py`，移除固定 Golden Path/PRD 断言，改为三类通用 Skill 门禁。

禁止删除历史 Task/Action/Audit/Artifact。旧记录按原字段只读展示，明确标记 `legacy_execution`，不得伪造 Run Snapshot 或 verified Deliverable。

### 8.3 Phase 5 验证

```bash
rg -n "app\.worker|run_golden_path|golden_path|ai-product-manager|prd-generation" \
  runtime apps scripts
./scripts/check.sh
./script/build_and_run.sh
```

搜索命中必须逐项解释：合法命中只允许兼容迁移说明、普通 Package 数据或测试断言；Runtime 主链不得有业务 ID 分支。

最终验收：

- 三类通用 Skill + 非 Alex 员工均通过。
- PRD Skill 停用后主 Runtime 门禁仍通过。
- 新安装 v2 Skill 仅增加 Package 文件，无 Rust/Python 修改。
- Task Inspector 与 SQLite/Events 对账一致。
- fresh install、Migration 010 升级、重复启动均通过。

### 8.4 Phase 5 回滚

回滚入口删除提交可恢复代码，但不得把新 Run 导向旧 Golden Path。若新主路径发生发布阻断，产品应禁用工作执行并保留聊天/历史读取，而不是用无法解释新 Run Snapshot 的旧路径继续执行。

## 9. 测试矩阵

| 路径 | 输入 | 期望 | 关键证据 |
|---|---|---|---|
| 纯推理 | 合法结构化输入 | succeeded | output schema + Evaluation |
| 单 Tool | 需写一个授权文件 | approval -> succeeded | ToolExecution + Artifact hash + Deliverable |
| 多轮 Tool | 第二步依赖首个结果 | observe 后再决策 | Observation sequence + 调用次数 |
| 缺 Tool | Skill 声明不存在 Tool | 副作用前 failed | readiness reason，无 Action |
| 越权 Tool | Decision 请求未声明 Action | failed | `tool_action_not_allowed` |
| Prompt Injection | ToolResult 含越权指令 | 不改变动作空间 | Context trace + 无越权 Action |
| Worker 超时 | Python 不响应 | 有限重试后 failed | attempt/预算/Event |
| 等待用户 | 缺必填输入 | waiting_user，可继续 | checkpoint + continuation key |
| 等待审批 | 高风险 Action | Action blocked | Approval/Audit |
| 不确定副作用 | Tool 超时且无法确认 | result_unknown | 不重复 ToolExecution |
| 崩溃恢复 | 在六个边界逐一中断 | 幂等恢复 | 行数/Hash/调用次数 |
| 并发继续 | 同 revision 两次 continuation | 仅一次成功 | revision CAS |
| 配置漂移 | Run 中修改 Agent/Skill | 当前 Run 不变 | snapshot hash |
| 未知版本 | 任一协议版本未知 | 默认拒绝 | schema error，无副作用 |
| 取消 | Tool 前/执行中取消 | canonical 收敛 | Task/Action/Event 对账 |

## 10. 提交与审查切分

建议每阶段按以下单一目的提交，避免一个提交同时改协议、行为和 UI：

1. `docs: approve generic agent runtime architecture`
2. `contracts: add generic agent run protocols`
3. `storage: add generic agent run persistence`
4. `runtime: add explicit bounded run kernel`
5. `worker: add structured task decisions`
6. `runtime: add readiness resolver and context pipeline`
7. `client: connect chat and run state`
8. `runtime: add workflow recovery and evaluation`
9. `runtime: retire golden path`

每次只执行 `git add <本提交明确路径>`；提交前运行该切片相关测试和 `git diff --cached --check`。未经用户明确授权不 push、不发布 Release。

## 11. 完成定义

计划完成不是“代码存在”，而是：

- Spec 的所有机器字段均有 Schema 和正反例。
- 五阶段全部通过各自门禁，且每阶段可从其前一版本安全升级。
- Runtime 主链无 Alex/PRD/固定 Knowledge 特判。
- Rust 持有全部安全字段、状态、副作用和恢复语义。
- Python 仅产生严格 Decision；Swift 仅展示/发起/继续。
- 三类通用 Skill 和非 Alex 员工在真实 App 中通过。
- 旧 Golden Path 不再是产品入口，历史记录仍可只读审计。
- `./scripts/check.sh` 通过；App 打包启动与手动矩阵有真实证据。

## 12. 风险与停止条件

- 若发现 Skill 必须执行任意 Package 代码：停止本计划，另立 Plugin Runtime Spec。
- 若 canonical Task/Action 枚举必须变化：停止实现，先修订 ADR、Unified Data Model 和全部契约。
- 若当前未提交改动与目标文件语义冲突且无法无损合并：停止该文件修改，请用户裁决所有权。
- 若 Tool 副作用无法提供幂等键或结果核验：该 Tool 不得进入通用 Runtime。
- 若聊天切换验收失败：保留显式 `run-skill`，不进入 Phase 5。

本计划不依赖新的外部账号、MCP Server 或第三方 CLI。唯一运行期外部依赖仍是现有模型 Provider；Fake Provider 必须覆盖全部确定性自动门禁，真实 Provider 只用于语义质量和 App 手动验收。
