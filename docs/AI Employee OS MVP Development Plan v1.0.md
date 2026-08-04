# AI Employee OS MVP Development Plan v1.0

## 1. 文档定位

本文档将已冻结的 AI Employee OS 架构转化为可执行、可独立合并、可验证的 MVP 开发计划。

发生冲突时，按以下优先级裁决：

1. `AI Employee OS Unified Data Model v1.0.md`
2. `contracts/` 下机器可读契约
3. `AI Employee OS MVP API & Interface Specification v1.0.md`
4. Runtime、Security、Memory、Skill、Tool 专题设计
5. Blueprint、Code Skeleton 和本文档

本文档不建立第二套 Schema、状态或接口定义。实现需要改变冻结契约时，必须先更新 ADR、canonical 文档、机器可读契约及相应测试。

## 2. MVP 目标

在 10 周内交付一个 Local-first macOS MVP，验证单个 AI 产品经理 Alex 的可靠工作闭环：

```text
接收需求
→ 制定有限计划
→ 检索本地知识
→ 经 Rust ToolExecutor 调用工具
→ 必要时请求审批
→ 生成 PRD
→ 评价结果
→ 保存可复用经验
→ 中断后安全恢复
```

### 2.1 产品成功标准

- 用户能在 macOS App 中向 Alex 发起任务。
- 用户能看到计划、执行进度、审批请求、错误和最终结果。
- Alex 能基于本地资料生成可评审的 PRD。
- 用户能对结果评分并补充反馈。
- 已确认的稳定偏好能在后续相似任务中生效。

### 2.2 技术成功标准

- Swift 只负责交互、展示和授权，不参与 Agent 推理。
- Python 只负责 Context、规划和推理，不直接取得系统权限。
- 所有 Tool 调用必须经过 Rust ToolExecutor。
- Task、Action、Approval 严格遵守 canonical 状态与转换规则。
- 同一 `idempotency_key` 不得重复产生副作用。
- `result_unknown` 禁止自动重放，只能人工核验收敛。
- 未知 `schema_version`、版本、枚举、权限或 Runtime Adapter 默认拒绝。
- Audit Log 追加写，禁止更新或删除既有事件。
- Golden Path、错误路径和恢复路径都有可重复验收案例。

## 3. 范围冻结

### 3.1 In Scope

- 单个 AI 员工：Alex（AI Product Manager）。
- SwiftUI macOS Client。
- 薄 Rust Runtime、SQLite、Task/Action、ToolExecutor、Permission、Approval、Audit 和事件。
- Python Agent Worker、Context Builder、Provider Adapter 和有界 Agent Loop。
- Agent Package、Skill Package 和 Tool Package。
- `requirement-analysis`、`prd-generation` 两个正式 Skill。
- File Tool、Document Tool、Knowledge Tool。
- 本地文件与 `knowledge/seed` 知识检索。
- User、Agent、Company Memory 的 MVP 存储与检索路径。
- Task Trace、Tool Log、Model Usage、Evaluation、Feedback 和基础 Metrics。
- 中断恢复、幂等保护与 `result_unknown` 人工核验流程。

### 3.2 Out of Scope

- 多 AI 员工和 Multi-Agent 协作。
- Luna 或其他正式 AI 员工。
- Computer Use。
- 实时网页抓取和 Browser Tool。
- MCP 生态、Tool Marketplace、Skill Marketplace。
- Cloud Sync、企业 RBAC、企业组织管理。
- 完整 Sandbox 强化和自动 Skill 进化。
- Employee 创建、训练和后台自治等 Phase 2 产品能力。

`competitor-analysis` 不作为 MVP 正式 Skill。没有实时网页抓取时，该能力无法满足事实时效性要求；MVP 只允许用户提供本地竞品资料后，由通用需求分析能力处理。

## 4. 系统交付边界

```text
Swift macOS Client
        │ Task API / Event Stream
        ▼
Rust Runtime
Task / Action / ToolExecutor / Permission / Approval / Audit / SQLite
        │ Worker Protocol
        ▼
Python Agent Worker
Context / Planner / Skill / LLM / Memory Candidate
        │
        └── 禁止直接访问文件、执行系统命令或绕过 Rust 产生副作用
```

## 5. 团队与排期假设

10 周排期以 3 名工程师可并行投入为基线：

| 角色 | 主要责任 |
| --- | --- |
| macOS Engineer | SwiftUI、进程连接、Task/Approval/Result UI、原生权限体验 |
| Runtime Engineer | Rust、SQLite、状态机、ToolExecutor、安全、恢复、事件 |
| Agent Engineer | Python Worker、Context、Skill、Provider、Memory、Evaluation |

