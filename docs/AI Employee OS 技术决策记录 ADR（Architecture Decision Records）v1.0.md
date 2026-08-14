# AI Employee OS 技术决策记录 ADR（Architecture Decision Records）v1.0

> 阅读顺序：先读 ADR-041、ADR-040、ADR-039，再读文首 ADR-037、ADR-036、ADR-035、ADR-034、ADR-033、ADR-032，最后读 ADR-027～031 和 ADR-001 起的历史记录。ADR-031 已被 ADR-032 取代；ADR-017 已被 ADR-034 取代，只保留历史意义。

## ADR-037：Task Thread 采用任务协作群表现层，执行事实仍由 Runtime 投影

### 状态

Accepted（2026-08-12）

### 背景

办公室统一入口已经能把自然语言目标物化为单员工或多员工 Task，但当前工作库只展示消息文本和 WorkOrder 状态列表。用户无法在同一任务中自然看到每位员工的回复、当前活动、审批、Handoff 和交付接力；要求用户分别进入员工私聊又会把一个 Task 拆成多个 Conversation，破坏工作连续性。

Bloome 等产品验证了“人和多个 Agent 同处一个群聊表面、委派任务在卡片和详情中追踪”的低学习成本交互。但本项目是 Local-first 工作 Runtime，不能把社交群聊或模型自由发言变成执行事实源。

### 决策

1. 每个 `TaskThread` 在客户端表现为一个“任务协作群（Task Room）”。方案确认后，参与员工从已物化的 Task/WorkOrder 绑定自动召集；用户不手工建群，也不逐个邀请。
2. Task Room 只有一个 Composer 和一条统一时间线。用户、员工和 Runtime 系统事件使用明确身份展示；员工头像/姓名来自 canonical Agent，执行状态来自 canonical Task/Run/Action。
3. Task Room 不是 `Conversation`。不新增群聊 Conversation，不复制员工私人 Message/Memory，不让员工监听全部消息或自由决定是否执行。
4. 员工可见回复只能由其当前 Child Task/Run 输出或经验证的 Deliverable/Handoff 派生。模型声明的“已搜索、已写入、已完成”不能覆盖 Runtime 状态。
5. Approval、Tool activity、Delegation/Handoff、失败恢复和 Deliverable 以时间线卡片展示；高级字段、Evidence、预算、权限和完整 WorkOrder 图放在同一 Task 的 Inspector，不建立独立场景工作区。
6. 用户普通补充进入 Task Thread；`@员工` 只是目标路由提示。Rust 根据当前 WorkOrder、Capability Set、状态和权限决定接收者，不能因 Mention 绕过调度或授权。
7. Phase 1 仍为串行协作。未轮到的员工显示 `等待依赖`，不得为了营造群聊感生成占位回复。跨员工数据仍只通过 verified Handoff/SharedContextRef。
8. 私人员工聊天保留为通讯录次级入口，与 Task Room 隔离。

### 取代关系

本 ADR 取代统一任务 Spec 中“员工群聊不属于目标”的产品表现层结论，并取代 ADR-034 中“独立 Business Flow 工作区”作为唯一可见协作表面的部分。它不取代 ADR-034/035 的 Root/Child Task、WorkOrder、Handoff、Evidence、权限和 Rust 单一事实源。

### 禁止方案

- 把 Task Room 存成多人私人 Conversation，或复制各员工私人消息进入 Task；
- 让 Agent 根据群内全部消息自行抢任务、递归委派或直接调用其他 Worker；
- 用模型生成的自然语言冒充 Tool、Approval、Handoff、Evidence 或完成状态；
- 为群聊 UI 新建第二套 Task、Action、Approval、Event 或 Deliverable 状态；
- 未经 Runtime 授权，仅凭 `@员工` 扩大 Capability、文件根目录、Secret 或外部访问。

## ADR-036：场景编排退出客户端一级入口

### 状态

Accepted（2026-08-12）

### 背景

Phase 1 将 Scenario Definition、SOP、节点、依赖、预算和 Finalization 暴露为客户端一级「场景库」。真实用户目标是提交工作并获得交付，而不是在每次工作前理解或维护 Runtime 编排对象。要求普通用户先配置场景再启动，把内部 Builder 责任转嫁给任务发起者，也阻断后续统一自然语言输入与模型驱动意图理解。

### 决策

1. 客户端移除「场景库」一级导航，以及 Scenario 创建、编辑、AI 提案和 `business-flow-start` 产品入口。
2. 不删除 Scenario/Business Flow 机器契约、Runtime 命令、Migration、历史数据、Audit、Artifact、Handoff 或恢复能力；既有运行投影继续在工作库展示。
3. Scenario Definition 降为内部兼容与潜在高级 Runbook，不再是普通用户启动多员工工作的必经对象。
4. 后续统一任务入口使用自然语言目标，模型只提出单员工或多员工 Run Plan；Rust 继续验证 Agent、Capability、权限、预算、依赖、Handoff 与幂等事实。该入口按 `AI Employee OS Unified Task Entry & Orchestration Specification v1.0.md` 与对应 Implementation Plan 实施，不能复用隐藏场景编辑器伪装完成。
5. 历史 `appDestination=scenes` 在新版客户端按未知值回退到办公室，不建立迁移或别名入口。

