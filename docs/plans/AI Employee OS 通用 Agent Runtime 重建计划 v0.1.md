# AI Employee OS 通用 Agent Runtime 重建计划 v0.1

> 文档类型：Spec 前置架构计划 / 新会话交接文档
> 状态：待用户确认后进入 Spec 编写，不是已冻结实现规范
> 日期：2026-08-06
> 适用仓库：`/Users/kakarrot/Dev/AI Employee OS`

## 1. 使用方式

本文件用于在新的 Codex 会话中继续工作。新会话不得直接按本文修改 Runtime；必须依次完成：

1. 复核当前工作区、`AGENTS.md`、canonical 文档和机器契约是否发生漂移。
2. 根据本文生成并评审通用 Agent Runtime Spec。
3. Spec 获得用户确认后，根据冻结 Spec 生成可执行 Implementation Plan。
4. Implementation Plan 获得用户确认后，分阶段实施、验证和交付。

推荐给新会话的起始指令：

> 阅读 `docs/plans/AI Employee OS 通用 Agent Runtime 重建计划 v0.1.md`、根目录 `AGENTS.md` 及其中列出的 canonical 文档。先检查当前代码和工作区是否漂移，然后基于该计划生成通用 Agent Runtime Spec；不要直接编码，不要恢复旧 Golden Path，不要硬编码 示例员工、PRD 或任何单一场景。

## 2. 已确认目标

构建一套与具体业务场景无关的通用运行契约：

```text
Agent → Skill → Tool → Deliverable
```

目标不是修复或恢复历史 Golden Path，而是从 0 到 1 建立通用 Agent Runtime：

- 任意符合 Package 契约、已安装并绑定给员工的 Skill，可以走同一条 Runtime 主链。
- Skill 可以声明并使用已安装 Tool；Runtime 不认识 PRD、研究、写作等具体业务。
- 新增 Skill 不修改 Rust/Python Runtime 源码。
- 新增已支持协议的 Tool 不修改 Python Agent Worker。
- 新的本地原生 Tool 仍必须提供受信任的 Rust Tool Adapter；Manifest 不能凭空产生执行能力。
- Task、Action、Permission、Approval、Audit、Trace 和副作用恢复继续由 Rust Runtime 负责。
- Python Agent Worker 只负责模型推理和提出结构化决策，不直接取得系统权限。
- Deliverable 必须由真实 Artifact、ToolResult 或验证证据支持，不能仅由模型文字声明完成。

## 3. 明确不做

- 不恢复已删除的 `app.worker`。
- 不继续使用或迁移旧 `run_golden_path` 作为产品主路径。
- 不硬编码 `example-employee`、`prd-generation`、固定 Knowledge、固定搜索词或固定输出模板。
- 不为每个 Skill 强制设计 DAG。
- 不允许 Skill Package 中的任意脚本绕过 Rust ToolExecutor 执行。
- 不引入第二套 Task/Action 状态事实源。
- 不在当前 MVP 引入 Multi-Agent、Subagent、Computer Use、Cloud Sync 或 Marketplace。
- 不把 Deep Agents 或 LangGraph 整体嵌入为新的持久化 Runtime。
- 不用 Demo、单次成功或固定 PRD 用例证明 Runtime 已通用。

## 4. 当前问题与必须废止的前提

### 4.1 当前真实故障

`chat-send` 识别到工作意图后进入旧 Golden Path；旧路径固定启动 `python -m app.worker`，但该模块已经删除，最终被包装成：

```text
Python worker response timeout or disconnect:
channel is empty and sending half is closed
```

缺少文件只是最先暴露的表象。恢复旧 Worker 会保留以下结构性错误：

- 工作执行丢弃已经编译的员工 Effective Prompt。
- Golden Path 硬编码 示例员工 和 `prd-generation`。
- Skill Manifest 的 routing、input/output schema、required context、required tools 没有成为真实执行控制面。
- Rust 用占位数据直接把 `analyze` 标记为完成。
- 固定演示 Knowledge 绕过 Skill 的 `on_missing: fail`。
- Python 中已有 Planner Loop 只被测试使用，没有接入产品主路径。
- `tasks_enabled` 只检查“存在任意 Skill + 任意 Tool”，不证明当前员工的目标能力可执行。

### 4.2 Canonical 冲突