Product Owner 负责范围裁决、Golden Cases、PRD Rubric 和阶段验收。

若只有一名开发者串行实施，预计需要 18–24 周。不得通过删除安全、恢复或测试门禁维持 10 周承诺。

## 6. 开发策略

采用纵向切片交付，不按 Swift、Rust、Python 分别完成后再集中集成。每个阶段必须独立可合并；如果下一阶段不实施，当前阶段仍保持可用、可测试且不破坏安全边界。

开发顺序固定为：

```text
契约与持久化
→ Alex 与 Task 控制面
→ 安全 Tool 闭环
→ Agent Worker
→ PRD Skill
→ Knowledge 与 Memory
→ 恢复、评估与可观测性
→ macOS 产品闭环
```

安全 ToolExecutor 必须早于真实自主 Agent Loop。没有完成 ToolExecutor、Permission、Approval、Audit 和幂等门禁前，不允许 Agent 调用具有外部副作用的真实 Tool。

## 7. 10 周开发路线

| 阶段 | 时间 | 独立交付物 | 阶段门禁 |
| --- | --- | --- | --- |
| 1. 契约与持久化基线 | 第 1 周 | 完整契约、Migration 和状态模型 | fresh install、重放、外键、完整性、未知值拒绝 |
| 2. Alex 与 Task 控制面 | 第 2 周 | Agent Loader、Task Service、事件模型 | 能加载 Alex、创建任务、持久化合法状态 |
| 3. 安全 Tool 纵向闭环 | 第 3–4 周 | ToolExecutor、Permission、Approval、Audit、File/Document Tool | Python 只能经 Rust 读写；审批、幂等、超时和未知结果可复现 |
| 4. Agent Worker 闭环 | 第 5 周 | Context Builder、Provider Adapter、有界 Planner Loop | 能计划、请求 Tool、接收 Observation 并可靠终止 |
| 5. PRD Skill | 第 6 周 | Skill Loader、DAG 校验、PRD Generation | 合法 Skill 可执行，非法引用、成环和版本错误被拒绝 |
| 6. Knowledge 与 Memory | 第 7 周 | 本地索引、检索、Memory Candidate 和写入门禁 | PRD 引用本地资料；后续任务能应用已确认偏好 |
| 7. 恢复、评估与可观测性 | 第 8 周 | Trace、Metrics、Evaluation、Feedback、恢复流程 | 崩溃恢复不重复副作用，失败可定位到 Task/Action/Tool |
| 8. macOS 产品闭环 | 第 9–10 周 | Home、Alex Detail、Chat、Approval、Result、History、Feedback | 原生 App 完成 Golden Path 与异常场景验收 |

## 8. 阶段实施与验收

### 8.1 阶段 1：契约与持久化基线（第 1 周）

#### 实现范围

- 补齐 `tool-manifest.schema.json` 和 `skill-manifest.schema.json`。
- 完善 ToolCall、ToolResult 的结构定义与错误对象约束。
- 增加 manifest、调用、结果、未知版本、未知字段及无效枚举的正反例。
- 实现 Action 与 Approval 的 Rust 领域状态机。
- 按 Unified Data Model 验证 `001_initial.sql`。
- Migration 门禁覆盖 fresh install、重复启动、外键、JSON、枚举、索引和 `PRAGMA integrity_check`。
- 在应用层验证 `memories.owner_id` 和 `permissions.subject_id` 多态引用。
- 扩充 `scripts/check.sh`，确保其实际覆盖文档承诺的门禁。

#### 验收标准

- 所有合法契约样例通过。
- 缺字段、未知字段、未知版本、无效枚举、非法权限和错误 Schema 的反例失败。
- 23 张 canonical 表及索引与 Unified Data Model 一致。
- Migration 重复执行不损坏数据。
- 非法 Task、Action 和 Approval 状态无法写入。
- `./scripts/check.sh` 通过。

### 8.2 阶段 2：Alex 与 Task 控制面（第 2 周）

#### 实现范围

- 建立 Alex Agent Package、manifest 和 Persona。
- Agent Loader 完成 Schema 校验、规范化、Runtime 兼容检查和数据库快照。
- 实现 Rust `AgentRepository`、`TaskRepository` 和 `TaskService`。
- 实现 Task 创建、启动、完成、失败和取消。
- 定义结构化 Event Envelope，包含稳定事件 ID、Task ID、时间和 Payload。
- 支持事件顺序及客户端断线后的续接语义。
- 先通过 CLI 或集成测试提供最小控制面，不等待完整 Swift UI。

#### 验收案例

输入：