### 取代关系

本 ADR 只取代 ADR-034 中“独立 Business Flow 工作区”作为产品可见入口的部分，不改变 Root/Child Task、WorkOrder、结构化 Handoff、Rust 单一事实源和安全成本约束。

### 禁止方案

- 删除已发布 Migration 或历史 Scenario/Flow 数据；
- 从工作库移除既有 Flow 的状态、恢复、审批或人工核验入口；
- 把隐藏的 Scenario 表单换名后继续要求普通用户配置 DAG；
- 在统一输入入口 Spec 未确认前，让客户端或 Python 直接创建 Task、扩大权限或执行 Tool。

## ADR-035：可信 Agent 执行闭环采用候选完成、确定性验证与原子收敛

### 状态

Accepted（2026-08-07）

### 背景

ADR-032 与 ADR-034 已规定模型 `complete` 不是成功事实、Deliverable 必须验证、取消必须持久化、Handoff 必须授权。但真实实现仍存在固定满分 Evaluation、浅层 Schema、最终 Context 未计量、取消后继续推进、Tool 子进程继承模型 Secret，以及 Handoff 未解析授权数据等偏差。逐点添加条件分支会继续扩大状态竞争和事实源分裂。

### 决策

1. 将 `AgentDecision.complete` 定义为 Candidate Completion。只有 Rust 在同一事务内通过递归 Schema、Evidence、确定性 Evaluation、WorkOrder Acceptance 和 cancellation/terminal 再检查后，才能写 verified Deliverable、Task succeeded 与 Run terminal。
2. Python Provider 最终接收的完整消息是 Context 预算唯一对象。Capability、Tool、Task、Observation 与授权 SharedContextRef 必须进入同一个 canonical Context；禁止 Rust 构建一份未消费 Context、Python 再拼另一份未计量 Prompt。
3. Cancellation Request 是持久化停止令牌。模型返回、Action 创建、Tool 开始与 Deliverable 提交都是 cancellation safe point；terminal Run 不得被后续响应复活。
4. `result_unknown` 表示执行仍可能产生迟到副作用。执行单元未确认退出前不得人工收敛；核验必须提交结构化、可审计 Evidence，固定占位 JSON 无效。
5. Secret 按最小进程注入。模型 API Key 只进入 Provider Worker；Tool/MCP/CLI 子进程使用环境白名单，不能继承模型 Secret。
6. Handoff 是唯一跨员工数据平面。接受前验证 Acceptance、Sensitivity、allow-list 与 Hash；接受时创建 SharedContextRef，下游由 Rust 解析有界内容。
7. Recovery 覆盖所有非 terminal Run checkpoint；确定性验证可以幂等重放，Tool 副作用不能推测或自动重放。

### 禁止方案

- 用 UI 文案、固定 score 或 `verified_by:user` 冒充验证；
- 仅依赖 Prompt 声明抵御 ToolResult/网页提示注入；
- 通过继承父进程环境解决 Tool 配置；
- 取消后忽略迟到 Worker 响应但不做数据库条件更新；
- 将 Deliverable ID 字符串直接当作下游可用 Context；
- 修改已发布 Migration 或建立第二套 Run/Handoff 状态。

完整协议与验收见 `docs/AI Employee OS Trusted Agent Execution Closure Specification v1.0.md`。

## ADR-034：多员工协作采用 Root Task、WorkOrder 与结构化 Handoff

### 状态

Accepted（2026-08-07）

### 背景

单员工 Conversation 已按员工隔离，Generic Run Kernel 已建立 `Agent → Skill → Tool → Deliverable` 主链。后续业务需要多个员工围绕一个目标工作，但共享私人聊天、Worker 互调或另建编排状态机会破坏权限、恢复、审计、成本和交付证据边界。

### 决策

