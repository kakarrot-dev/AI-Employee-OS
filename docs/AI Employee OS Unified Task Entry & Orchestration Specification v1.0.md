# AI Employee OS Unified Task Entry & Orchestration Specification v1.0

> 状态：Confirmed / Task Room implemented（2026-08-12）
> 上位决策：ADR-036、ADR-037
> 目标：让用户从一个输入框交付目标，由系统提出可审计的单员工或多员工执行方案；所有授权、物化、执行与恢复仍由 Rust Runtime 控制。

## 1. 产品目标

用户不需要先选择员工、进入员工私聊或配置 Scenario/DAG。默认主路径是：

```text
办公室统一输入框
  -> Runtime 保存用户目标
  -> 模型生成结构化 Task Proposal
  -> Rust 验证员工、Capability、输入、依赖、权限、预算与验收
  -> 缺少必要输入时在同一 Task Thread 追问
  -> 用户一次确认高影响执行方案
  -> Rust 物化单员工 Task 或多员工 Root/Child Task + WorkOrder
  -> Task Thread 进入任务协作群，持续展示各员工回复、审批、进度、交接、异常与交付物
```

成功标准：用户提交一条自然语言目标后，无需理解 Skill、Tool、Scenario、WorkOrder、Handoff、Token 字段或节点 ID，即可启动并持续跟进工作。

## 2. 非目标

- 不让顶层协调模型直接创建 Task、调用 Tool、读取员工私人 Conversation/Memory 或扩大权限。
- 不删除现有 Scenario/Business Flow 契约、Migration、历史数据和恢复能力。
- 不实现自由 Agent-to-Agent 对话、员工抢任务、递归委派或无限并行；Task Room 的群聊样式只是 canonical 执行事实的交互投影。
- 不在 MVP 提供可视化 DAG、Runbook 编辑器、定时触发或自动化市场。
- 不把普通闲聊强制转换为 Task。

## 3. 信息架构

### 3.1 办公室

办公室是唯一默认工作入口，首屏包含：

1. 一个全局 Composer，提示语为「描述你想完成的工作…」。
2. 可选附件、期望交付格式和目标路径；高级字段默认隐藏。
3. 等待用户输入、等待审批、进行中和最近完成的 Task 摘要。
4. 用量概览降为次级 Section，不占据首屏主锚点。

提交后立即进入新建 Task Thread；不得先跳转到员工聊天。

### 3.2 工作库

工作库按 Task Thread 展示，不按员工 Conversation 分组。每条 Row 至少包含：Task 标题、状态、负责人/参与员工、最近事件和更新时间。

工作库只展示当前 Task Thread，不再承担历史筛选。工作记录支持归档、恢复和软删除：归档后进入全局「归档」页面且保持可恢复；删除只允许在归档页面执行，设置 `deleted_at` 并从产品投影中排除，不级联删除 Task、Action、Approval、Audit、Artifact 或 Deliverable。危险删除必须经客户端确认。

### 3.3 统一归档

「归档」是跨私聊 Conversation 与 Task Thread 的统一读取页面，不建立第三套归档状态。Runtime 分别以 `conversations.status='archived'` 与 `task_threads.archived_at IS NOT NULL AND deleted_at IS NULL` 作为事实源，客户端只聚合两个权威投影。私聊删除会永久删除该 Conversation 及消息；工作记录删除保持软删除与审计证据保留语义。恢复后项目从归档投影移除并返回各自当前入口。

Task Thread 在客户端表现为任务协作群，是持续交互和执行投影容器。时间线允许：

- 用户补充输入或修订目标；
- 系统提出方案和缺失输入问题；
- 用户确认/拒绝方案；
- Approval、Action、Handoff、Evidence 和 Deliverable 的可读投影；
- 失败后的合法恢复操作；
- 对已完成交付的追问；需要新副作用或新目标时创建新 Task revision 或新 Task，不篡改已验证证据。

### 3.3 Task Room

方案确认并物化后，客户端自动把绑定到 Root/Child Task 的员工显示为群成员。单员工 Task 仍使用相同 Task Room，不切换到私人聊天。

Task Room 固定包含：

1. 顶部：Task 标题、整体状态、参与员工和当前执行者；
2. 中部：按 canonical sequence 排序的群聊式 Timeline；
3. 底部：唯一 Composer，支持普通补充、回答 Runtime 问题和 `@员工` 路由提示；
4. Inspector：WorkOrder、依赖、Run/Action、权限、预算、Evidence、Handoff 和 Deliverable；
5. Workspace：经 Runtime 验证的文件和交付物，不展示任意本地目录内容。

消息视觉规则：用户靠右；员工靠左并显示员工身份；Runtime 系统事件居中或使用状态卡。员工自然语言与 Runtime 事实必须可区分，禁止让员工气泡自行声明审批已通过、Tool 已执行或 Task 已完成。

### 3.4 通讯录

通讯录只负责员工发现与管理：Profile、Identity/Soul/Persona、绑定 Skill、Tool surface、readiness、状态和历史参与记录。

员工详情保留次级「聊聊」和「交给他工作」：

