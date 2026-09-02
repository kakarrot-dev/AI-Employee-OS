# AI Employee OS MVP 产品规格

版本：v0.1
状态：v0.1 已冻结；变更需重新评估 MVP 边界
语言：用户可见内容优先使用简体中文；Token、Tool、Skill、MCP、System Prompt 等专有名词保留英文。

## 1. 产品定义

AI Employee OS 是一个 Local-first 的个人 Agent 团队工作台。用户只与内置“总管”进行正式工作沟通；总管理解自然语言目标、组织 Agent 员工、审核工作，并交付可验证结果。

产品不模拟多人社交软件，也不让员工分别面向用户聊天。Agent 员工是受版本、能力、模型、记忆和权限约束的工作角色。

## 2. MVP 目标

MVP 只验证一条完整闭环：

```text
用户与总管沟通
→ 用户创建并测试 Agent 员工
→ 总管识别正式工作意图
→ 用户确认任务定义和执行计划
→ 多名员工串行完成工作与交接
→ 所有 Tool 调用经过授权网关
→ 总管依据证据审核
→ 向用户交付报告与来源清单
→ 有价值的信息自动沉淀为本地记忆
```

成功标准不是“Agent 能回复”，而是目标、分工、权限、执行、证据、审核、交付和记忆形成可追溯闭环。

## 3. 核心角色

### 3.1 用户

- 配置模型、权限、预算和本地目录。
- 创建、测试、发布、停用和归档 Agent 员工。
- 通过总管提出目标、修改任务和接收交付。
- 管理、修正、停用或永久删除本地记忆。

### 3.2 总管

总管是内置的顶级全局 Agent，也是正式工作中唯一面向用户的 Agent。

职责：

- 闲聊并理解用户意图。
- 判断是否建议转为正式任务。
- 检查已发布员工及其能力是否满足任务。
- 生成并维护任务草稿、员工分工和串行计划。
- 在执行过程中接收员工交接、处理异常并审核产物。
- 按已确认的验收标准生成 Delivery。

限制：

- System Prompt 和系统 Tool 由代码内置，客户端只读。
- 不能替代缺失员工直接完成业务工作。
- 不能创建、发布、修改或删除 Agent 员工。
- 不能绕过 Runtime 直接执行有权限或副作用的 Tool。
- 不能通过自行改写员工产物掩盖审核失败，只能退回修改。

### 3.3 Agent 员工

- 由用户在客户端中创建和维护。
- 正式执行时不直接与用户沟通。
- 每个员工拥有独立 System Prompt、模型配置、Agent 能力、记忆范围、测试案例和版本。
- 产品中的 Employee 是持久实体；每次任务中的 Deep Agents Sub-agent 实例是临时运行实体。

## 4. 对象与配置权限

| 对象 | 用户权限 | 来源 |
| --- | --- | --- |
| 总管定义 | 只读，可选择模型和运行参数 | 客户端内置 |
| Agent 员工 | 增删改查、测试、发布、停用、归档 | 用户创建 |
| Agent 能力 | 只读，可绑定给员工 | 由开发方随客户端版本包发布 |
| Skill | 只读 | 由开发方随客户端版本包发布 |
| Tool | 只读，调用受授权策略控制 | 内置或由内置 MCP 发现 |
| MCP | 定义只读；Credential 和连接状态可配置 | 客户端内置 |
| 记忆 | 自动沉淀；用户可查看和治理 | Local Memory Subsystem 与用户操作 |

Agent 能力是给员工绑定的产品级能力包，可组合多个 Skill、Tool、MCP 依赖、模型要求和权限要求。Skill 负责告诉 Agent 在什么场景、按什么步骤组合使用 Tool；Tool 是实际执行的原子动作；MCP 是 Tool 的来源或连接通道。

## 5. Agent 员工生命周期

### 5.1 创建流程

用户从“团队 → 新建 Agent 员工”主动创建。总管可以给建议，但不能创建或预填员工数据。

分步式表单：

1. 基本资料
2. System Prompt
3. 模型配置
4. Agent 能力
5. 记忆范围
6. 测试
7. 确认

每一步自动保存草稿。未完成测试的员工只能保持草稿状态。

### 5.2 版本