1. 多员工业务流使用独立 Business Flow 工作区，不使用员工私人 Conversation 作为协作总线；私人 Message 与 Employee Memory 继续按员工隔离。
2. 每个 Business Flow 对应一个由 Coordinator 员工持有的 Root Task；每个 WorkOrder 对应一个明确 Assignee 的 Child Task，并通过 `parent_task_id` 关联 Root Task。
3. WorkOrder 的运行状态从 canonical Child Task、Run 和 Action 派生，不维护第二套 Task/Action 状态；Root Task 只有在全部必需 WorkOrder 和最终 Deliverable 通过验证后才能成功。
4. 员工之间只通过 Handoff 传递 verified Deliverable、ArtifactRef、摘要、验收结果和显式授权的 Context Reference；不得自动共享源员工的 Conversation、Memory、完整 Context 或未引用 ToolResult。
5. Rust Runtime 是 Root/Child Task、WorkOrder 调度、权限、审批、副作用、Checkpoint、Handoff、Deliverable、Evaluation 和 Audit 的唯一事实源。Python Worker 不得直接启动 Child Task、调用其他 Worker、选择权限或扩大预算。
6. 首版只支持用户显式指定 Coordinator、Executor 和线性 `A → B` 顺序依赖。声明式模板、有界并行、Reviewer 返工和智能协调按独立阶段后续加入。
7. Root 取消向未终结 Child Task 写入 canonical cancellation request；已确认副作用和证据不回滚。任何依赖链上的 `result_unknown` 禁止自动重放并阻止下游启动。

### 安全与成本约束

- 权限必须绑定具体 Child Task、Action、Agent 和 Resource；Business Flow 参与身份不产生全局读取授权。
- Flow 启动必须显式提交 Token 与 wall-clock 预算；缺少预算时拒绝启动。
- v1 硬上限为每个 Flow 最多 5 名员工、12 个 WorkOrder、每个 WorkOrder 最多返工 1 次、最大并发 3；Phase 1 实际并发固定为 1。
- 每个 Child Task 独立记录模型、Token、时间、Tool 调用、失败原因和 Deliverable 质量；Root 只做可追溯聚合，不伪造账单事实。

### 取代关系与实施门禁

本 ADR supersede ADR-017 的“MVP 不实现 Multi-Agent 协作”结论；ADR-017 继续保留为历史阶段记录。ADR-032、ADR-033 的 Rust 单一事实源、Capability Set、ToolExecutor 和 Deliverable gate 继续有效。

在独立 Implementation Plan 获批前，不得新增 Migration、机器契约、Runtime 调度或 Swift 业务流入口。

### 禁止方案

- 多员工共享同一个私人 Conversation 或把其他员工消息写入当前员工时间线；
- Python Worker 直接调用另一个员工、Worker、Tool 或数据库；
- 用 LangGraph、Deep Agents、客户端 Store 或第三方队列建立第二套持久化状态源；
- 通过复制完整 Context、Memory 或 ToolResult 实现协作；
- 允许模型自行创建员工、安装 Package、授予 Secret、扩大授权根目录、预算、并发或递归委派。

## ADR-033：聊天工作采用 Capability Set Run

### 状态

Accepted（2026-08-06）

### 决策

1. 聊天只识别 `chat | task`，不得在 Task 启动前把整个 Run 锁死到单一 Skill。
2. Rust 从当前员工绑定且 readiness=`ready` 的 Skill 构建不可变 Capability Set；显式 `run-skill` 仍使用只含一个 Skill 的集合。
3. Python 每个 `tool_call` 必须声明 `skill_id`。Rust 校验 `skill_id -> declared tool/action -> permission/policy` 完整授权链，再生成安全字段并执行 Tool。
4. 一个 Run 可以依次使用多个 Skill，但仍只有一个 Task、Run、Checkpoint、Observation、Deliverable 与 Audit 事实源；不得为跨 Skill 执行建立第二套状态机。
5. 聊天 Task 使用通用结果信封并以 Artifact、ToolResult 和 Evaluation 验证目标完成；显式单 Skill Run 继续校验该 Skill `output_schema`。
6. ToolResult 超过 Context 预算时必须外置并保留 ResultRef；Worker 协议错误允许在同一 Run 内无副作用重试一次，第二次失败才终止。

### 禁止方案

- 不为“搜索后写文件”等组合目标创建场景专用 Skill。
- 不把全部已安装 Tool 绕过 Skill 声明直接暴露给模型。
- 不以宽松截取 JSON、恢复 Golden Path 或客户端编排掩盖 Runtime 契约缺失。

## ADR-032：通用 Bounded Agent Loop 取代 Golden Path

### 状态

Accepted（分阶段迁移中）

### 决策

1. 工作执行主路径采用通用 `Agent → Skill → Tool → Deliverable` 契约；默认模式为 `agent_loop`，确定顺序任务可选 `workflow`。
2. Rust Run Kernel 是 Task、Run、Action、权限、审批、副作用、Checkpoint、Deliverable 和 Audit 的唯一事实源。Python Worker 只返回 `ask_user | tool_call | complete`，不得生成安全字段或直接执行 Tool。
3. Skill 是声明式方法和约束，不是任意代码执行入口；全部副作用经过 Rust ToolExecutor。v1 首先启用 Rust Native Tool Adapter，MCP/HTTP 另行设计。
4. `waiting_user`、`waiting_approval` 是 Run phase，Task 保持 `running`；审批继续由 Action `blocked` 表达，`result_unknown` 禁止自动重放。
5. Deliverable 必须通过 output schema 和 Evidence 验证。模型 `complete` 只是候选完成，不直接令 Task succeeded。
6. `tasks_enabled` 降为 per-Skill readiness 的兼容派生字段；新路径先提供显式 `run-skill`，聊天切换验收后才删除 Golden Path。