```text
为企业 AI 知识库设计一个 PRD
```

预期：

- 创建属于 Alex 的 `pending` Task。
- 启动后转换为 `running`。
- 合法终态可以持久化。
- 终态不能重新启动。
- 非法状态转换被明确拒绝并记录。

### 8.3 阶段 3：安全 Tool 纵向闭环（第 3–4 周）

#### 固定执行顺序

```text
Tool 与版本锁定
→ arguments Schema 校验
→ Permission Gate
→ 风险与 Approval
→ Sandbox 边界
→ 执行
→ 副作用核验
→ output Schema 校验
→ Action 持久化
→ Audit 追加写
```

#### 实现范围

- Tool Package Loader、Registry 和数据库快照。
- 唯一 ToolExecutor；Skill、Worker、Workflow 和恢复流程不得绕过。
- Permission Gate、File Scope 和 deny 优先规则。
- Approval 创建、批准、拒绝和过期。
- 幂等键、超时、重试边界和副作用状态。
- Action 状态与 ToolResult 状态映射。
- 追加式 Audit Logger 和敏感字段脱敏。
- File Tool：授权范围内的 read、list、search。
- Document Tool：在授权目录创建或更新 Markdown 文档。
- Knowledge Tool 只建立接口和注册信息，检索实现在阶段 6 完成。

#### 必须保留的失败案例

- 路径越过授权目录。
- 缺失权限或显式 deny。
- Approval 缺失、拒绝或过期。
- 相同幂等键重复调用。
- Tool 超时且副作用状态未知。
- Tool 返回不符合 output Schema。
- 未知 Tool、Action、版本或 `schema_version`。
- Python Worker 尝试绕过 ToolExecutor。

#### 验收标准

- Python 不能直接读取或写入测试文件。
- 合法 ToolCall 能通过 Rust 完成读写并返回结构化 ToolResult。
- `risk_level >= 2` 的动作没有有效 Approval 时进入 `blocked`。
- 同一幂等键只产生一次副作用。
- `result_unknown` 不自动重放。
- 每次执行、拒绝、审批和失败都有脱敏 Audit 证据。

### 8.4 阶段 4：Agent Worker 闭环（第 5 周）

#### 实现范围

- Rust 与 Python 之间的 Worker Protocol。
- Context Builder，按 Identity、Persona、Skill、Memory、Knowledge、Tool 分区组装。
- 每类 Context 声明数量或容量上限、缺失策略和敏感数据规则。
- Provider Adapter 和 deterministic fake provider。
- 有最大步骤数、最大 Tool 调用数、总超时和终止条件的 Planner Loop。
- Worker 生成 ToolCall，由 Rust 执行后返回 ToolResult/Observation。
- Worker 可以生成 Memory Candidate，但不能直接写入系统状态。

#### 验收标准

- fake provider 驱动的闭环可重复、无网络、无费用。
- Agent 能计划、请求 Tool、接收 Observation、生成结果并终止。
- 达到步骤、调用或时间上限时安全失败，不无限循环。
- Tool 被拒绝、超时、失败或返回未知结果时，Planner 不伪造成功。
- Python 进程退出不会绕过 Rust 持久化状态。

### 8.5 阶段 5：PRD Skill（第 6 周）

#### 实现范围

- Skill Package Loader 和 Registry。
- 校验 Schema、Runtime 兼容范围、Tool/Action/版本/权限引用。
- 校验 Workflow DAG、Step 输入输出、超时、重试、失败和审批策略。
- Task 启动时锁定 Skill、Tool、Prompt、Context 和权限快照。
- 实现 `requirement-analysis` 和 `prd-generation`。
- 建立 PRD 输出 Schema、模板和 Rubric。

#### 验收标准

- 合法 Skill 能通过统一 SkillExecutor 执行。
- 缺失 Tool、未知 Action、版本不兼容、权限声明不足、Schema 不连接或 Workflow 成环均被拒绝。
- 运行中修改包文件不会改变已启动 Task 的执行快照。
- PRD 输出必须符合 Schema，Evaluation 未达阻断阈值时不得标记为成功交付。

### 8.6 阶段 6：Knowledge 与 Memory（第 7 周）

#### Knowledge 实现范围

- 仅支持 `local_file` 和 `seed_document`。
- 内容哈希、分块、重复导入和失效重建。
- 关键词检索基线；只有基线不足时才接入 FastEmbed。
- 检索结果必须带 Source、Chunk、相关度和内容摘要。
- 大结果通过 `result_ref` 返回，不直接塞入 Agent Context。

#### Memory 实现范围