- 新员工首先产生 `draft_version`。
- 测试并由用户确认后发布为 `active_version`。
- 修改已发布员工时创建新草稿，旧版本继续服务已有任务。
- 发布新版本后，旧版本进入 `superseded`，历史 Run 仍引用其不可变快照。
- 可回滚到已经测试过的历史版本，恢复后仍须按规则重新验证依赖。

员工界面状态：草稿、待测试、可工作、已停用、已归档、有待发布修改。

### 5.3 测试

测试使用真实 Prompt、模型、Agent 能力、Skill、Tool/MCP 可用性和记忆策略，但运行在 Sandbox 中：

- 有副作用的 Tool 默认禁止。
- 测试记录不进入正式任务和正式记忆。
- 用户维护代表性 TestCase 和验收标准。
- 用户手动确认测试结果后才能发布员工版本。

### 5.4 删除

- 从未参与正式任务的草稿可以彻底删除。
- 有正式历史的员工只能归档，历史快照必须保留。
- 归档员工可以恢复，但恢复后必须重新测试。
- 归档员工不会自动删除关联记忆。

## 6. 对话与正式任务

### 6.1 对话

用户可以创建多个与总管的对话主题。对话可以产生多个任务，任务保存来源消息引用。删除或归档对话不能级联删除任务、Run、Delivery 或审计记录。

总管识别到工作意图时，先询问用户是否转为正式任务；只有用户同意后才创建任务草稿。

### 6.2 任务草稿

任务草稿由总管维护。右侧任务面板只读展示：

- 目标与范围
- 验收标准
- 员工及冻结版本
- 串行工作步骤和交接关系
- Agent 能力、Skill、Tool、MCP 依赖
- 模型、预算、超时和 Tool 授权模式
- 输入文件与授权目录

用户只能通过自然语言要求总管修改草稿。总管更新后展示差异。用户点击“确认并开始”后，草稿冻结为正式 `TaskRevision`。

### 6.3 能力不足

正式任务只能使用已经测试并发布的 Agent 员工。团队能力不足时，总管停止任务准备，说明缺口并建议用户创建或调整员工；不能亲自补位，也不能动态创建匿名 Agent。

### 6.4 执行

- MVP 仅支持串行执行。
- 员工之间不直接群聊，所有 Assignment 和 Handoff 经过总管。
- 员工原始输出可在诊断界面查看，但不作为面向用户的正式消息。
- 用户在执行过程中仍只与总管沟通。

用户提出需求变化时，总管创建 ChangeRequest。当前员工在当前 Deep Agents 节点完成、状态写入 Checkpoint 且没有未收敛 ToolAction 后进入安全停止点；系统不承诺任意指令中途立即暂停。用户确认差异后创建新的 `TaskRevision` 和 Run。旧 Run 被新 Run 取代，但不能原地改写。

### 6.5 完成与返工

总管依据已确认的验收标准审核。审核失败时退回相应员工；审核通过后任务自动完成并向用户交付，不要求用户再次点击验收。

用户交付后提出修改时，系统创建新的 ChangeRequest、TaskRevision 和 Run，并保留原交付。

## 7. Tool 与 MCP

### 7.1 边界

- MCP 与 Tool 底层独立建模，但统一放在“资源”模块的不同页签。
- 一个 MCP 可以提供多个 Tool；内置 Tool 可以没有 MCP 来源。
- Tool 调用的审批对象是具体动作，而不是笼统批准整个 MCP。
- Agent 只能提交 ToolAction Proposal，不能直接执行 Tool。

核心 MVP 中，`agent-reach` 只作为来源选择、依赖诊断和路由知识的参考能力层；首批 `github.repositories.search@research-source/v1` 与 `rss.read@research-source/v1` 继续使用产品私有 HTTP/解析器。用户于 Phase 10 明确要求安装“网络情报员”后，允许本机扩展 Runner 调用已安装的 Agent-Reach、Last 30 Days 与 OpenCLI，但只暴露三个固定只读 ToolVersion：查询长度和条数受 Schema 约束，参数经过敏感出站检查，外部结果标记为非可信数据，不能调用任意 Shell、覆盖 Host/Method/Path/Header 或自动登录平台。该扩展不进入默认分发包；登录态、Cookie 与可选 API Key 仍需用户单独授权。详见 [网络情报员与文档编写员实施验收](audits/phase-10/specialist-employees-and-local-tools.md)。

### 7.2 授权模式

系统设置提供默认值，每个 Run 启动前可以由总管在任务草稿中明确：