### 取代关系与迁移约束

本 ADR supersede ADR-031。`run-task`、`golden_path.rs` 和旧 Graph 在迁移期不得扩展业务特判；历史 Task/Action/Audit 只读保留。Deep Agents/LangGraph 仅可作为机制参考或无状态规划器，不得成为第二套持久化状态源。

完整字段、生命周期和验收见 `docs/AI Employee OS Generic Agent Runtime Specification v1.0.md`。

## ADR-027：普通对话与任务执行分离

Alex 的 Conversation/Message 是连续交流事实，Task/Action 是受控执行事实，两者不得互相冒充。闲聊由 DeepSeek 官方 API 生成；工作走 `run-task` / Skill Graph / ToolExecutor，见 ADR-031。多轮上下文由 Runtime 从 SQLite 按顺序重建，模型 reasoning 不持久化、不展示。API Key 只允许来自 macOS Keychain 注入的受控进程环境。

`chat-send` 在回复前做意图识别（启发式 + 可选 LLM）：`chat` 走对话 worker；`task` 且 `tasks_enabled` 时在同一会话中执行工作并写入助手说明，副作用仍只经 Rust ToolExecutor。未接通能力时工作意图降级为闲聊并提示。

## ADR-028：员工定义分层与 Effective Prompt 单向编译

员工定义拆分为 Identity、Soul、Persona。`agents` 与 `employee_profiles` 表达基础身份与提示词，`personas` 表达沟通、思考、决策与习惯。Swift 只编辑结构化输入；Rust Runtime 单向编译 Effective Prompt，并为每次 ModelCall 保存员工配置版本与 Prompt SHA-256。Skill、Tool、Memory 与安全规则后续只能作为编译输入加入，禁止客户端维护第二套 System Prompt 或绕过 Runtime 安全边界。

## ADR-029：Identity / Soul 为唯一用户提示词

客户端以「身份提示词」(`base_prompt`) 与「灵魂提示词」(`soul_json` 段落) 作为唯一可编辑提示词。Effective Prompt 由姓名/岗位/部门 + `base_prompt` + `soul` + `persona` 编译；`mission` / `responsibilities` / `boundaries` 仅为 DB 遗留列，由 Runtime 在保存时填充兼容值，不再驱动 Prompt、不得进入员工 API 响应，也不再作为 Client 编辑面。用户修改提示词后，下一次 `chat-send` 必须使用递增后的 `config_version` 与新 Prompt。

## ADR-030：Skill/Tool 仓库安装，Client 只读

Skill 与 Tool 不在 macOS 客户端创建或编辑。Package 放入仓库 `packages/skills`、`packages/tools` 后由 Runtime 安装并列表；未安装时 Client 六宫格保留入口但标注「尚未接通 Runtime」。工作执行（Task）仅在员工绑定了可用 Skill 且存在 active Tool 时启用。MVP 工作执行编排见 ADR-031。
目标：

记录关键架构选择背后的原因，避免后续开发过程中出现：

- 技术路线漂移
    
- 模块边界混乱
    
- 重复造轮子
    
- Agent 能力和产品模型脱节
    

---

# ADR-001：采用 Local-first AI Employee OS 架构

## 状态

Accepted

---

## 背景

AI 员工需要：

- 访问用户本地文件
    
- 管理个人知识
    
- 保存长期记忆
    
- 运行 Agent Runtime
    
- 调用外部模型
    

传统 SaaS 架构：

```text
Client

↓

Cloud Backend

↓

LLM
```

存在：

- 本地能力不足
    
- 数据控制弱
    
- macOS 深度集成困难
    

---

## 决策

采用：

> 本地运行 AI Employee Runtime，云端提供模型能力。

架构：

```text
macOS

↓

Local Runtime

↓

External LLM API

```

---

## 原因

优势：

### 1. 获得系统能力

AI员工可以访问：

- 文件
    
- 应用
    
- 本地知识
    

---

### 2. 数据主权

核心数据：

- Agent配置
    
- Memory
    
- Knowledge Index
    

保存在本地。

---

### 3. 未来扩展

支持：

- 企业私有部署
    
- 本地模型
    
- 离线能力
    

---

# ADR-002：采用 Swift + Rust + Python 三层架构

## 状态

Accepted

---

## 背景

AI Employee 同时需要：

- macOS 原生能力
    
- 高性能 Runtime
    
- AI生态能力
    

单语言方案存在问题。

---

## 决策

采用：

```text
Swift

负责：

UI + macOS


Rust

负责：

Runtime Kernel


Python

负责：

Agent Intelligence

```

---

## 原因

### Swift

适合：

- SwiftUI
    
- AppKit
    