- 「聊聊」进入员工私人 Conversation，不作为正式工作主路径；
- 「交给他工作」打开统一 Composer，并写入 `preferred_agent_id` 建议，不绕过 Rust 匹配与 readiness 校验。

### 3.5 Scenario / Runbook

客户端不展示 Scenario 库。现有 Scenario 仅用于历史兼容和恢复。未来 Runbook/自动化若恢复，必须属于高级管理入口，并通过同一 Proposal/Confirmation/Materialization 内核启动。

## 4. Canonical 对象

### 4.1 Task Thread

`TaskThread` 是用户与一次工作目标持续交互的容器，不隶属于某一员工：

```text
id
title
status: drafting | awaiting_input | awaiting_confirmation | materialized | running | succeeded | failed | cancelled
current_revision
root_task_id?
created_at / updated_at
```

`TaskThread.status` 是交互投影，不得成为第二套 Task/Action 执行状态。`materialized` 后的运行状态必须从 canonical Root/Task/Run/Action 派生。

### 4.2 Task Thread Message

```text
id
thread_id
sequence
role: user | system | agent
kind: goal | clarification | proposal | confirmation | agent_update | activity | approval | handoff | progress | deliverable | error
content
proposal_id?
task_id?
agent_id?
run_id?
action_id?
handoff_id?
deliverable_id?
created_at
```

`role=agent` 只允许引用当前 Thread 已绑定 Task 的 Agent Run 用户可读输出；它不是私人 Conversation Message。运行事件通过 canonical ID 和安全摘要投影，不复制完整 Prompt、reasoning、Secret 或未授权 ToolResult。投影应可从 Runtime 事实重建，不能成为执行状态源。

### 4.3 Timeline Projection

Runtime 为 Task Room 输出单调递增的 Timeline Item：

- 用户输入与确认来自 `task_thread_messages`；
- 员工开始、等待和结束来自 Child Task/Run/Action；
- 员工回复来自持久化的 Run output 或 verified Deliverable 摘要；
- Tool activity 只展示允许公开的 Tool/Action 名称和状态；
- Approval 卡绑定真实 `approval_id/action_id`；
- Handoff 卡绑定 verified Deliverable 和接收 WorkOrder；
- Deliverable 卡绑定 verified Artifact/Deliverable。

同一 canonical 事件必须投影为稳定 ID，刷新、恢复或跨客户端读取不得重复。用户可读内容与敏感数据裁剪在 Rust 完成，Swift 不自行拼接完整 ToolResult。

### 4.4 Task Proposal

模型只可生成以下候选字段：

```json
{
  "schema_version": "1.0.0",
  "intent": "chat | single_agent_task | multi_agent_task",
  "title": "string",
  "objective": "string",
  "missing_inputs": [{"key":"string","question":"string","required":true}],
  "deliverable": {"type":"string","description":"string","target_path":null},
  "assignments": [{
    "node_id":"client_node_id",
    "role":"owner | contributor | finalizer",
    "employee_selector":{"preferred_id":null,"capabilities":["string"]},
    "goal":"string",
    "depends_on":["client_node_id"],
    "acceptance_criteria":[{"criterion_id":"string","description":"string","evidence_type":"string","required":true}]
  }],
  "acceptance_criteria":[{"criterion_id":"string","description":"string","evidence_type":"string","required":true}],
  "requested_resources":["string"],
  "budget_hint":{"input_tokens":0,"output_tokens":0,"tool_rounds":0,"wall_clock_ms":0}
}
```

模型不得生成或决定 Task/Run/Action/WorkOrder/Handoff ID、权限 grant、审批结果、幂等键、最终预算、verified 状态或完成证据。

### 4.5 Validated Proposal

Rust 将候选方案解析为 `ValidatedTaskProposal`：

- 使用真实 active 员工与 Capability readiness 完成选择；
- 拒绝未知字段、未知枚举、循环依赖和未就绪能力；
- 计算权限差异、风险、预算上限和需要用户确认的事项；
- 生成不可变 `proposal_hash`、revision 和 expires_at；
- `missing_inputs` 非空时禁止物化；
- 用户确认必须绑定 thread、revision、proposal_hash 和幂等键。

## 5. 意图与方案生成

### 5.1 模型驱动，不使用关键词路由

统一入口只允许模型生成受 Schema 约束的 `chat | single_agent_task | multi_agent_task`。Rust 对结构、可用能力和安全边界做确定性验证。不得增加按“调研、写文档”等关键词硬编码的路由表。

### 5.2 单员工或多员工选择原则

优先单员工。只有满足至少一项时才提出多员工：

- 任务需要清晰分离的能力或权限边界；
- 上游 verified Deliverable 是下游工作的必要输入；
- 不同员工拥有非重叠 Capability，单员工无法完成；
- 用户明确要求多个员工参与。

仅为展示“团队感”、角色扮演或重复同一能力不得拆分多员工。

### 5.3 缺失输入