- `请求批准`：每次 Tool 调用暂停，展示员工、Tool、参数、资源范围和影响，等待用户批准或拒绝。
- `完全访问`：只在冻结的任务、员工、能力、Tool 和资源范围内自动执行，不能扩大为不受限系统访问。

Run 启动后锁定授权模式。需要改变时必须安全暂停并留下记录。

有副作用的 Tool 不自动重放；`result_unknown` 只能经人工核验收敛，不能自动重试。

### 7.3 可用性传播

```text
MCP 不可用
→ 其提供的 Tool 不可用
→ 依赖 Tool 的 Skill 不可用
→ Agent 能力不可用
→ 绑定该能力的员工需要重新测试或不能进入任务
```

系统不得静默使用替代 Tool、MCP 或模型。

### 7.4 非可信内容与出站控制

- 网页、搜索结果、代码仓库、视频字幕和社交平台内容一律标记为非可信数据，不能覆盖 System Prompt、任务约束、RunGrant 或 Tool 授权。
- ToolAction Proposal 必须保留参数来源；由外部内容诱导生成的 URL、查询、文件名和请求体按非可信参数处理。
- 具备网络出站能力的 Tool 必须校验目标域、协议、参数长度、编码形式和敏感信息模式，禁止把本地文件、Secret、记忆或工作区内容拼入查询和 URL。
- “完全访问”只省略逐次人工批准，不省略 Schema、范围、出站、敏感信息和提示注入检查。
- 检测到指令注入、越权请求或来源内容与任务目标冲突时，动作进入 `blocked` 并留下可解释证据。
- 注入检测只是风险信号，不能作为唯一防线；即使未命中检测规则，Runtime 的最小权限、参数来源追踪和出站校验仍必须阻止越权效果。

## 8. 模型

### 8.1 MVP Provider

首版只接入：

- Poe
- DeepSeek 官方

两者使用独立 Provider Adapter。底层保留统一内部请求和事件接口，但首版不开放通用模型厂商配置。Poe 固定 `https://api.poe.com/v1`，DeepSeek 固定 `https://api.deepseek.com`；Base URL 只读，不允许用户、Worker 或模型请求覆盖。

Poe 只允许三个精确 Model ID：`claude-sonnet-4.6` 用于总管文本，走 Responses API 与 Streaming；`gpt-image-2` 用于图像生成/编辑，走 Chat Completions 且 `stream=false`；`seedance-2.0` 用于视频生成，走 Chat Completions 且 `stream=false`。三条能力路径使用分离 Adapter，不接 Poe 其他 Claude、GPT/Gemini 文本、图像或视频模型。DeepSeek 首个基线为 `deepseek-v4-pro` + Responses API。所有 Adapter 只发送明确支持的字段，并在本地执行 Tool 参数和结构化输出 Schema 校验。

### 8.2 模型配置

模型服务与模型配置分离：

- 模型服务保存 Provider、Base URL、Keychain Credential 引用和连接状态。
- 模型配置保存 Model ID、Temperature、推理强度、Context、输出限制和价格元数据。
- 总管、每个 Agent 员工和记忆处理任务可分别选择模型配置。

保存模型配置时对“Provider + 精确 Model ID + Endpoint + Adapter 版本”执行真实能力探测：普通对话、流式输出、Tool Calling、结构化输出、Token 用量、超时、取消和错误格式。Provider 文档或模型枚举只能生成候选项，不能自动声明能力。正式任务只能选择满足角色要求且探测仍有效的模型，不能静默回退。Poe Points、DeepSeek Token 价格和限流元数据带来源与采集时间保存，不能作为永久常量。

### 8.3 Secret

- API Key 只存入 macOS Keychain。
- 普通启动和日常运行不要求反复输入 macOS 密码。
- 仅查看明文 Secret、导出敏感数据或重置保险库等高风险操作可以要求系统认证。
- Secret 不进入数据库、日志、Trace、记忆、Agent Context 或 Tool 子进程。
- 独立签名的 Provider Service 按需从其 Keychain Access Group 读取长期 API Key；Worker 只获得 Runtime 签发的短期、绑定 Run/Provider/模型/预算的本地 Grant，并通过 Runtime 私有 Pipe/UDS 间接调用 Provider。Worker 不获得回环代理地址、Provider 公网地址、网络 Client 权限或任意 Base URL、模型和 Tool。

