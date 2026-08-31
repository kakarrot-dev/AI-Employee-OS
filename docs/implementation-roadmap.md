# AI Employee OS 从零实施路线图

版本：v0.1
状态：Phase 0 进行中；Eigent 子审计已完成

## 1. 实施原则

- 先验证外部依赖和安全边界，再写产品页面。
- 每个阶段只建立一个可运行的纵向闭环。
- 不从旧项目复制代码、Schema、文档或历史兼容层。
- 未通过上一阶段门禁，不进入下一阶段。
- 不为未来 Marketplace、并行 Agent、企业权限或知识库预建抽象。

## 2. Phase 0：外部依赖审计

### 工作

- 审计 Eigent 的许可证、目录、桌面技术栈、组件、路由、状态管理和原 Agent Runtime 耦合。
- 审计 Deep Agents 的 Root/Sub-agent、提案 Tool、持久 Checkpointer、Streaming、Interrupt、节点级安全停止和硬取消语义。
- 审计 MemoryCore 能否与 Hub/Proxy 解耦，以无 Docker、纯本地存储和独立进程形态运行，并验证 API、SDK、Migration、删除和加密扩展点。
- 审计 Poe、DeepSeek 官方 API 的真实能力。
- 审计 Provider 本地代理、短期会话和 Worker 不接触 Secret 的实现路径。
- 审计 agent-reach 的平台路由、上游运行时依赖、CLI/MCP、Credential、平台条款、分发、健康检查和受管重建方式。
- 审计 Electron Client、Runtime、Provider、MCP 多进程签名与 Keychain ACL。

### 产物

- 依赖版本与许可证清单
- [Eigent 保留/删除/替换清单](audits/phase-0/eigent-client-shell-audit.md)（已完成）
- Deep Agents 最小编排 Spike
- MemoryCore 独立运行/最小本地实现决策与加密召回 Spike
- Poe/DeepSeek 能力矩阵
- agent-reach 路由知识 → 受管 Tool/MCP 映射、许可与降级清单
- 多进程 Keychain ACL 与 Provider 本地代理 Spike
- 已验证兼容矩阵

### 门禁

- 能证明 Eigent 的产品壳可以与原 Runtime 解耦，或明确切换到组件抽取方案。
- 能运行总管委派一个临时员工，在节点完成后安全中断并从持久 Checkpoint 恢复；硬取消的不可恢复边界有真实记录。
- 能在不使用 Docker 的情况下启动固定版本 MemoryCore，并证明 Hub/Proxy/Skill/Wiki/CodeGraph 可完全关闭；否则明确采用最小本地实现。
- 能完成本地 Embedding、分类过滤、召回和删除。
- 能证明至少一个 Poe 或 DeepSeek 模型满足总管要求。
- 能证明 Worker 只访问受认证本地 Provider 代理且无法读取 API Key。
- 至少两个独立来源后端可以无用户全局 Node/Python/CLI 安装、无 Agent Shell 直通地受管执行；其许可和平台风险可接受。
- 开发签名和目标发布签名下的 Keychain 日常访问不反复弹窗，Secret 不退回文件或环境常驻。

## 3. Phase 1：空客户端壳

### 工作

- 新建最小 Electron + React + TypeScript 客户端骨架，固定 Node、包管理器并提交 lockfile。
- 按逐文件清单抽取通过许可证、传递依赖和权限审计的 Eigent 通用组件，保留来源 Commit、版权、许可证和修改说明；不复制原产品壳、Main/Preload、业务页面、云端依赖或 Agent Runtime。
- 建立 Bloome 风格 Design Token。
- 实现工作台、任务、团队、资源、记忆、设置的空壳与导航。
- 建立本地 IPC 客户端和领域事件订阅骨架。

### 门禁

- 六个模块可导航。
- 窗口、菜单栏和重连行为可验证。
- 客户端不直接调用模型或 Tool。
- Renderer 不启用 Node Integration 或 `webviewTag`，Preload 不暴露通用 `ipcRenderer`。
- 不存在原 Eigent Runtime、Cloud、Updater 或高权限 IPC 的静默执行入口。

