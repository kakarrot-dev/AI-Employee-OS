# AI Employee OS 系统架构方案

版本：v0.1
状态：目标架构；Phase 0 外部依赖审计进行中

## 1. 架构目标

系统必须同时满足：

- 用户只与总管交互。
- Deep Agents 负责 Agent 编排，但不是权限内核。
- 所有 Tool 副作用经过可验证的本地安全边界。
- Secret 不进入 Agent、Tool、数据库、日志和记忆。
- 本地记忆子系统只负责 L0–L3 记忆，不接管产品实体；MemoryCore 是待 Spike 验证的候选实现。
- 客户端关闭窗口后任务可以继续，崩溃后可以从检查点恢复。
- 所有正式执行引用不可变版本，不能因配置更新发生静默漂移。

## 2. 总体结构

```text
┌────────────────────────────────────────────────────────────┐
│ AI Employee OS Client                                      │
│ Bloome visual language                                     │
│ 工作台 / 任务 / 团队 / 资源 / 记忆 / 设置                 │
└───────────────────────┬────────────────────────────────────┘
                        │ authenticated local IPC
                        ▼
┌────────────────────────────────────────────────────────────┐
│ Local Control Runtime                                      │
│ Task / Run / Revision / Budget / Approval / Audit          │
│ RunGrant / Tool Gateway / Workspace / Delivery / Recovery  │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Deep Agents   │  │ Memory Adapter │  │ Tool/MCP Runners   │
│ Python Worker │  │                │  │ sandboxed          │
│ Root + Subs   │  │                │  │                    │
└───────┬───────┘  └───────┬────────┘  └─────────┬──────────┘
        │                  │                     │
        ▼                  ▼                     ▼
┌───────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Poe/DeepSeek  │  │ Local Memory   │  │ Built-in Tool /   │
│ Provider      │  │ MemoryCore or  │  │ built-in MCP      │
│ subprocess    │  │ minimal store  │  │                    │
└───────────────┘  └────────────────┘  └────────────────────┘
```

客户端负责交互，不承担 Agent 推理和 Tool 执行。Local Control Runtime 是唯一可信控制面。Deep Agents、本地记忆实现、Provider 和 Tool/MCP 都是受管 Sidecar、子进程或 Runtime 内受控模块。

## 3. 进程与信任边界

### 3.1 Client Shell

职责：

- UI、表单、只读资源展示、时间线和用户审批。
- 读取 Runtime 投影，不直接读写 Runtime 数据库。
- 通过受认证的本地 IPC 发送命令和订阅事件。
- 通过系统 API 请求 Keychain 操作，但不把 Secret 暴露给渲染进程。

禁止：

- 直接调用模型。
- 直接执行 Tool 或启动 MCP。
- 自行推断任务状态。

### 3.2 Local Control Runtime

职责：

- 产品 Data Model 的唯一写入者。
- 创建 TaskRevision、Run、Assignment、Handoff、ChangeRequest、RunGrant、Approval 和 Delivery。
- 冻结员工、能力、模型、Skill、Tool、MCP 和权限版本。
- 校验 ToolAction Proposal、执行 Tool、保存证据和审计。
- 管理 Sidecar、后台运行、预算、超时、取消、检查点和恢复。
- 将领域事件投影给客户端。

Runtime 不负责生成业务内容；业务规划和内容生成由 Deep Agents 完成。

### 3.3 Deep Agents Worker

职责：

- 使用总管作为 Root Deep Agent。
- 将已冻结员工版本转换为临时 Sub-agent 配置。
- 生成串行 Assignment 和 Handoff。
- 调用模型进行规划、推理和内容生成。
- 通过无副作用的提案 Tool 提交 ToolAction Proposal，而不是执行真实 Tool。
- 生成结构化 Artifact、Evidence 引用和 Delivery 候选。

Worker 只接收 Runtime 签发的短期 Provider 会话和本地代理地址，不接收 API Key、Cookie 或其他 Secret，也不继承系统权限。Deep Agents 的 Tool interrupt 只用于暂停图执行并持久化提案；审批、Action ID、幂等键、执行和终态仍由 Runtime 决定。生产运行必须配置持久 Checkpointer，并将 Deep Agents `thread_id` 与不可变 Run/Assignment 引用绑定。

### 3.4 Provider Subprocess