## 9. 预算、超时与重试

### 9.1 运行限制

设置项包括：

- 单次模型请求超时
- 可安全重试的模型错误次数
- Assignment 最长时限
- 任务空闲时限
- 最大工作步数

Tool 自身超时由内置定义提供。有副作用动作不因超时自动重试。

### 9.2 预算

同时记录 Provider 原生用量、Token 和预估金额：

- 全局每日或每月预算
- 每个任务的 Token、金额和工作步数预算
- 总管、员工、测试、重试和记忆处理分别记账
- Provider 返回值标记为实际用量，本地推算标记为预估
- 达到预警线时提醒，达到硬上限时安全暂停

总管不能自行扩大预算或切换到更便宜模型，只能提出建议并等待用户通过新 Run 配置确认。

## 10. 记忆

### 10.1 采用范围

MVP 的产品边界是本地 L0–L3 记忆，不依赖 Memory Hub、Proxy、自动 Skill 提取、Wiki 或 CodeGraph。Phase 0 已排除 TencentDB Agent Memory `v2.0.1`：其发布物不可复现构建，本地 Embedding 配置不可达，明文 JSONL/WAL 和删除语义不满足加密与永久删除门禁。产品按本节契约实现自有 Memory Adapter 与最小本地记忆子系统，不为兼容上游而扩大 MVP。详见 [Phase 0：MemoryCore 与最小本地记忆审计](audits/phase-0/memorycore-local-memory-audit.md)。

只启用：

- L0 对话
- L1 原子记忆
- L2 场景记忆
- L3 核心画像

Agent 员工、Skill、任务等产品对象仍由产品数据库作为唯一事实源。记忆实现只接收稳定 ID、允许范围和来源引用，不创建或治理这些产品对象。

### 10.2 自动沉淀

- 对话级：提取用户偏好、稳定事实和工作规则。
- 任务级：提取项目知识、员工经验、失败教训和任务摘要。
- 在后台异步处理，不阻塞总管回复。
- 失败结果只能成为“经验／失败教训”，不能自动升级为事实。
- 支持新增、增强、修正、合并、冲突和失效记录。
- 冲突不能静默覆盖。

记忆处理模型由用户从已验证的 Poe 或 DeepSeek 模型配置中单独选择。启用前必须明确说明哪些对话或任务内容会被发送给该云端 Provider；Runtime 只发送完成提取所需的最小内容，并执行 Secret、非相关文件内容和敏感字段清理。未经用户授权不得新增数据出口或切换 Provider。用量单独记录并计入预算；模型不可用时进入待处理队列，不能静默切换。

### 10.3 分类与范围

范围：全局记忆、Agent 员工记忆、任务记忆。

固定一级分类：偏好、事实、规则、知识、经验、摘要。

动态标签：项目、领域、文件类型、相关员工和其他业务标签。

状态：有效、待核验、存在冲突、已停用、已删除。

### 10.4 召回

```text
用户消息
→ 总管识别意图
→ 确定允许访问的范围
→ 选择一级分类和动态标签
→ 本地 BM25 与向量召回
→ 时效、来源和相关性重排
→ 按 Token 预算加载
→ 向员工下发完成 Assignment 所需的最小记忆
```

Embedding 模型在首次配置后由客户端自动下载，校验版本与 SHA-256，并完全在本地运行。模型未就绪时必须明确显示降级状态。更换模型时创建新索引，迁移成功前保留旧索引。

### 10.5 治理与加密

用户可以修改分类、标签、范围和内容，停用、恢复、解决冲突或永久删除记忆。普通修改产生新版本；永久删除必须清除应用管理范围内的原文、派生摘要、向量、索引、缓存、队列和可还原存储页，只保留不含内容的审计墓碑。用户自行创建的 Time Machine、磁盘镜像或外部备份不在应用可验证范围内，产品必须在删除确认中明确说明。

API Key 与记忆主密钥使用 Data Protection Keychain，并按 Provider、Memory 和 MCP Secret 类别拆分 Access Group；Client、Runtime、Renderer、Preload 和 Worker 不加入业务 Secret Group。记忆数据库和向量索引必须在应用层加密。日常启动和召回不反复要求用户输入系统密码。Phase 0 已验证 AES-256-GCM 加密正文、标签和向量，磁盘不保留明文 BM25 索引，并能在删除后截断 WAL、清理可还原页；真实 Apple 签名/Profile 下的 Access Group、密钥轮换、Migration、崩溃恢复和规模性能仍是生产门禁。