## 4. Phase 2：Local Control Runtime 与契约

### 工作

- 定义版本化 Schema：Employee、TaskDraft、TaskRevision、ChangeRequest、Run、Assignment、Handoff、ToolAction、Approval、Artifact、Evidence、Delivery。
- 建立产品数据库和追加写 Audit Log。
- 实现状态机、UI 状态投影、RunGrant、预算账本、事件游标和内部 Run 工作区配额/保留策略。
- 建立 Sidecar 生命周期、健康检查和恢复协议。

### 门禁

- 未知 Schema 和枚举默认拒绝。
- 状态机正反例测试通过。
- UI 的草稿、待开始、运行中、需要处理和终态均来自 Runtime 投影，客户端没有第二套状态推断。
- Migration 可在新库和重复启动下运行。
- 崩溃后可重建 Runtime 投影。

## 5. Phase 3：模型与总管对话

### 工作

- 实现 Keychain 服务。
- 实现 Poe 与 DeepSeek Provider Adapter。
- 实现受认证本地 Provider 代理和 Runtime 签发的短期会话，禁止 Worker 直连 Provider。
- 实现模型配置、能力探测、预算和 Usage 规范化。
- 接入内置总管和流式对话。
- 实现离线状态、超时、取消和错误展示。

### 门禁

- Secret 不进入日志、数据库和 Agent Context。
- Worker 进程环境、参数、文件和错误输出中均不存在 Provider Secret。
- 至少一个真实 Provider 完成流式对话和结构化输出。
- Tool Calling、Usage、取消和错误能力有真实探测记录。
- 客户端重启后可读取历史对话，但不泄漏 Secret。

## 6. Phase 4：Agent 员工管理

### 工作

- 实现 Agent 员工列表、详情和分步创建表单。
- 实现 System Prompt 分层预览。
- 实现 Agent 能力只读目录和依赖传播。
- 实现 TestCase、Sandbox TestRun、发布、版本、回滚、停用和归档。

### 门禁

- 新员工未测试不能发布。
- 修改已发布员工不会影响旧 Run。
- 不可用 Tool/MCP 能阻止关联员工进入正式任务。
- 有历史引用的员工不能被物理删除。

## 7. Phase 5：Deep Agents 正式任务闭环

本阶段只验证不调用外部 Tool 的纯文本/结构化产物闭环；ToolAction Proposal 和真实副作用从 Phase 6 开始接入。Delivery 的内部固化属于 Runtime 行为，不视为 Agent Tool。

### 工作

- 总管识别任务意图并询问是否转为任务。
- 生成只读 TaskDraft 和差异。
- 用户确认后冻结 TaskRevision、RunGrant 和员工版本。
- 实现串行 Assignment、Handoff、持久 Checkpoint、节点级安全暂停、恢复和 ChangeRequest。
- 实现总管审核和 Delivery。

### 门禁

- 总管不能使用未发布员工或匿名 Agent。
- Run 中不能扩大员工、模型、Tool 或目录范围。
- 需求变化产生新 TaskRevision 和 Run。
- 崩溃恢复不会重复已确认的副作用。
- 暂停只在节点完成、Checkpoint 已提交且无未收敛 ToolAction 时成立，UI 不承诺任意时刻即时暂停。

## 8. Phase 6：Tool Gateway、MCP 与 agent-reach

### 工作

- 实现 ToolAction Proposal 与 Runtime 校验。
- 实现“请求批准”和“完全访问”。
- 实现幂等、超时、结果验证和 `result_unknown`。
- 建立 Skill/Tool/MCP 内置版本包和只读资源页面。
- 将 agent-reach 作为路由知识来源，重写为内置“多源网络调研”Skill；将通过审计的平台后端分别封装为受管 Tool/MCP，不执行上游 Skill 中的 Shell 命令。
- 实现数据源健康检查、Credential 状态和可用性传播。
- 实现非可信来源标记、提示注入检测、出站参数来源追踪与敏感信息阻断。

### 门禁