系统一次只询问阻止可靠执行的必要信息，优先复用当前 Thread 已确认内容。目标路径、外部收件人、不可逆动作、关键数据范围和验收标准缺失时必须追问；内部节点名、Skill ID、Token 分配不向普通用户询问。

## 6. 确认与权限

低风险、只读且预算在本地默认上限内的单员工任务可按用户设置自动启动；以下情况必须展示一次确认卡：

- 多员工方案；
- 文件写入、外部通信、账号数据访问或其他副作用；
- 新增授权根目录、连接器或 Secret 使用；
- 超过默认预算；
- 用户指定必须确认。

确认卡只展示：目标、交付物、负责人/参与员工、关键步骤、权限、预算范围和停止条件。不得展示内部 ID、完整 DAG、安全字段或 Prompt。

## 7. 物化规则

### 7.1 单员工

Rust 在事务中创建 canonical Task、Run Snapshot、Capability Set 和 Thread 绑定。执行复用 Generic Run Kernel。

### 7.2 多员工

Rust 将已确认 Proposal 直接物化为 Root Task、Child Task、WorkOrder、Dependency、Handoff 预期和 Root 输出绑定，复用 ADR-034/035。不得要求先保存 ScenarioDefinition；`scenario_id` 对新入口为可空历史兼容字段或由后续 additive migration 解耦。

### 7.3 幂等与恢复

- 同一 thread revision + proposal_hash + idempotency_key 只能物化一次；
- App 重启后从 Thread、Proposal 和 canonical Task 状态恢复；
- `result_unknown`、Approval 和 cancellation 继续使用现有安全规则；
- Proposal 过期、员工状态变化或 Capability readiness 改变时必须重新验证并重新确认。

## 8. API 语义

新增 CLI/跨进程语义，具体字段在 contracts 冻结后实现：

```text
task-thread-create
task-thread-list
task-thread-get
task-thread-message
task-thread-timeline
task-proposal-generate
task-proposal-confirm
task-thread-continue
```

`task-proposal-generate` 只生成并验证 Proposal，不产生执行副作用。`task-proposal-confirm` 是唯一物化入口。现有 `chat-send` 保留给员工次级私聊；Scenario/Business Flow CLI 保留为兼容接口但不由新客户端直接调用。

## 9. 安全不变量

- Rust 是 Proposal validation、员工选择结果、Task 物化、权限、审批、副作用、Handoff、Deliverable 和 Audit 的唯一事实源。
- Python 只能生成候选 Proposal 或 Worker decision，不直接访问 SQLite、Tool 或其他 Worker。
- 统一入口没有独立 Tool、Memory、Secret 或权限 authority。
- 私人 Conversation/Memory 不进入 Task Thread；跨员工只使用 authorized Handoff/SharedContextRef。
- Agent Timeline Item 必须绑定该 Thread 的 Task/Run/Agent；未知或越权引用默认拒绝。
- Mention 不产生执行权限，也不改变 WorkOrder Assignee；需要重编排时生成新 Proposal revision 并重新确认。
- Secret 不进入 Thread Message、Proposal、Task Context、日志或数据库。
- 未知 Schema/枚举/权限默认拒绝。

## 10. 验收案例

1. 用户输入“帮我总结这份文件”：系统选择一个具备读取能力的员工，不拆多员工。
2. 用户输入“调研市场并写成报告保存到桌面”：系统提出研究与写作两员工方案，追问主题/读者/路径中的必要缺口，一次确认后物化并执行。
3. 用户指定不可用员工：Rust 拒绝或提出可解释替代，不静默换人后执行。
4. Proposal 后员工 Skill readiness 变化：旧 Hash 失效，不启动。
5. 重复点击确认：只产生一个 Root/Task 和一组 WorkOrder。
6. App 重启：回到同一 Task Thread，消息、方案、审批、进度和交付物连续。
7. 通讯录点击“聊聊”：只创建该员工私人 Conversation，不进入正式任务列表。
8. 历史 Business Flow：仍可在工作库查看、继续、取消或人工核验。
9. 多员工 Task：群头显示两名参与员工；研究员工回复、真实 Tool activity、Approval、verified Handoff、写作员工回复和最终 Artifact 按顺序出现在同一 Timeline。
10. 未轮到的员工：只显示等待依赖状态，不生成虚构聊天消息。
11. 用户 `@` 非当前员工要求执行：Runtime 拒绝直接越过依赖，或提出新的 Proposal revision；不得直接唤醒该员工 Tool。
12. App 重启和重复刷新：Timeline Item 稳定、无重复，当前审批仍可在原卡片继续。

## 11. 发布门禁

- 代表性意图评测覆盖闲聊、单员工、多员工、缺失输入、越权方案和域外请求；不能用单次成功代替评测。
- Swift → Runtime JSON → SQLite 字段对齐测试。
- fresh install、Migration replay、重复确认、崩溃恢复、权限变化和历史 Flow 兼容测试。
- 真实 macOS App 验证办公室统一 Composer、Task Room 群聊时间线、参与员工、审批/Handoff/交付卡、通讯录次级聊天和无场景库入口。
- 真实 DeepSeek 外部端到端与 Fake Decision 门禁分开报告。