- macOS API
    

---

### Rust

适合：

- 权限
    
- 沙箱
    
- 生命周期
    
- IPC
    

---

### Python

适合：

- LangChain生态
    
- Deep Agents
    
- AI实验
    

---

# ADR-003：Agent Engine 采用 Deep Agents + LangGraph

## 状态

Accepted

---

## 背景

需要支持：

- Agent Loop
    
- Plan
    
- Tool调用
    
- State
    
- Checkpoint
    

---

## 决策

采用：

```text
Python

↓

Deep Agents

↓

LangGraph

```

---

## 原因

避免：

自行实现：

- Planner
    
- State Machine
    
- Agent Loop
    

把精力投入：

AI Employee 特有能力：

- Employee Model
    
- Skill
    
- Memory
    
- Evaluation
    

---

## 边界

Deep Agents 负责：

```text
任务执行
```

不负责：

```text
员工生命周期
```

---

# ADR-004：Agent State 与 Employee State 分离

## 状态

Accepted

---

## 背景

容易混淆：

“任务状态”和“员工状态”。

---

错误：

```text
Agent State

包含全部信息

```

导致：

生命周期混乱。

---

## 决策

双 State：

```text
Employee State

+

Execution State

```

---

## Employee State

保存：

长期：

- 身份
    
- Persona
    
- Skill
    
- Performance
    

---

## Execution State

保存：

当前：

- Plan
    
- Tool调用
    
- Checkpoint
    

---

# ADR-005：采用 Agent Package 模型

## 状态

Accepted

---

## 背景

AI员工不是简单配置。

需要：

- 安装
    
- 升级
    
- 迁移
    

---

## 决策

Agent 使用 Package：

```text
agent/

├── manifest.yaml

├── persona

├── skills

├── tools

├── memory

└── tests

```

---

## 原因

统一：

```text
Agent Package

Skill Package

Tool Package

```

形成生态基础。

---

# ADR-006：采用 Skill Runtime，而非 Prompt 模板

## 状态

Accepted

---

## 背景

简单 Prompt：

能力有限。

---

## 决策

Skill 是：

> 可执行能力模块。

包含：

```text
SKILL.md

references

assets

scripts

tests

```

---

## 原因

支持：

- 版本管理
    
- 安装
    
- 评估
    
- 升级
    

---

# ADR-007：采用 Tool Runtime 混合模型

## 状态

Accepted

---

## 决策

Tool：

```text
Native Tool

+

MCP

+

Custom Plugin

```

---

## 原因

不同阶段：

### Native

保证基础能力。

---

### MCP

连接生态。

---

### Plugin

支持企业扩展。

---

# ADR-008：采用 Dynamic Context Engineering

## 状态

Accepted

---

## 背景

固定 Prompt：

无法支撑 AI 员工。

---

## 决策

Context 动态生成：

```text
Task

↓

Context Planner

↓

Identity

Persona

Skill

Memory

Knowledge

Tool

↓

LLM

```

---

## 原因

降低：

- Token成本
    
- 上下文污染
    

提升：

- 准确率
    
- 个性化
    

---

# ADR-009：Memory 与 Knowledge 分离

## 状态

Accepted

---

## 背景

很多 Agent 系统混淆：

知识和经验。

---

## 决策

分离：

```text
Knowledge

事实


Memory

经验

```

---

示例：

Knowledge：

```text
产品文档
```

Memory：

```text
用户喜欢先看商业价值
```

---

# ADR-010：采用 SQLite + FastEmbed 本地存储

## 状态

Accepted

---

## 决策

存储：

```text
SQLite

+

FastEmbed

+

File System

```

---

SQLite：

结构数据。

---

FastEmbed：

语义检索。

---

File：

原始内容。

---

原因：

MVP：

- 简单
    
- 本地
    
- 可迁移
    

---

# ADR-011：采用 Bounded Autonomous Agent Loop

## 状态

Accepted

---

## 决策

Agent：

自主循环。

但限制：

```yaml
max_iterations:10

max_tool_calls:20
```

---

原因：

避免：

- 无限循环
    
- 成本失控
    
- 错误扩大
    

---

# ADR-012：采用 Memory-based Improvement

## 状态

Accepted

---

## 决策

AI员工成长方式：

不是：

自动修改自己。

而是：

```text
任务

↓

评价

↓

经验Memory

↓

下一次增强

```

---

原因：

稳定、安全、可控。

---

# ADR-013：采用分层安全模型

## 状态

Accepted

---

架构：

```text
Agent

↓

Permission Gate

↓

Sandbox

↓

Human Approval

↓

Audit Log

```

---

原因：

AI员工拥有执行权限。

必须建立安全边界。

---

# ADR-014：采用完整 Observability

## 状态

Accepted

---

包含：

## Trace

查看执行链路。

## Metrics

查看性能。

## Logs

查看事件。

## Cost

查看模型消耗。

## Quality