- 实现 preference、experience、decision 的自动候选路径。
- fact 和 pattern 可由 API 存储，但 MVP 不做自动提取。
- Candidate 按稳定性、重复性、未来价值和敏感性判断。
- Context 注入设数量、容量和置信度门槛。
- 冲突按显式用户修正、置信度和更新时间处理。
- 写入前执行最小化和脱敏。

#### 验收标准

- 重复导入相同资料不会产生重复有效索引。
- PRD 中使用的资料可追溯到本地 Source 和 Chunk。
- 检索缺失时明确失败或降级，不伪造资料。
- 用户第一次明确“PRD 必须说明商业价值”后，符合写入规则的偏好被保存。
- 第二次相似任务能够检索并应用该偏好。
- 冲突的新指令能覆盖旧偏好，并保留可追踪证据。

### 8.7 阶段 7：恢复、评估与可观测性（第 8 周）

#### 恢复规则

- `pending` Task 可以继续调度。
- `running` Action 恢复前必须核验真实副作用状态。
- 只有确认未开始时才允许按 manifest 策略重试。
- 无法确认时转换为 `result_unknown`。
- `result_unknown` 只能经人工核验收敛为 `succeeded` 或 `failed`。

#### 可观测与评估范围

- Task Trace、Context Span、Model Span、Tool Span。
- Token、延迟、Tool 调用次数、失败数和质量分数。
- 用户 1–5 分反馈及可选评论。
- PRD 完整性、可测试性、资料引用和无依据事实检查。

#### Eval Case 集

至少保留 12 个固定案例：

- 4 个标准 PRD 案例。
- 3 个缺失关键信息案例。
- 2 个资料互相冲突案例。
- 2 个 Tool 拒绝、超时或失败案例。
- 1 个 Memory 冲突案例。

#### 验收标准

- Runtime 或 Worker 在 Tool 执行前后崩溃均不会重复产生副作用。
- 失败可通过 `trace_id → task_id → action_id → call_id` 定位。
- Audit 和 Trace 不包含 Secret 或未经脱敏的完整敏感输入。
- 单次成功不能代替 Eval 集；固定案例达到 Rubric 门槛后才能进入阶段 8。

### 8.8 阶段 8：macOS 产品闭环（第 9–10 周）

#### P0 页面

- Home：向 Alex 发起任务。
- Alex Detail：身份、能力和已启用 Skill。
- Chat/Task：输入、计划、Action 进度、错误和恢复状态。
- Approval：动作、资源、风险、批准和拒绝。
- Result：PRD 预览、文件位置和 Evaluation。
- History：Task 状态和历史结果。
- Feedback：1–5 分和可选评论。

#### 验收标准

- App 能启动并连接 Rust Runtime 与 Python Worker。
- 断开和重连不会重复创建 Task 或 Action。
- 用户能看到真实持久化状态，而非 UI 自建第二套状态。
- Approval UI 展示具体动作、资源、风险和后果。
- 成功、失败、取消、阻塞和未知结果都有明确界面。
- Golden Path 和异常路径均通过真实 macOS 手动验收。

## 9. Golden Path

### 9.1 固定输入

准备一组包含用户访谈、业务约束和已有产品说明的本地测试资料，输入：

> 根据这些企业知识库访谈资料，生成一份可以进入评审的 PRD。重点说明用户价值、范围、权限、数据指标和验收标准。

### 9.2 通过条件

- Alex 选中正确 Skill。
- Knowledge Tool 返回带来源的本地资料。
- Document Tool 只写入授权目录。
- PRD 结构符合 Skill output Schema。
- Tool、Action、Trace 和 Audit 能串成完整链路。
- 结果达到 PRD Rubric 阈值。
- 用户反馈被持久化。
- 可复用偏好经规则判断后写入 Memory。
- 第二次相似任务能使用该偏好。
- 中途终止并恢复后不重复写入文档。

## 10. 测试与验证门禁

每个阶段合并前至少运行：

```bash
./scripts/check.sh
```

该命令必须实际覆盖：

- Rust 格式检查和测试。
- Python 测试。
- Migration fresh install、重放、外键和完整性。
- Tool 与 Skill 契约正反例。
- 状态机、权限、审批、幂等和恢复测试。

阶段 8 还需运行 Swift 测试；若采用 Xcode 工程，则运行项目确定的 `xcodebuild test` 命令。必须单独完成真实 macOS 手动验收，因为 Rust、Python 和契约测试通过不能证明原生权限、窗口、审批交互和进程恢复正确。

无法执行的检查必须在阶段交付中说明原因、替代证据和剩余风险，不得声称通过。

## 11. 里程碑