- Poe 与 DeepSeek 使用独立 Adapter。
- 只有 Provider 子进程接收短期 Secret。
- Provider 在本机暴露受认证、仅面向 Worker 的代理端点；Worker 的模型客户端只能连接该端点，不能直连公网 Provider。
- Provider 只接受版本化内部请求并校验 Run、模型、预算和会话范围，拒绝任意 Base URL 转发。
- 将请求、流式事件、Tool Call、Usage 和错误规范化为内部契约。
- 不记录完整 Prompt、响应或 API Key；调试日志必须经过脱敏。

### 3.5 Tool/MCP Runner

- 每个 Tool 调用使用 Runtime 生成的 Action ID 和幂等键。
- MCP Credential 只注入对应 MCP 进程。
- Runner 只拥有 RunGrant 明确授予的目录、网络和动作范围。
- CLI/HTTP/浏览器后端必须随客户端受管打包或由已审计 MCP 提供，不能依赖 Agent 直接执行 Shell、用户全局安装目录或运行时自更新。
- 网络出站动作校验目标域、协议、参数来源、长度、编码和敏感信息模式；外部内容生成的参数默认按非可信处理。
- 结果通过结构化协议返回 Runtime；Runner 不能直接写产品数据库。

### 3.6 Local Memory Subsystem

- 只启用 L0–L3 Chat Memory，监听回环地址或运行在 Runtime 内部，不对局域网和公网暴露。
- 通过 Memory Adapter 接收客户端稳定 ID、允许范围和来源引用。
- 不创建或治理客户端 Employee、Task、Skill 等实体。
- 不直接调用 Deep Agents，也不代理 Poe/DeepSeek 主对话。
- MemoryCore Standalone 只有通过独立启动、模块解耦、本地存储、迁移、加密和删除 Spike 后才可作为固定版本 Sidecar；否则使用满足同一 Adapter 契约的最小本地实现。

## 4. 关键数据流

### 4.1 对话到任务

```text
UserMessage
→ Runtime 保存 Message
→ Root Deep Agent 生成回复和意图判断
→ Runtime 流式投影到 Client
→ 用户确认转为任务
→ Root 生成 TaskDraft
→ Runtime 校验员工、能力、模型、预算和资源
→ Client 展示只读草稿
→ 用户确认
→ Runtime 生成不可变 TaskRevision + RunGrant + Run
```

### 4.2 Assignment 执行

```text
Runtime 启动 Assignment
→ Deep Agents 创建冻结员工 Sub-agent
→ Sub-agent 请求模型
→ 外部来源内容以非可信数据块进入上下文
→ 需要 Tool 时提交 ToolAction Proposal
→ Runtime 校验参数来源、出站内容并审批/执行
→ ToolResult + Evidence 返回 Sub-agent
→ Sub-agent 生成 Artifact 和 Handoff
→ Runtime 固化版本和 Hash
→ Root Deep Agent 审核并决定通过或退回
```

### 4.3 ToolAction

```text
proposal
→ schema validation
→ untrusted-input and egress validation
→ employee/capability/tool binding check
→ RunGrant scope check
→ budget and timeout check
→ idempotency check
→ risk classification
→ approval if required
→ sandbox execution
→ result verification
→ succeeded | failed | blocked | result_unknown | cancelled
```

只有 Runtime 可以生成正式 Action ID、幂等键和终态。Agent 输出的状态仅是 Proposal。

Deep Agents 中暴露给模型的“Tool”是生成结构化 Proposal 的无副作用桩。Proposal 触发 Checkpoint/interrupt 后，Runtime 才决定批准、拒绝或执行；真实 Tool/MCP Runner 不注册到 Worker，也不能被模型绕过 Runtime 直接访问。

### 4.4 记忆写入

```text
Conversation/Task event
→ Runtime 写入待处理队列
→ Memory Adapter 去除 Secret 和无关内容
→ Runtime 按用户授权向指定 Provider 发送最小提取输入
→ 记忆模型判断价值、分类和更新动作
→ Local Memory Subsystem 保存 L0–L3 与来源
→ 本地 Embedding 生成向量
→ 加密索引提交
→ Runtime 记录 MemoryUpdateEvent
```

### 4.5 记忆召回

```text
current intent
→ Runtime 计算 user/employee/task allowed scope
→ category + dynamic tags filter
→ Local Memory Subsystem BM25/vector retrieval
→ RRF + recency + provenance rerank
→ token budget cap
→ Root receives bounded memory context
→ Root passes minimal relevant memory to employee Assignment
```

员工不直接进行无边界记忆搜索。测试 Run 使用隔离命名空间，不写正式记忆。