查看结果质量。

---

# ADR-015：Monorepo 工程管理

## 状态

Accepted

---

结构：

```text
ai-employee-os

apps/

runtime/

skills/

tools/

agents/

storage/

docs/

```

---

原因：

MVP阶段：

- 快速迭代
    
- 接口同步
    
- AI辅助开发友好
    

---

# ADR-016：MVP 不实现 Computer Use

## 状态

Accepted

---

原因：

核心验证：

> AI员工能否完成工作。

不是：

> AI是否能模拟鼠标。

---

保留接口：

未来：

```text
Computer Tool Adapter
```

---

# ADR-017：MVP 不实现 Multi-Agent 协作

## 状态

Superseded by ADR-034（2026-08-07）

---

原因：

先验证：

多个单独 AI员工闭环。

不是：

员工团队协作。

---

未来：

加入：

```text
Agent Message

Workflow Graph

Blackboard
```

---

# ADR-018：AI员工第一验证岗位选择产品经理

## 状态

Accepted

---

原因：

产品经理任务覆盖：

- 文档
    
- 分析
    
- 知识
    
- 记忆
    
- 输出
    

最适合验证。

---

# ADR-019：Tool 调用尝试独立持久化

## 状态

Accepted

## 背景

Canonical ToolCall 要求 `call_id`、`idempotency_key`、`attempt` 和副作用状态，但原 16 表模型只有 Action，无法在进程重启后可靠去重，也无法表达同一 Action 的多次受控尝试。

## 决策

新增 `tool_executions` canonical 表，将计划步骤与真实调用尝试分离：

- Action 表达 Agent Loop 中的计划步骤。
- Tool Execution 表达一次实际调用尝试。
- `idempotency_key` 全局唯一，`action_id + attempt` 唯一。
- 持久化 `status`、`side_effect_state`、结果、时间和 Trace。
- `result_unknown` 禁止自动重放，只能人工核验收敛。

数据库通过追加 Migration `002_tool_executions.sql` 演进，不修改已发布的 `001_initial.sql`。

# ADR-020：DeepSeek 主源与 Poe 受控兜底

## 状态

Accepted

## 决策

MVP Provider Adapter 使用 DeepSeek 官方 API 作为主模型源，Poe OpenAI-compatible API（`https://api.poe.com/v1`）作为兜底模型源。Poe 使用 Responses API 的 `model` 字段选择模型，不使用 Creator Bot Query API。

只允许以下错误触发有界兜底：网络不可达、限流、服务端临时错误和明确的依赖不可用。认证失败、余额或配额问题、非法请求、内容策略拒绝和响应 Schema 错误不得静默切换，以免掩盖配置、安全或契约问题。

Provider 切换必须进入脱敏 Trace 与 Metrics。API Key 和 Token 只能来自受控进程环境或 macOS Keychain，不进入仓库、SQLite、日志、Trace、Memory 或 Agent Context。测试默认使用 deterministic fake provider，不调用计费 API。

# ADR-021：Task 执行配置使用持久化快照

## 状态

Accepted

## 决策

Task 从 `pending` 转为 `running` 前，必须在同一事务中创建 `task_execution_snapshots`，锁定 Skill、Toolset、Persona、Context 策略、权限和非敏感 Provider 配置。运行中只读取该快照，包或设置更新不得影响已启动 Task。快照禁止保存 API Key、Token、完整敏感 Context或模型原始输入。数据库通过追加 Migration `003_task_execution_snapshots.sql` 演进。

# ADR-022：User 与 Company 使用最小 Subject 引用表

## 状态

Accepted

## 决策

新增 `subjects` 表，仅提供 User、Company 的稳定 ID、名称和启停状态。Agent 继续使用 `agents`。Memory 与 Permission 在应用层按类型校验 `subjects` 或 `agents`。该表不引入账号、组织管理或 RBAC。数据库通过追加 Migration `004_subjects.sql` 演进。

# ADR-023：Worker 隔离与一次性权限授权

## 状态

Accepted

## 决策

Python Worker 是不持有系统权限的推理进程。macOS Runtime 必须通过 Seatbelt Sandbox 启动 Worker，禁止文件写入，并明确拒绝读取 SQLite 主文件及其 WAL/SHM；Worker 只通过有界 JSON Lines 协议提出 Tool Call，协议等待必须有超时。Rust Runtime 独立验证锁定的 Call、路径、幂等键和最终产物，所有副作用仍由 Rust ToolExecutor 执行。

高风险单次授权使用持久化 `scoped_permission_grants`，绑定 Task、Action、Agent、Resource、Action、过期时间和消费时间。授权不得仅存在于进程内；执行终态与授权消费在同一事务提交。数据库通过追加 Migration `005_scoped_permission_grants.sql` 演进。副作用完成但终态提交失败时必须持久化 `result_unknown` 证据，禁止将其降级为普通失败或自动重放。