现行 ADR-031、架构总览、Runtime/Skill/API 文档仍将“自研 Graph + Golden Path”定义为 MVP 主路径。新的通用 Runtime 决策与其冲突。

新 Spec 开始前必须新增 ADR，明确：

- supersede ADR-031；
- Golden Path 退出产品主路径；
- Rust 仍是 Task/Action 和系统权限事实源；
- 通用 Bounded Agent Loop 成为默认执行模式；
- Skill Workflow 仅作为可选确定性控制模式；
- Deep Agents/LangGraph 只作为参考机制，不成为第二套状态源。

在 ADR 和 canonical 文档未更新前，不得直接实现相冲突的 Runtime。

## 5. 研究来源与采用结论

### 5.1 参考来源

- `kakarrot-dev/pm-ai-agent-book`：产品完成证据、真实状态、Context 生命周期、Memory、Tool 副作用、Graph 恢复、Harness 与 Eval。
- `bojieli/ai-agent-book`：`LLM + Context + Tools`、观察空间与动作空间、Agent Loop、主动 Tool 发现与选择、Harness、异步执行和评估。
- `langchain-ai/deepagents`：Harness/Runtime 分层、Middleware、Skill 渐进加载、动态 Tool surface、Backend、Checkpoint、Interrupt、Context 压缩和 Threat Model。

研究快照：

- `pm-ai-agent-book@9354cd236df5d937afb366f486ee14b0e681d51f`
- `ai-agent-book@bc8bfda472ea23bb03c5c2763afafe5e335974b6`
- `deepagents@0bd15dc0e1c52fafdd404f91b7a172312b8f0fec`

### 5.2 直接采用

- Harness 与 Runtime 分层。
- 固定的通用 Agent Loop。
- Skill Metadata 先加载、完整说明按需加载的渐进式 Context。
- 根据当前 Run 动态收窄模型可见 Tool surface。
- Checkpoint、Interrupt、恢复和完整 Trace。
- 大 ToolResult 外置为 Artifact/ResultRef，再将摘要放入模型 Context。
- 结果、轨迹、副作用、成本和风险分层 Eval。

### 5.3 改造后采用

- Deep Agents Middleware 改造为固定、受信任、顺序明确的 Run Stages，不开放第三方任意中间件代码。
- Deep Agents Skill 改造为 `Manifest + SKILL.md + references/templates/evals + 可选 workflow` 的强契约 Package。
- LangGraph Checkpoint 改造为 SQLite 中以副作用边界为中心的 Run Checkpoint。
- 主动 Tool 发现改造为：Skill 依赖先收窄动作空间，再在当前可用 Action 中选择。
- Agent 自主规划限制在 Runtime 锁定的预算、Skill、Context 和 Toolset 内。

### 5.4 明确拒绝

- `trust the LLM` 安全模型。
- Python Worker 直接执行本地 Shell 或继承全部环境变量。
- Skill、Memory、Knowledge 或远端结果未经分级直接成为高优先级指令。
- LLM 自行生成 `call_id`、`action_id`、幂等键、权限、审批、deadline 或 trace 等安全字段。
- Skill Script 绕过 ToolExecutor。
- 为复用 Deep Agents 而引入第二套持久化状态。

## 6. 推荐架构

```text
User / Conversation
        |
        v
Rust Run Kernel
  Agent Snapshot
  Skill Resolution
  Dependency Preflight
  Context Assembly
  Tool Surface
        |
        v
Python Task Worker
  Model Decision
  ask_user | tool_call | complete
        |
        v
Rust Decision Validator
  Action / Permission / Approval
        |
        v
Rust ToolExecutor
        |
        v
ToolResult + Artifact Evidence
        |
        v
Python Observation / Next Decision
        |
        v
Rust Output Validation
  Deliverable → Evaluation → Task Completion
```

### 6.1 Agent

Agent 定义“谁在工作”：

- Identity、Soul、Persona；
- Rust 编译的 Effective Prompt；
- 当前绑定且启用的 Skill；
- 模型配置；
- Memory owner；
- 配置版本。

每次 Run 必须锁定：

- `agent_id`；
- `config_version`；
- `effective_prompt_sha256`；
- Skill bindings 版本或等价快照。

Agent 不直接执行 Tool，不修改 Task 状态，不持有系统权限。

### 6.2 Skill Package

推荐结构：

