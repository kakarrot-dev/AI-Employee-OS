# AI Employee OS 技术决策记录 ADR（Architecture Decision Records）v1.0

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

Accepted

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

## Version

```text
AI Employee OS v1.0 Architecture Freeze
```

## 核心技术决策：

|领域|选择|
|---|---|
|客户端|SwiftUI + AppKit|
|Runtime|Rust|
|Agent Engine|Deep Agents + LangGraph|
|模型|DeepSeek 官方 API 主源 + Poe API 受控兜底|
|Skill|Skill Runtime|
|Tool|Native + MCP + Plugin|
|Storage|SQLite + FastEmbed|
|Memory|Hybrid Memory|
|State|Dual State|
|安全|Permission + Sandbox + Approval|
|工程|Monorepo|