# ADR-024：Decision Context 与自动 Memory 的信任边界

## 状态

Accepted

## 决策

运行时 Decision Context 使用 `decision-context.schema.json`，统一锁定 Prompt 内容与 Hash、Task、字符预算、Section 信任级别、Item 内容 Hash 和来源。预算按所有模型可见字符串字段计量，超预算失败关闭，不静默裁剪。完整 Context 只在受控进程间传递；Task Snapshot 仅保存 Context Policy、选择规则和完整 Context 的不可逆 Hash，不保存 Context 本体。

Knowledge 必须以 `untrusted_data` 进入 Context，读取时同时验证 Source 与 Chunk 的持久化 Hash。自动 Memory 必须绑定 Task、Trace 和 Extractor Version，并通过 `memory_provenance` 标记为 `untrusted_data`；缺少 Provenance 的旧记录同样默认按 `untrusted_data` 处理，禁止缺省提权。直接写入接口仅限 Runtime 内部 Bootstrap，外部调用必须经过候选门禁。自动候选与既有同 Owner/Type 的不同内容发生冲突时拒绝写入，禁止由调用者用空冲突字段绕过。数据库通过追加 Migration `006_memory_provenance.sql` 演进。

# ADR-025：Skill Graph 复用 canonical Action 状态

## 状态

Accepted

## 决策

MVP Graph Engine 为 `runtime-dag-v1`，直接编译已安装且版本锁定的 Skill Manifest。每个 Workflow Step 物化为一条 canonical Action，Step ID、依赖、输出名、Timeout、Retry 和 Tool Route 保存于 Action `input_json`；禁止新增 Graph Node 状态表或第二套状态机。

下游 Step 只有在全部依赖 Action 为 `succeeded` 时才能启动。Tool Node 的 Tool ID 与 Action 来自锁定 Manifest，Worker 不得改变；有副作用节点 `max_attempts` 必须为 1。Graph 初始化失败必须将已物化但未终结的 Action 与 Task 一并收敛为失败。运行 Evidence 从 canonical Action 状态读取，不把内存中的计划当作完成证据。

# ADR-026：Task 取消请求与 Runtime Event 持久化

## 状态

Accepted

## 决策

Swift Client 在启动 Task 前生成符合约束的 canonical `task_id`，但不直接写数据库。所有取消通过 Rust `cancel-task` 写入 `task_cancellation_requests`；执行中的 Runtime 在 Worker 等待边界轮询请求，终止 Worker，将未完成 Action 与 Task 收敛为 `cancelled`，并写入确认时间。取消与 Tool 完成竞争时，以已持久化的副作用证据为准，不回滚已确认成功的副作用。

Task 生命周期事件追加写入 `runtime_events`，`sequence` 在单个 Task 内从 1 单调递增，Swift 仅通过 `events --after <sequence>` 续读。客户端不得用本地进度覆盖 canonical Task/Action 状态，也不得因断线重复创建 Task。

数据库通过追加 Migration `007_runtime_events_and_cancellation.sql` 演进；旧 Migration 不修改。

# ADR-031：MVP 工作执行复用自研 Graph + Golden Path 编排（已被 ADR-032 取代）

## 状态

Superseded by ADR-032

## 背景

ADR-003 选择 Deep Agents + LangGraph 作为长期 Agent Engine。MVP 工作执行需要尽快接通 Client `run-task`、Skill/Tool Package、Graph Action 与 ToolExecutor，同时禁止引入第二套节点状态。

## 决策

1. CLI `run-task` 挂接自研 `golden_path` 编排（原 `run-golden`），复用 `TaskService`、`GraphPlan`、`ToolExecutor` 与 Python Worker；不在 MVP 引入 LangGraph Checkpoint。
2. 仓库 Package（`file-tool`、`document-tool`、`prd-generation`、`requirement-analysis`）由 Runtime bootstrap 安装，并通过 `agent_skills` 绑定 Alex，使 `tasks_enabled` 为真。
3. Client 工作确认是本地 UX（`awaitingWorkConfirmation`），写入类高风险动作仍通过 `--approve-write` 预置 `approvals`；完整 pending→approve 交互审批留待后续。
4. Knowledge 检索 MVP 暴露关键词 `knowledge-import` / `knowledge-search`；`embedding_ref` 保持空，FastEmbed 仍按 ADR-010 为后置能力。

## 边界

- Deep Agents / LangGraph 仍可作为后续 Python 规划器插件评估，不得成为 Task/Action 状态源。
- Client 不创建 Skill/Tool Package；安装入口为 Runtime CLI。

# ADR 总结

最终技术原则：

```text
AI Employee OS


Local-first

↓

Native macOS Experience

↓

Secure Runtime

↓

Agent Intelligence

↓

Skill / Tool Ecosystem

↓

Memory Growth

↓

Evaluation Loop

```

---

# 当前项目架构冻结版本