```text
skill-package/
├── manifest.yaml
├── SKILL.md
├── references/
├── templates/
├── evals/
└── workflows/        # 可选
```

职责分层：

- Manifest：Runtime 读取，声明 routing、schema、context、tools、budget、execution、deliverables、evaluation。
- `SKILL.md`：模型按需读取，描述工作方法、判断规则、失败条件和质量标准。
- References/Templates：只在命中 Skill 后按需加载。
- Evals：版本化能力用例，不参与线上权限判断。
- Workflow：仅确定性流程需要。

Skill 不直接取得系统权限。Skill 声明 Tool 依赖，不授予权限。

### 6.3 Tool

Tool 为全局安装能力，不建立 per-agent Tool 绑定表。Runtime 根据选中 Skill 和当前 Step 构造最小 Tool surface。

Tool Action 必须声明：

- input/output schema；
- required permission；
- risk level；
- side effect；
- approval；
- timeout；
- idempotency；
- retry；
- verification；
- artifact/result limits。

Tool 接入分三类：

1. Rust Native Adapter：本地高信任能力，需要受信任实现。
2. MCP Adapter：通过统一 MCP Tool Gateway 接入。
3. HTTP/OpenAPI Adapter：通过统一网络 Tool Gateway 接入，需域名、认证、超时和响应 Schema 策略。

不在本轮默认支持任意 CLI Adapter；若后续需要，必须单独定义 Sandbox 和 Secret 边界。

### 6.4 Deliverable

Deliverable 是 Runtime 持久化的交付记录，不是 Assistant 的一句“已完成”。至少包含：

- `deliverable_id`、`task_id`、`run_id`；
- Agent/Skill 快照引用；
- 类型、标题、摘要；
- Artifact/ResultRef；
- ToolCall、Verification 和 Evaluation 证据；
- 完成声明与验证状态。

没有可验证证据时可以返回普通消息，但不得产生 verified Deliverable，不得仅凭模型 `complete` 将 Task 标记为 succeeded。

## 7. 两种 Skill 执行模式

### 7.1 默认：`agent_loop`

适用于开放任务：

```text
MODEL_DECISION
  ├── ask_user
  ├── request_tool → OBSERVE → MODEL_DECISION
  └── complete
```

Manifest 只需声明预算和停止规则，不要求预先写完整步骤：

```yaml
execution:
  mode: agent_loop
  max_model_turns: 8
  max_tool_calls: 4
  max_duration_ms: 120000
  on_result_unknown: stop
```

### 7.2 可选：`workflow`

适用于法定顺序、高风险审批、确定性 ETL 或每一步需要独立恢复的流程：

```yaml
execution:
  mode: workflow
  workflow: workflows/example.yaml
```

Workflow 只控制业务 Step 和 Edge；Task/Action 状态、安全、权限、审批、恢复和审计仍由 Rust Run Kernel 统一负责。

## 8. Runtime 固定生命周期

建议的通用生命周期：

```text
CREATED
→ PREFLIGHT
→ CONTEXT_BUILD
→ MODEL_DECISION
→ AUTHORIZE（仅 ToolCall）
→ TOOL_EXECUTION
→ OBSERVE
→ MODEL_DECISION（循环）
→ VALIDATE_OUTPUT
→ BUILD_DELIVERABLE
→ EVALUATE
→ SUCCEEDED / FAILED
```

可中断状态：

- `waiting_user`：Task 保持 `running` 或由独立 Run phase 表达；不得新增 Task `blocked` 状态。
- `waiting_approval`：由 Action `blocked` 表达。
- `result_unknown`：由 Action `result_unknown` 表达，禁止自动重放。
- `cancelled`：Task/开放 Action 收敛到既有取消状态。

Spec 必须在不改变 canonical Task/Action 枚举的前提下定义 Run phase、等待原因和恢复入口。

## 9. 建议新增或修订的机器契约

Spec 阶段必须逐项定义字段、枚举、未知版本行为和正反例：

1. `agent-run-request.schema.json`
2. `agent-run-state.schema.json`
3. `agent-decision.schema.json`
4. `skill-run-result.schema.json`
5. `deliverable.schema.json`
6. `artifact-ref.schema.json`
7. `context-snapshot.schema.json`
8. `toolset-snapshot.schema.json`
9. 修订 `skill-manifest.schema.json`
10. 必要时修订 `runtime-event.schema.json`