## 11. 本地工作区与交付

每个 Run 拥有独立内部工作区：

```text
inputs/       输入文件的只读副本或授权映射
workspace/    员工过程文件
artifacts/    候选交付产物
evidence/     验收证据
```

总管审核通过后固化产物版本、Hash 和来源，再导出到用户授权目录。遇到同名文件时保留扩展名并自动添加最小可用后缀：`报告.md`、`报告_1.md`、`报告_2.md`。不得覆盖原文件。

Delivery 至少包含：摘要、产物、证据、验收结果、未解决问题、TaskRevision、Run 和计划版本。

存储治理要求：

- 设置可查看产品数据库、记忆、Checkpoint、Run 工作区、日志和缓存的占用。
- 每个 Run 配置磁盘预算；达到软上限时告警，达到硬上限时安全暂停，不能静默清理运行中证据。
- 已交付 Run 的过程文件、Checkpoint、事件和诊断日志采用明确的默认保留期；Artifact、Evidence、Delivery 和审计墓碑不得随缓存清理级联删除。
- 崩溃诊断默认只保存在本机并脱敏；任何上传都必须由用户单次明确授权并预览内容。

## 12. 客户端信息架构

### 12.1 一级导航

- 工作台
- 任务
- 团队
- 资源
- 记忆
- 设置

客户端新建最小 Electron 骨架，只允许按文件审计后抽取 Eigent 的通用 UI Primitive 或纯函数，不采用其产品壳、路由、状态管理、Main/Preload 或原 Runtime。界面以 Bloome 为唯一视觉事实源：窄图标栏、上下文列表、宽内容区、低边框、圆角和轻量状态。不得引入联系人、群聊、分享、邀请或社交发现。具体边界见 [Phase 0：Eigent 客户端壳审计](audits/phase-0/eigent-client-shell-audit.md)。

### 12.2 工作台

- 左侧：图标栏和对话列表。
- 中间：用户与总管的对话。
- 右侧：任务草稿或运行中的只读任务面板。

任务运行后仍留在对话页面，右侧面板切换为实时事件时间线。时间线只展示员工、步骤、Tool 调用、审批、交接、产物和证据，不展示隐藏思维链、System Prompt 或 Secret。

### 12.3 任务

任务只能从总管对话产生，不提供“新建任务”按钮。

筛选：全部、草稿、待开始、运行中、需要处理、已完成、失败、已取消。

这些是 Runtime 提供的只读投影，不是新的 Task 状态：草稿来自 `TaskDraft`；待开始对应 Task `pending` 且 Run `created`；运行中对应 Task/Run `running`；需要处理由 Run `paused`、待审批 ToolAction、`blocked` 或 `result_unknown` 投影；其余分别映射 Task `succeeded`、`failed`、`cancelled`。客户端不得自行组合底层状态。

详情：概览、计划、时间线、审批、产物与证据、交付、版本与变更。

### 12.4 团队

- Agent 员工：列表、创建、详情、编辑、测试、版本、任务引用、停用、归档和受约束删除。
- Agent 能力：只读列表与详情，展示 Skill、Tool、MCP、权限、版本和关联员工。

### 12.5 资源

- Skill：说明、资源、触发边界、步骤、验收规则、Tool 依赖和版本。
- Tool：Schema、权限、资源范围、超时、副作用、幂等性、来源和状态。
- MCP：连接方式、发现的 Tool、Credential 要求、健康状态和依赖传播。

定义只读；Credential、启用状态和连接测试在设置中完成。

### 12.6 记忆

入口：全部记忆、全局记忆、员工记忆、任务记忆、自动更新记录、冲突记忆和已停用。

详情展示当前内容、分类、标签、范围、来源、版本、关联对象、召回记录和冲突。正式执行时间线只显示加载了哪些记忆及原因。

### 12.7 设置

- 通用
- 模型服务
- Agent 运行
- Tool 授权
- MCP 连接
- 预算与用量
- 记忆
- 存储与恢复

## 13. 首次使用

采用最小初始化：

```text
选择 Poe 或 DeepSeek 官方
→ 输入 API Key
→ 选择并测试总管模型
→ 设置默认 Tool 授权模式
→ 后台下载本地 Embedding 模型
→ 进入工作台与总管聊天
→ 用户主动创建、测试并发布员工
→ 创建首个正式任务
```