记忆数据库、向量索引和 Embedding 计算保持本地。若用户启用云端记忆提取，发送给 Poe 或 DeepSeek 的最小输入是已声明的数据出口，必须沿用用户选择的 Provider、预算和隐私策略，不得被描述为“全部记忆原文不离开本机”。

### 4.6 交付

```text
Root review passed
→ Runtime verifies Artifact/Evidence references
→ freeze Artifact version + SHA-256
→ create Delivery
→ reserve non-conflicting export filename
→ export atomically
→ verify exported hash
→ append audit event
→ Task succeeded
```

## 5. 数据所有权

| 数据 | 唯一事实源 |
| --- | --- |
| 总管、Agent 能力、Skill、Tool、MCP 定义 | 客户端内置版本包 |
| Employee、EmployeeVersion、TestCase、TestRun | 产品数据库 |
| Conversation、Message、Task、TaskRevision、ChangeRequest、Run | 产品数据库 |
| Assignment、Handoff、Approval、BudgetLedger、Audit | 产品数据库 |
| Artifact、Evidence、Delivery 文件 | Run 工作区与产品数据库元数据 |
| Model/MCP Secret | macOS Keychain |
| Agent Checkpoint | Deep Agents Checkpoint Store，由 Runtime 引用 |
| L0–L3 记忆与向量索引 | Local Memory Subsystem 加密数据目录 |

任何数据只能有一个写入事实源。其他模块只保存稳定引用、不可变 Snapshot 或只读投影。

## 6. 核心实体

```text
BuiltInBundle
├── OrchestratorVersion
├── CapabilityVersion
├── SkillVersion
├── ToolVersion
└── MCPVersion

Employee
├── active_version
├── draft_version
├── EmployeeVersion[]
├── TestCase[]
└── TestRun[]

Conversation
├── Message[]
├── ContextSummary
└── TaskDraft[]

Task
├── TaskRevision[]
├── ChangeRequest[]
├── Run[]
└── Delivery[]

Run
├── RunGrant
├── AssignmentExecution[]
├── ToolAction[]
├── Approval[]
├── Handoff[]
├── Artifact[]
└── Evidence[]
```

TaskRevision 必须冻结目标、验收标准、员工版本、能力版本、模型配置、预算、超时、授权模式和资源范围。

ChangeRequest 记录来源消息、差异、请求时间、旧 Run、安全停止点和用户决策；Handoff 记录上下游 Assignment、结构化输入输出、Artifact/Evidence 引用与 Hash。两者都是 Phase 2 契约，不允许在 Phase 5 临时引入。

## 7. 状态机

### 7.1 EmployeeVersion

```text
draft → testing → ready → superseded
           └────→ draft  (测试失败或继续编辑)
```

### 7.2 Task

```text
pending → running → succeeded
                  → failed
                  → cancelled
```

审批、暂停和恢复不是 Task 状态，由 Run 和 ToolAction 表达。

客户端筛选状态由 Runtime 投影：`TaskDraft` → 草稿；Task `pending` + Run `created` → 待开始；Task/Run `running` → 运行中；Run `paused`、待审批 ToolAction、`blocked` 或 `result_unknown` → 需要处理；Task 终态分别映射已完成、失败和已取消。客户端不得自行推断或持久化第二套状态。

### 7.3 Run

```text
created → running → pausing → paused → running
                  ├───────────────→ succeeded
                  ├───────────────→ failed
                  └───────────────→ cancelled
```

旧 Run 到达安全点后可被新 TaskRevision 的 Run 取代，但不能原地改变已冻结配置。

### 7.4 ToolAction

```text
pending → running → succeeded
                  → failed
                  → blocked
                  → result_unknown
                  → cancelled
```

`result_unknown` 禁止自动重放。

## 8. 安全不变量

1. 所有 Tool 调用必须经过 Runtime。
2. Secret 只进入对应 Provider 或 MCP 受控进程。
3. 未知 Schema、枚举、权限或版本默认拒绝。
4. RunGrant 在 Run 内不能扩大。
5. 审计日志追加写，不能修改既有事件。
6. 同一幂等键不能产生两次副作用。
7. Artifact 和 Evidence 必须有版本、Hash 和来源。
8. 员工只能访问 Assignment 所需的最小文件、Tool 和记忆。
9. “完全访问”仍受冻结资源范围限制。
10. 不允许 Deep Agents、本地记忆子系统或客户端渲染进程直接持有系统级权限。
11. 外部内容始终是不可信数据，不能改变系统指令、任务验收标准、RunGrant 或授权策略。
12. 所有网络出站参数都必须经过敏感信息与来源检查；本地内容不得通过 URL、查询或请求体被非预期外传。
13. Agent 不得直接执行 agent-reach 或其他上游 Shell/CLI；只有版本锁定、已审计、受 Runner 管理的 Tool/MCP 可以产生真实效果。