以下既有契约原则上复用，不创建同义替代物：

- `tool-call.schema.json`
- `tool-result.schema.json`
- `decision-context.schema.json`（需判断是兼容演进还是由新的 Context Snapshot supersede）
- Task/Action canonical 状态枚举

### 9.1 `AgentDecision`

Python 只能提出：

- `ask_user`
- `tool_call`
- `complete`

Python 可以提供 Tool ID、Action 和业务参数，但以下字段只能由 Rust 生成：

- `call_id`
- `action_id`
- `idempotency_key`
- `permission_context`
- `approval_id`
- `deadline`
- `trace_id`
- `attempt`

### 9.2 `RunState`

最小信息应覆盖：

- Task/Run 身份；
- Agent/Skill/Prompt/Toolset 快照；
- 当前 phase；
- 已确认 observation；
- model/tool 计数和预算；
- waiting/stop reason；
- checkpoint/version；
- Deliverable 和 Evaluation 引用。

Message History、RunState、Memory、Knowledge 必须保持语义分离。

## 10. Skill Resolver 与渐进加载

Skill 选择分三层：

1. 确定性过滤：绑定、状态、版本、依赖、基本输入兼容。
2. 候选召回：显式指定、trigger、positive/negative examples、语义匹配。
3. 模型判别：只在小候选集内输出结构化选择和 input extraction。

规则：

- 未绑定 Skill 不可选择。
- 缺 required Tool/Context 的 Skill 不进入 runnable 候选。
- 无匹配时请求澄清或明确说明能力不足，不运行默认 Skill。
- 多个高分候选无法确定时请求澄清。
- 初始模型 Context 只包含 Skill Catalog metadata。
- 选中后才加载完整 `SKILL.md`。
- References/Templates 按需加载。
- 模型每轮只看到当前 Skill/Step 允许的 Tool Actions。

`tasks_enabled: bool` 应被更具体的 capability readiness 替代，例如每个 Skill 的 `ready | missing_dependency | disabled | incompatible`。

## 11. Context 与信任边界

每次模型决策的 Context 必须可追溯到实际输入：

- Runtime Policy：trusted，Rust 提供。
- Agent Effective Prompt：trusted，Rust 编译并锁定。
- Skill Instructions：trusted package data，但需安装时校验和锁定 Hash。
- Tool Descriptions：trusted，来自已安装 Tool 快照。
- User Input：untrusted_data。
- Memory：默认 untrusted_data。
- Knowledge/Retrieval：untrusted_data，保留 source URI 和 Hash。
- ToolResult：事实性 observation，但其文本内容仍可能包含 Prompt Injection，不升级为系统指令。

禁止：

- 固定 Demo Knowledge 自动注入真实 Run。
- Secret 进入 Context、Trace、Memory 或 Artifact。
- 将摘要当作 canonical RunState。
- 把完整大 ToolResult 无限制塞进模型窗口。

Context Pipeline 至少支持：write、select、compress、isolate、trace。模型每一步实际看到的 Context 必须可检查，但不得持久化或展示模型私有 reasoning。

## 12. Checkpoint 与恢复

Checkpoint 应位于副作用边界：

1. 模型调用前。
2. AgentDecision 校验后。
3. Tool 执行前，Action 已持久化。
4. ToolResult 已持久化。
5. Observation 已进入 RunState。
6. Deliverable 已验证。

恢复规则：

- 模型调用可以重新尝试，但必须增加 attempt 并受预算限制。
- Action 已创建但 ToolExecution 不存在：按授权和 deadline 决定是否可执行。
- ToolResult 已成功持久化：只重放 observation，不再次执行 Tool。
- Tool 执行结果不确定：Action 进入 `result_unknown`，等待人工核验。
- Deliverable 已验证：只完成剩余状态收敛，不重复生成交付物。

## 13. Eval 与验证模型

通用 Eval 必须同时覆盖：

1. 结果：Skill output schema、Deliverable 和用户目标。
2. 轨迹：Tool 选择、顺序、禁止动作、循环是否有进展。
3. 副作用：幂等、审批、重复执行、`result_unknown`。
4. 恢复：进程中断、等待用户、等待审批、取消。
5. 成本：模型轮次、Token、Tool 调用、时延。
6. 风险：越权、Secret、Prompt Injection、未知 Schema/枚举。