预算、MCP、记忆和高级运行参数使用安全默认值，之后在设置中调整。客户端初始不内置任何业务员工。

## 14. 后台、离线与恢复

- 关闭窗口后应用进入菜单栏，任务继续运行。
- 用户显式退出应用时，Run 在当前节点完成并写入持久 Checkpoint 后安全暂停；若存在运行中的 ToolAction，必须先收敛为确定终态或 `result_unknown`。
- 崩溃后下次启动展示恢复摘要，由用户确认是否继续。
- 恢复前验证 Checkpoint、模型、MCP、Tool Schema、Agent 能力、目录和权限是否漂移。
- 无网络时可以浏览和治理本地数据、使用本地记忆搜索；依赖 Poe 或 DeepSeek 的对话、测试和任务不能执行。
- 断网中的 Run 保存检查点并安全暂停，不静默切换模型或转移到云端。

## 15. MVP 首条验收场景

用户通过总管下达多数据源网络调研任务。

### 15.1 员工

1. 网络调研员：绑定“多源网络调研”Agent 能力，使用内置“多源网络调研”Skill；该 Skill 可以吸收 agent-reach 的路由知识，但不直接执行其命令。
2. 调研分析师：绑定“调研分析报告”Agent 能力，只读取经过验证的 ResearchBundle。

### 15.2 执行

```text
总管确认任务范围和验收标准
→ 网络调研员通过受管 Tool/MCP 路由多个已审计来源
→ 生成 ResearchBundle
→ 经总管完成结构化 Handoff
→ 调研分析师交叉分析并生成 Markdown 报告
→ 总管审核来源、结论和信息缺口
→ 交付报告与来源清单
```

内置“多源网络调研”Skill 继续使用 GitHub 公开仓库搜索与用户授权的 RSS/Atom Feed。用户显式安装的“网络情报员”是独立扩展能力：Agent-Reach 走固定 Exa 查询、Last 30 Days 走固定快速只读研究命令、OpenCLI 只调用已登记的 Reddit/X/小红书搜索 Adapter；每条通道单独保存健康状态、失败和信息缺口，不把桥接连接等同于平台登录成功。新增来源仍必须分别通过许可、Credential、平台条款、沙箱、出站和健康检查后再授权。

所有来源内容均按非可信数据进入 ResearchBundle。验收必须包含提示注入样例，并证明来源中的伪指令不能扩大 RunGrant、读取本地敏感内容、改变验收标准或通过查询参数向外泄露数据。

### 15.3 ResearchBundle 最小契约

- Task、Run、Assignment 和员工版本引用
- 检索问题与查询记录
- 来源平台、URL、标题、作者、发布时间和获取时间
- 来源类型、访问状态和内容 Hash
- 内容摘要、支持的 Claim、冲突和可信度说明
- 信息缺口、失败来源和未覆盖范围

不应默认保存完整受版权保护页面；只保存完成验证所需的摘要、有限证据片段、链接和 Hash。

### 15.4 交付物

- `调研分析报告.md`
- `调研分析报告_来源清单.json`

报告包含：执行摘要、调研范围与方法、关键发现、交叉分析、趋势与分歧、风险与局限、结论和来源引用。

## 16. MVP 不包含

- 并行多 Agent 调度
- 员工直接面向用户聊天或员工群聊
- 动态匿名 Agent
- 用户在客户端创建或编辑 Agent 能力、Skill、Tool、MCP
- Marketplace、团队协作、企业 RBAC、账户与 Cloud Sync
- Memory Hub、Memory Proxy、自动 Skill 提取、Wiki 和 CodeGraph
- 通用模型 Provider 管理
- 完全离线大模型推理
- 未经用户授权的任意本地目录或系统访问
- 静默模型、Tool、MCP 或 Runtime 回退

## 17. 技术验证状态

### 17.1 已完成决策