### M1：可信 Runtime 基线（第 2 周末）

- canonical 数据模型、契约和状态门禁有效。
- Alex 可加载，Task 可创建并合法流转。

### M2：安全副作用闭环（第 4 周末）

- 所有 Tool 调用经过 Rust ToolExecutor。
- Permission、Approval、Audit、幂等和未知结果路径可验证。

### M3：可运行 PRD Agent（第 6 周末）

- Alex 能通过有界 Agent Loop 执行 PRD Skill。
- fake provider 测试确定性通过，真实 Provider 完成受控集成验收。

### M4：可学习且可恢复（第 8 周末）

- Knowledge、Memory、Evaluation、Trace 和恢复闭环完成。
- 固定 Eval Case 集达到门槛。

### M5：macOS MVP（第 10 周末）

- 原生 App 完成 Golden Path 和异常路径验收。
- MVP 范围内没有依赖尚未实现的 Phase 2 能力。

## 12. 依赖与成本边界

- DeepSeek 官方 API 是主模型源，Poe API 是受控兜底源，只用于阶段 4 之后的集成测试。
- API Key 只能进入 macOS Keychain 或受控进程环境，不进入仓库、SQLite、日志、Trace、Memory 或 Agent Context。
- CI 使用 deterministic fake provider，不持续产生模型费用。
- macOS 开发签名只在原生权限或分发验收时需要。
- MVP 不依赖 MCP、云数据库、浏览器搜索或第三方托管服务。
- FastEmbed 不是第 1 周阻塞项；先建立可测的关键词检索基线，再用 Eval 证据决定是否接入。

Provider Router 默认调用 DeepSeek 官方 API。只有网络不可达、服务端临时错误、限流或明确的依赖不可用错误才能按策略切换到 Poe；认证失败、余额/配额问题、非法请求、内容策略拒绝和响应 Schema 错误不得静默兜底。每次切换必须进入 Trace 和 Metrics，但不得记录 Secret。该选择不得改变 Provider Adapter、Tool 安全边界或确定性测试策略。

MVP 默认模型配置为 DeepSeek `deepseek-v4-flash`，Poe `model=deepseek-v4-flash`。Poe 通过 `https://api.poe.com/v1` 的 OpenAI-compatible Responses API 接入，不使用 Bot Query API。macOS Settings 允许用户选择主模型、Poe 兜底模型、请求超时和是否启用兜底；Poe 模型列表通过 `/v1/models` 获取并短期缓存。设置中不得出现、持久化或回显 API Key，Secret 只通过 macOS Keychain 注入受控进程。

## 13. 风险与应对

| 风险 | 触发信号 | 应对 |
| --- | --- | --- |
| 三进程集成集中爆发 | 单模块测试通过但没有纵向调用 | 每阶段交付可运行纵向切片，不延迟到最后集成 |
| Python 绕过安全边界 | Worker 直接读写文件或执行命令 | ToolExecutor 成为唯一系统能力入口，并保留反例测试 |
| Agent Loop 不终止 | 步骤数、Tool 次数或耗时持续增长 | 强制最大步骤、调用、超时和终止条件 |
| 副作用重复 | 崩溃恢复后重复创建文档 | 幂等键、副作用核验、`result_unknown` 人工收敛 |
| Context 膨胀 | Token、延迟和无关信息上升 | 分区、容量上限、来源和检索阈值 |
| PRD 演示成功但质量不稳定 | 单次 Demo 通过，换输入失败 | 固定 12 个以上 Eval Case 和阻断式 Rubric |
| 排期依赖理想人力 | 三名工程师无法持续并行 | 延长工期，不删除安全、恢复和测试门禁 |

## 14. Git 与阶段交付

- 主分支为 `main`，提交保持单一目的。
- 不使用 `git add .`，只暂存本阶段明确涉及的路径。
- Migration 只追加，不修改已发布文件。
- 不提交 Secret、数据库运行文件、构建产物或本地环境配置。
- 每个阶段通过对应门禁后独立合并。
- 未经明确授权，不发布 Release，不删除分支或远端数据。

## 15. 最终完成定义

MVP 完成不是“Alex 能回答一次问题”，而是以下事实同时成立：

1. Alex 在真实 macOS App 中完成 PRD Golden Path。
2. 跨进程状态、接口和持久化符合 canonical 契约。
3. Tool 权限、审批、幂等、审计和未知结果路径可验证。
4. Knowledge 引用可追溯，Memory 写入有门禁。
5. 固定 Eval Case 集达到质量阈值。
6. 中断恢复不会重复副作用。
7. 所有已运行验证有真实证据，未验证边界被明确披露。