## ADR-039：统一归档是跨投影页面，不是新领域模型

状态：Accepted（2026-08-12）

私聊与工作记录共用一个「归档」入口，但继续由各自 Runtime 状态负责：Conversation 使用 `status`，Task Thread 使用 `archived_at/deleted_at`。客户端不得创建统一归档表或自行推导持久化状态。工作库删除「当前/已归档」双页签，只展示当前记录；删除仅从归档页发起，并复用既有确认、Row 状态和过渡动效。该决策避免第三套状态源，同时保留私聊硬删除与工作证据软删除的不同安全语义。

## ADR-040：Employee 物理删除与历史工作身份分离

状态：Accepted（2026-08-14）

Employee 生命周期操作固定为启用、禁用和删除。启用/禁用只改变 `agents.status`；删除物理移除原员工根记录及 Profile、Persona、Skill 绑定、私人 Conversation、员工 Memory 与权限。存在 `pending | running` Task 时必须拒绝删除，禁止客户端或 Runtime 将删除静默降级为禁用。

终态工作属于工作库与审计事实，不属于可调度 Employee 私有状态。每个 Task 创建时写入不可变 `task_participant_snapshots`，Task Thread 使用快照显示历史姓名和岗位，使用 canonical Task / Action / WorkOrder 显示进度。为避免重建全部已发布历史外键，Runtime 以固定 ID `system:historical-employee` 的永久 disabled、不可见、不可调度系统主体承接 Task、Approval、Evaluation、Scenario Node 与 WorkOrder 外键；`system:` 命名空间由 Runtime 保留，Employee CRUD 与 Agent Package 均不得占用。原员工 ID 与员工记录仍必须物理删除。该系统主体不得具有 Employee Profile、Persona 或 Skill，也不得进入员工目录或 Task Proposal。

Scenario Version 的定义正文与 Hash 不因员工删除而改写；`scenario_nodes.historical_agent_id` 保留确认时员工 ID，只有用于外键完整性的 `assignee_agent_id` 重绑定到系统历史主体。Audit Log 仍为追加写记录，员工外键按 canonical `ON DELETE SET NULL` 收敛，应用层不得改写既有审计事件。

## ADR-041：网络研究与文档交付使用两个最小权限内置员工

状态：Accepted（2026-08-14）

真实的“网络搜集后形成文件”同时需要 `network.search` 与受控本地文件写入。把两类权限都交给同一员工，会让研究阶段无故获得文件权限，也无法在 Task Thread 中验证跨员工 Handoff。Runtime bootstrap 因此安装两个可删除的内置 Agent Package：`data-researcher` 只绑定 `web-search`，其 Tool Surface 只能由该 Skill 暴露 `agent-reach-tool.search_web`；`document-writer` 只绑定 `local-file-operations`，其 Tool Surface 只能由该 Skill 暴露 `file-tool`。Tool 仍全局安装，不新增 per-agent Tool 绑定表。

Task Proposal 遇到同时要求公开网络证据与本地文档的目标时，应提出串行多员工方案：数据搜集员工产生带来源的 verified Deliverable，经 Handoff/SharedContextRef 交给文档编写员工；后者只使用授权上游资料并以真实 Artifact 证据完成最终 WorkOrder。Rust 继续验证员工、Capability Set、依赖、Acceptance、权限与最终产物，Python 只提出结构化方案和 Tool Call。

两个专职员工的 Identity、Soul 与 Persona 来自各自 Agent Package；首次安装写入 Profile，已有用户编辑不得被 bootstrap 覆盖。Runtime 每次 bootstrap 收敛其启用 Skill 为上述唯一集合，防止旧数据库遗留的越权绑定。用户删除任一内置专职员工后写入对应 `runtime_flags.builtin_agent_dismissed:<agent_id>`，以后不自动恢复；存在活动工作时仍按 ADR-040 拒绝删除。

## Version

```text
AI Employee OS v1.0 Architecture Freeze
```

## 核心技术决策：

|领域|选择|
|---|---|
|客户端|SwiftUI + AppKit|
|Runtime|Rust|
|Agent Engine|通用 Bounded Agent Loop（ADR-032）；可选 Workflow；Deep Agents/LangGraph 非状态源|
|模型|DeepSeek 官方 API 主源 + Poe API 受控兜底|
|Skill|仓库 Package 安装 + `agent_skills` 绑定|
|Tool|MVP：Native Tool（File/Document/Knowledge）；MCP / Plugin 非 MVP|
|传输|CLI / 子进程 JSON（非 gRPC）|
|Storage|SQLite；向量检索后置 FastEmbed；MVP Knowledge 为关键词|
|Memory|Hybrid Memory（Runtime 已有，产品未全暴露）|
|State|Task / Action 双状态机（见 Unified Data Model）|
|安全|Permission + Approval + Audit；App Sandbox 未作为 MVP 硬启用|
|工程|Monorepo|