能用代码判断的事实不得交给 LLM Judge。内容质量才使用 Rubric、人工或 LLM Judge。

至少准备三种与具体业务无关的测试 Skill：

- 纯推理 Skill：无 Tool，输出结构化结果。
- 单 Tool Skill：一次可逆 Tool 调用，产生 Artifact/Deliverable。
- 多轮 Tool Skill：观察 ToolResult 后决定下一步，覆盖失败与恢复。

共同验收：

- 更换 Skill ID 不改 Runtime。
- 非 示例员工 员工可运行同一 Skill。
- 新 Run 使用最新员工 Prompt Hash；运行中的 Run 保持旧快照。
- 未声明 Tool 不进入模型动作空间。
- 缺依赖在副作用前失败。
- `result_unknown` 不自动重放。
- 无真实证据不产生 verified Deliverable。
- 删除 PRD Skill 后其余 Skill 仍可运行。

## 14. Spec 编写任务

新会话应先生成一份独立 Spec，建议文件：

```text
docs/AI Employee OS Generic Agent Runtime Specification v1.0.md
```

Spec 必须决策完整地覆盖：

1. 术语与责任边界。
2. Rust/Python/Swift 进程边界。
3. Runtime 固定生命周期。
4. `agent_loop` 与可选 `workflow`。
5. Skill Package 和 Manifest 完整字段。
6. Skill Resolver 和 input extraction。
7. Prompt/Context 组装顺序与信任等级。
8. AgentDecision 协议。
9. ToolCall 安全字段的 Rust 所有权。
10. Tool Adapter 模型。
11. RunState、Checkpoint 和恢复。
12. Deliverable/Artifact/Evidence。
13. Evaluation 和 Release Gate。
14. 错误码、超时、预算、取消和等待。
15. CLI/子进程接口。
16. 数据迁移和旧 Golden Path 退出策略。
17. 正常、异常、攻击和恢复序列。
18. 机器契约清单及正反例。
19. 可观察性和用户可见状态映射。
20. 明确非目标和后续能力。

Spec 编写时必须同步提出 canonical 变更清单，但在用户确认前不要批量修改旧文档。

## 15. Implementation Plan 编写任务

Spec 获批后生成独立 Implementation Plan，建议文件：

```text
docs/plans/AI Employee OS Generic Agent Runtime Implementation Plan v1.0.md
```

Plan 必须：

- 以当前代码和获批 Spec 为事实源，不照抄本文的推测性文件清单。
- 明确每阶段具体文件、Schema、Migration、命令、测试和验收证据。
- 每阶段独立可合并；后一阶段未完成时前一阶段仍可使用。
- 避免超过五个文件的隐性 Bug Fix；架构改造应明确作为独立阶段。
- 保护现有未提交工作，禁止 `git add .`。
- 先提供显式 `run-skill`，再接聊天自动路由。
- 最后退出旧 Golden Path，不能先删再等待新路径补齐。

推荐阶段：

### Phase 1：契约与显式 Run Kernel

- ADR supersede ADR-031。
- 更新 canonical Data Model、contracts 和 API Spec。
- 实现 `run-skill --agent-id --skill-id --input-json`。
- 实现 Agent/Skill/Tool 快照、Preflight、`agent_loop`、Deliverable。
- 使用确定性 Fake Provider 完成通用端到端测试。

独立价值：不依赖聊天路由即可运行任意显式 Skill。

### Phase 2：渐进 Skill 与动态 Tool Surface

- Skill Catalog、完整说明按需加载。
- Resolver、input extraction、readiness。
- Context Pipeline 和大结果外置。
- 三类通用测试 Skill。

独立价值：多个 Skill 可共存并由通用机制选择和执行。

### Phase 3：聊天接入

- `chat-send` 工作意图进入通用 Resolver/Run Kernel。
- Effective Prompt 贯穿 Task Run。
- Conversation/Task/Run 关联。
- UI 只展示真实 RunState。

独立价值：产品主聊天路径获得通用工作执行能力。

### Phase 4：Workflow、恢复与完整 Eval

- 可选 Workflow。
- waiting_user、approval continuation、checkpoint recovery。
- `result_unknown` 人工核验。
- 轨迹/副作用/成本 Eval。