提示注入分类器和规则只能提高风险等级，不能成为授权依据。即使检测器漏报，真实副作用仍必须被 Schema、RunGrant、资源隔离和出站校验约束。

## 9. 本地 IPC

具体协议在 Spike 后决定，但必须满足：

- 只监听回环或使用 Unix Domain Socket。
- 客户端启动时生成短期会话凭据。
- 命令具备请求 ID、版本和幂等语义。
- 事件流可恢复，客户端重连后从事件游标继续。
- 不在 IPC 中传递长期 Secret。
- 所有跨进程消息使用版本化 Schema，未知版本默认拒绝。

## 10. 版本冻结与升级

一个客户端 Release 固定以下兼容组合：

- AI Employee OS Client 基线及经审计抽取组件的来源 Commit
- Deep Agents
- Local Memory Subsystem 及采用时的 MemoryCore 固定版本
- Agent 能力、Skill、Tool、MCP Bundle
- Provider Adapter
- Embedding 模型与向量维度
- 产品数据库和 Memory 数据 Schema

升级前必须备份数据库、Memory 数据目录和索引。Migration 只追加。运行中的 Run 使用旧 Snapshot；新版本只用于新 Run。客户端不提供依赖的独立自动更新按钮。

## 11. 加密设计约束

- API Key 与保险库密钥保存在 Keychain。
- 记忆数据库、向量索引和自动更新日志需要应用级静态加密。
- 登录 macOS 后正常启动不要求重复密码。
- 内部 Run 工作区使用当前用户权限隔离；敏感任务可在未来增加按任务加密，不进入 MVP。
- 在选择 SQLCipher、加密容器或自定义 Store Adapter 前，必须验证与本地记忆实现、SQLite 扩展、备份、迁移和崩溃恢复的兼容性；采用 MemoryCore 时增加其 Store 兼容验证。
- Keychain 访问主体必须固定为签名后的 Client/Runtime/Provider/MCP 进程集合；开发签名、正式签名和升级后的 ACL 行为都要单独验证，禁止退回共享明文配置文件。
- 产品数据库、记忆、Checkpoint、Run 工作区、事件、审计和诊断日志分别设置配额与保留策略。清理只能删除可重建缓存或到期过程数据，不能破坏 Artifact、Evidence、Delivery、审计墓碑或运行中恢复点。
- 崩溃诊断默认本地、脱敏和有期限；上传前由用户预览并单次授权。

## 12. 恢复设计

恢复前检查：

- Checkpoint 是否完整且属于当前 Run。
- Employee、Capability、Skill、Tool、MCP 和模型 Snapshot 是否可用。
- Provider 与 MCP Credential 是否存在。
- 授权目录是否仍可访问。
- 上次 ToolAction 是否可能已产生未知副作用。
- 预算和超时是否仍允许继续。

存在漂移时不能自动恢复。Runtime 生成差异摘要，由用户通过总管确认新的 TaskRevision 或取消。

“安全停止点”是节点完成、持久 Checkpoint 已提交且 ToolAction 已收敛的边界，不是任意 Token 或任意函数执行位置。硬取消只能作为故障终止手段，不能伪装成可恢复暂停。

## 13. 待 Spike 决策

以下内容需通过后续 Spike 确定：

- Local Control Runtime 的实现语言及与新客户端骨架的 IPC 方式。
- Deep Agents 的 Tool interrupt、节点级安全停止、持久 Checkpointer，以及 Checkpoint Store 与 Runtime 产品数据库的提交/补偿边界。
- MemoryCore 能否脱离 Hub/Proxy、以无 Docker、纯本地形态独立运行；若采用，验证其加密 Store 改造方式，否则选择最小本地实现。
- Provider 子进程的短期会话、受认证本地代理、Secret 注入和网络隔离方式。
- MCP/CLI Tool 的受管打包、沙箱技术、平台条款、Credential 与 macOS 权限模型。
- agent-reach 路由知识到产品内 Tool/MCP 的重建清单，以及不依赖全局 Node/Python/CLI 安装的可交付来源范围。
- 多进程代码签名与 Keychain ACL 在开发、升级和正式发布环境中的兼容性。
- Embedding 模型、下载源和许可证。

这些 Spike 只能验证目标架构，不得反向扩大 MVP。