- Eigent 逐文件组件抽取时的传递依赖与资产许可证；根 Apache-2.0 与 `package.json` MIT 元数据冲突须在首次分发派生代码前向上游确认。整仓 Fork 已因壳层与 Runtime、高权限 IPC 和云端链路高度耦合而排除。
- Deep Agents 固定版本可以完成临时员工委派、动态 Tool Interrupt、持久 Checkpoint、节点完成后安全停止、跨进程恢复和 Root/Sub-agent Streaming；硬取消会重放未完成节点，不能作为安全暂停。采用范围仅是受限 Harness，默认 General-purpose、并行委派、Filesystem/Execute Tool 和权限规则不得直接进入产品。详见 [Phase 0：Deep Agents 编排与恢复审计](audits/phase-0/deep-agents-orchestration-audit.md)。
- MemoryCore `v2.0.1` 可无 Docker 启动，但锁定构建、测试、本地 Embedding、应用层加密、永久删除和单一事实源门禁失败，不进入产品。最小本地替代 Spike 已完成中文本地 Embedding、分类/Scope 过滤、混合召回、加密落盘和删除验证。详见 [Phase 0：MemoryCore 与最小本地记忆审计](audits/phase-0/memorycore-local-memory-audit.md)。
- Poe/DeepSeek 官方文档与协议已审计；两家都存在静默忽略参数和端点语义差异，必须使用独立 Adapter。确定性 Fake Upstream 已验证 Worker 不接触 API Key、固定目标、预算、Proposal Tool、Streaming、结构化输出、Usage、错误规范化和取消传播；`deepseek-v4-pro` + DeepSeek Responses 已完成真实探测。Poe 当前公开目录含 349 个条目，但产品 Allowlist 只保留 `claude-sonnet-4.6`、`gpt-image-2`、`seedance-2.0`，三者仍待 Poe Credential 真实探测。详见 [Phase 0：Poe、DeepSeek 与 Provider 本地代理审计](audits/phase-0/provider-and-local-proxy-audit.md)。
- Agent Reach `v1.5.0` 不进入默认分发 Runtime。首批产品自有 GitHub REST + RSS Adapter 继续作为无外部 CLI 的默认路径；Phase 10 仅在当前用户已安装并显式要求的本机环境中注册固定只读外部 Tool，资源健康检查失败会阻止关联员工能力，不静默降级或扩大平台范围。详见 [Phase 0：Agent Reach 与受管网络调研审计](audits/phase-0/agent-reach-managed-research-audit.md)与[Phase 10 实施验收](audits/phase-10/specialist-employees-and-local-tools.md)。
- macOS 多进程安全边界采用最小 Keychain Access Group、独立签名 Sidecar 和 Worker 无网络方案；Worker 通过 Runtime 私有 Pipe/UDS 间接调用 Provider XPC/签名 Helper，不再直连回环 TCP。临时 Keychain ACL、稳定本地签名升级正负例已通过，`sandbox-exec` 仅作弃用失败模型；本地开发可进入 Phase 1，真实 Apple 签名/Profile、App Sandbox、升级与公证延期到 Phase 9 发布门禁。详见 [Phase 0：macOS 多进程 Keychain、签名与网络沙箱审计](audits/phase-0/macos-process-keychain-sandbox-audit.md)。

### 17.2 尚待技术验证

- 使用用户明确配置的 Poe Credential，分别验证 `claude-sonnet-4.6` 文本、`gpt-image-2` 图像和 `seedance-2.0` 视频路径；DeepSeek `deepseek-v4-pro` 全套文本能力探测已完成。
- 固定中文 Embedding 模型的正式 Eval Set、Recall@K、nDCG、误召回、长文本截断、批量延迟、峰值内存和打包体积；当前三个确定性样例不代表质量结论。
- 最小本地记忆的真实 Keychain Access Group、密钥轮换、版本/冲突/墓碑、Migration、备份、崩溃恢复、并发删除和十万级规模性能。
- GitHub/RSS 正式 Runner 的 DNS Rebinding/TOCTOU、OS Sandbox、签名、Keychain、崩溃恢复、缓存清理和性能；Exa/Jina 如进入后续版本须单独完成 Credential、数据使用和用户披露门禁。
- Deep Agents Checkpoint Store 与产品数据库的跨库提交、Outbox、补偿和清理策略；真实 Provider 下取消后的消息修复仍需验证。
- Electron 主进程、Runtime、Provider、Memory 与 MCP 目标在 Apple Development/Developer ID 签名、正确/错误 Access Group 和升级前后的 Keychain 行为。
- macOS App Sandbox 真实 Profile、嵌套签名、公证、Sidecar 生命周期、应用内运行时与升级回滚。