独立价值：高风险和长任务具备确定性控制与恢复能力。

### Phase 5：旧路径退出与迁移收敛

- 确认通用路径通过端到端门禁。
- 移除旧 Golden Path 产品入口和硬编码。
- 处理旧运行记录的只读兼容或明确不迁移策略。
- 更新总览、专题文档和历史说明。

独立价值：单一主路径、无第二套运行语义。

## 16. 验证门禁

每阶段至少需要：

- JSON Schema 正反例。
- Rust 单元和集成测试。
- Python Worker 协议测试。
- Fake Provider 确定性端到端。
- fresh database 和重复 migration。
- 崩溃恢复与副作用不重复测试。
- 未知版本、枚举、Tool、权限默认拒绝测试。
- Secret 边界检查。
- `./scripts/check.sh`。

涉及 macOS 产品路径的阶段还必须：

- `./script/build_and_run.sh`；
- 真实 App 中运行纯推理、单 Tool、多轮 Tool 三类 Skill；
- 检查 Task Inspector 的步骤、等待、失败、取消、Deliverable 与真实状态一致；
- 不以 Swift 构建通过代替 Native Runtime 验证。

## 17. 关键风险

### 风险一：把“通用 Skill”误解为“任意代码执行”

对策：Skill 只提供声明和模型工作方法；可执行动作必须通过已注册 Tool Adapter。

### 风险二：通用 Agent Loop 成为不可恢复黑盒

对策：每轮 Decision、Action、ToolResult、Observation 和 Deliverable 都持久化并有预算上限。

### 风险三：Skill 和 Tool 数量增长污染 Context

对策：渐进式 Skill 加载、候选召回、动态 Tool surface、ResultRef 外置。

### 风险四：引入第二套状态

对策：Rust SQLite 继续是 Task/Action/Permission/Audit/RunState 事实源；Python 进程只接收快照并返回 Decision。

### 风险五：删除旧路径导致产品暂时完全不可用

对策：先完成显式 `run-skill` 和聊天接入验收，最后单独移除旧路径。

### 风险六：现有工作区存在未提交且重叠修改

对策：新会话开始先运行 `git status --short --branch -uall`；逐文件判断所有权，不覆盖用户修改，不做全量暂存。

## 18. 最脆弱的前提

本计划假设：

> Skill 是声明式工作方法和运行约束，Tool 才是可执行能力。

如果要求 Skill 自带任意可执行代码，则需要新增 Skill Sandbox、依赖供应链、签名、资源限制、Secret 隔离和进程权限模型；这会形成另一套 Plugin Runtime，不能混入当前计划。

## 19. Spec 前必须回答的决策问题

这些问题应由 Spec 给出推荐并请求用户一次性确认，不能留到编码阶段：

1. `agent_loop` 是否作为所有新 Skill 的默认模式。
2. 首版 Tool Adapter 是否只支持 Rust Native，还是同时纳入 MCP/HTTP。
3. Skill Resolver 首版是否允许模型语义判别，还是先显式 `skill_id` + 规则触发。
4. `waiting_user` 是否增加独立 Run phase，且保持 Task `running`。
5. Deliverable 是否作为新 canonical 表，还是复用并扩展现有 Artifact 相关模型。
6. 旧 Golden Path 历史 Task 是否只读保留，不做结构迁移。
7. `decision-context.schema.json` 是兼容演进，还是由更通用的 Context Snapshot 替代。
8. Skill 安装时是否强制存在 `SKILL.md`，以及旧 Package 的兼容策略。

## 20. 完成定义

只有同时满足以下条件，才能声称通用 Agent Runtime 已完成：

- Agent 的 Effective Prompt 真正进入工作执行。
- Runtime 不包含 示例员工、PRD 或单一场景硬编码。
- 新 Skill 仅通过 Package 安装与员工绑定即可运行。
- Skill 声明的 Tool 依赖、输入、输出、预算和失败规则被 Runtime 实际执行。
- Tool 只能经 Rust ToolExecutor 执行。
- 每个副作用可审计、可恢复且不会因崩溃自动重复。
- Deliverable 有真实 Artifact/ToolResult/Verification 证据。
- 三类通用 Skill 及非 示例员工 员工通过端到端验证。
- 旧 Golden Path 已退出产品主路径。
- canonical 文档、机器契约、实现、测试和客户端状态表达一致。