- Deep Agents 无法绕过 Runtime 直接执行 Tool。
- 同一幂等键不产生重复副作用。
- 有副作用的超时动作不自动重试。
- 至少两个独立来源类型能生成带来源和时间戳的 ResearchBundle。
- “完全访问”下的注入内容仍不能扩大 RunGrant、读取未授权文件或把本地内容编码进网络请求。
- 正式 Run 不依赖 `~/.agent-reach`、`npm -g` 或用户预装 CLI，也不存在上游组件运行时自更新。

## 9. Phase 7：MemoryCore 与本地召回

### 工作

- 按 Phase 0 决策集成固定版本 MemoryCore Standalone，或实现满足同一 Adapter 契约的最小本地记忆子系统。
- 采用 MemoryCore 时关闭 Hub、Proxy、Skill、Wiki 和 CodeGraph。
- 实现客户端 ID 到 Memory Scope 的单向映射。
- 实现对话级和任务级异步沉淀。
- 实现本地 Embedding 下载、校验、预热、索引和迁移。
- 实现 BM25、向量、分类过滤、重排和 Token 预算。
- 实现记忆查看、修正、停用、冲突和永久删除。
- 实现记忆数据库与向量索引加密。

### 门禁

- 记忆数据库、向量索引和 Embedding 计算不离开本机；云端记忆提取只向用户明确授权的 Provider 发送脱敏后的最小输入，不新增未授权数据出口。
- 员工只能收到允许范围内的最小记忆。
- 测试数据不进入正式记忆。
- 冲突不会静默覆盖。
- 永久删除后，在应用管理的数据库、WAL/freelist、向量索引、缓存、队列和日志范围内不能恢复原文或派生语义；用户自行创建的外部备份需在界面明确排除。
- 正常启动和召回不反复要求 macOS 密码。

## 10. Phase 8：主验收场景

### 场景

用户创建并发布“网络调研员”和“调研分析师”，通过总管发起多数据源调研任务。

### 验收

- 总管创建可确认的任务草稿。
- 网络调研员通过内置“多源网络调研”Skill 和受管 Tool/MCP 访问多个独立来源类型。
- ResearchBundle 保存查询、来源、时间、Claim、冲突、失败和 Hash。
- 调研分析师只能基于 Handoff 内容生成报告。
- 关键结论有可追踪来源，信息缺口被明确说明。
- 恶意网页中的提示注入不能改变任务目标、扩大授权或通过查询参数外泄本地数据。
- 总管审核不通过时能退回正确员工。
- 最终生成 Markdown 报告和 JSON 来源清单。
- 同名导出自动使用 `_1`、`_2`，且不覆盖原文件。
- 对话和任务经验按分类写入本地记忆并可被后续任务召回。

## 11. Phase 9：打包与发布候选

### 工作

- 打包 AI Employee OS 客户端、运行时、Provider、本地记忆及全部受管 Tool/MCP Sidecar。
- 实现首次初始化、Embedding 自动下载和进度恢复。
- 完成签名、公证、升级、Migration 和回滚验证。
- 验证关闭窗口继续运行、显式退出安全暂停和崩溃恢复。
- 生成许可证、第三方依赖和隐私说明。
- 验证磁盘配额、保留期、缓存清理和本地崩溃诊断策略。

### 门禁

- 新 Mac 不安装 Docker、Python、Node 或数据库也能完成首次运行。
- 所有受支持来源后端使用应用内固定运行时和私有数据目录，不写入 `npm -g`、`~/.agent-reach` 或其他用户级全局依赖目录。
- 升级失败不会损坏产品数据库、Memory 数据或索引。
- 无网络时可以查看和治理本地数据。
- 卸载、备份、导出和永久删除行为有明确说明。

## 12. 暂不排期

- 并行 Agent
- 更多模型 Provider
- 知识库、Wiki、CodeGraph
- 自动生成 Skill
- Marketplace
- Cloud Sync
- 多用户和企业权限
- Computer Use
- 员工直接聊天

任何新增项必须先修改产品规格并重新评估安全、预算和验收闭环。
