# Task Proposal 恢复与参与员工可见性设计

> 状态：待用户审阅
> 日期：2026-08-14
> 适用范围：办公室统一任务入口、工作库 Task Thread、Task Proposal 恢复
> 上位事实源：`AI Employee OS Unified Task Entry & Orchestration Specification v1.0.md`

## 1. 问题

工作库只从已物化的 `task_thread_task_bindings` 投影正式参与员工。Task Thread 已创建，但 Proposal 生成失败或 App 在确认前重启时，客户端只恢复 Thread，不恢复 Proposal、错误和可继续操作。用户看到的结果是：任务停在 `drafting`，标题显示「0 位员工」，右侧「参与员工」为空，也没有重新匹配入口。

当前实现与上位规范的两项要求不一致：App 重启后应从 Thread 与 Proposal 恢复；工作库应让用户看到当前 Task 的负责人或参与员工。缺失员工列表是恢复链路中断后的表现，不是员工目录加载失败。

## 2. 目标

- `drafting`、`awaiting_input`、`awaiting_confirmation` 三种确认前状态都能跨重启继续。
- Proposal 生成失败后，在同一 Task Thread 显示经过裁剪的错误和「重新生成方案」。
- Proposal 生成成功后，在确认卡中显示 Runtime 已匹配的员工姓名、岗位和分工；确认后继续使用 canonical Task 绑定投影正式参与员工。
- 重试只能由用户触发。App 启动、恢复 Thread 或切换工作记录时不得自动产生模型调用和费用。
- 旧版本遗留的 `drafting` Thread 即使没有错误消息，也能显示通用恢复入口。

## 3. 非目标

- 不在工作库增加全量员工目录或手工多选器。
- 不改变「用户描述目标，模型提出方案，用户确认一次」的主路径。
- 不创建第二套参与员工、Task、Action 或 Proposal 持久化状态。
- 不恢复 Scenario Builder，不增加自由员工群聊、并行调度或递归委派。
- 不修改已发布 Migration。现有 `task_proposals`、`task_thread_messages.kind='error'` 和 `task_thread_task_bindings` 足以承载恢复事实。

## 4. 事实源与显示语义

Rust Runtime 与 SQLite 继续作为唯一事实源：

- 确认前的匹配结果来自当前 revision 的 `task_proposals`，不写入 `task_thread_task_bindings`。
- Proposal 失败原因以稳定、无敏感信息的错误码写入 `task_thread_messages.kind='error'`。
- 确认后的正式参与员工来自 `task_thread_task_bindings` 关联的 canonical Task。
- Swift 只持有当前选中 Thread 的展示状态，不把员工选择或失败状态另行持久化。

「候选员工」与「参与员工」必须区分。确认卡显示候选员工，文案为「方案匹配」；Task Room 标题和 Inspector 只把已物化绑定称为「参与员工」。确认前不得用候选匹配伪装成已经开始协作。

## 5. 状态与交互

| Thread 状态 | Runtime 事实 | 客户端显示 | 允许操作 |
| --- | --- | --- | --- |
| `drafting` | 没有当前 Proposal | 「尚未匹配员工」恢复卡 | 重新生成方案 |
| `drafting` | 最近一条系统错误存在 | 裁剪后的错误、原目标 | 重新生成方案 |
| `awaiting_input` | 当前 Proposal 含必填问题 | 方案匹配员工、一个必要问题 | 在 Composer 补充信息 |
| `awaiting_confirmation` | 当前 Proposal 已验证 | 匹配员工、分工、交付物和必要确认信息 | 返回修改、确认执行 |
| `materialized/running/...` | 已有 Task 绑定 | 标题和 Inspector 展示正式参与员工 | 使用现有执行、审批与恢复操作 |

任务创建后、Proposal 返回前显示「正在匹配员工…」。按钮和 Composer 在请求完成前禁用，避免同一客户端重复提交。

旧草稿没有持久化错误时，恢复卡显示「上次方案未完成，可以重新生成。」，不猜测网络、模型、配置或员工能力中的具体原因。

## 6. Runtime 恢复契约

### 6.1 读取当前 Proposal

新增只读命令 `task-proposal-current --thread-id`，返回当前 revision 中仍可使用的 `awaiting_input` 或 `validated` Proposal，响应沿用 `TaskProposalResponse`。它不调用模型、不写数据库，也不产生执行副作用。Runtime 根据当前 active employee 与 Skill readiness 重新解析 `resolved_assignments`；若匹配结果已经失效，返回 `task_proposal_stale`，要求重新生成。

若 Proposal 已过期，Runtime 返回稳定错误 `task_proposal_expired`，但不在只读命令中改变状态。客户端转入可恢复状态，不自动重试；后续显式重新生成时再完成旧 Proposal 的过期处理。

### 6.2 重新生成

新增显式命令 `task-proposal-regenerate --thread-id`：

1. 在事务中拒绝或过期当前未物化 Proposal。
2. 仅在确有旧 Proposal 时递增 Thread revision；无 Proposal 的遗留草稿沿用当前 revision。
3. 使用原目标和用户已提交的 clarification 生成新 Proposal。
4. Runtime 重新验证 active employee、Skill readiness、依赖、权限和验收条件。
5. 成功后原子保存 Proposal 和系统 `proposal` 消息；失败后保存系统 `error` 消息，并让 Thread 回到 `drafting`。

错误消息只保存稳定错误码。不得把 provider 原始响应、stderr、Prompt、API Key、Secret、完整 ToolResult 或本机路径写入数据库。

现有 `task-proposal-generate` 与新增 regenerate 命令复用同一内部生成流程。Thread 已验证后发生的 provider、Schema、员工能力或匹配错误，都必须通过该流程持久化；数据库尚未打开或 Thread 不存在等边界错误继续直接返回，不伪造 Thread 消息。

Proposal 生成请求构建上下文时，只读取用户 goal 与 clarification。历史 `proposal`、`error` 和 `confirmation` 消息不回传给模型。

## 7. macOS 客户端设计

`TaskStore` 为当前选中 Thread 维护一个明确的 Proposal 展示状态：`restoring`、`recoverable`、`generating`、`review`、`failed`。该状态替代「`activeProposal` 有值但确认标记为 false」等无法解释的组合；旧员工私聊工作确认逻辑不在本次范围内重构。

恢复或选择 Thread 时：

- `awaiting_input` 与 `awaiting_confirmation` 调用只读的 `task-proposal-current`。
- `drafting` 直接进入 `recoverable`，不调用模型。
- 已物化状态清空确认前展示状态，继续使用现有 Task Room 投影。

`TaskThreadWorkspaceView` 在主内容区展示恢复卡或确认卡。确认卡按 `resolved_assignments.node_id` 与 Proposal assignment 对齐，再用 `EmployeeStore` 的当前员工资料显示头像、姓名和岗位；找不到资料时保留 Runtime 返回的 `agent_id`，不得隐藏该分工。普通和窄窗口都能看到这张卡，不依赖右侧 Inspector 是否可见。

标题区在正式参与员工为空时显示「尚未匹配员工 · 草拟中」，不再显示容易被理解为员工目录为空的「0 位员工」。

## 8. 错误处理

客户端把稳定错误码映射为简体中文：

- provider 超时或连接失败：说明模型服务暂时不可用，可重试。
- employee catalog 为空或 readiness 不满足：说明当前没有具备所需能力的在职员工，并引导查看通讯录或技能库。
- Schema 或模型输出无效：说明方案格式未通过 Runtime 校验，可重试。
- Proposal 过期或 revision 冲突：说明员工或能力状态可能变化，需要重新生成并再次确认。
- 未知错误：显示「方案生成失败，可以重新生成。」，保留内部错误码用于可复制的诊断详情。

错误不会把 Thread 标为 `failed`。`failed` 保留给已物化 Task 的执行结果；确认前生成失败仍是可恢复的 `drafting`。

## 9. 验收标准

### Runtime

- Proposal 生成失败后，同一 Thread 追加一条安全的 `error` 消息，Thread 保持可恢复。
- `task-proposal-current` 能在 App 重启后恢复 `awaiting_input` 和 `awaiting_confirmation` Proposal，且不产生模型调用。
- `task-proposal-regenerate` 不创建新 Thread，不复制 goal，不覆盖用户 clarification；旧 Proposal 不能再确认。
- 过期、readiness 漂移和 revision 冲突都必须重新生成并重新确认。
- 错误消息不包含 Secret、原始 provider 正文或本机敏感路径。

### Swift 与 UI

- 遗留 `drafting` Thread 没有 Proposal 和错误消息时，显示通用恢复卡和可用的重试按钮。
- 生成中显示进度，重复提交被阻止。
- 方案成功后，确认卡显示每个匹配员工的姓名、岗位、分工和依赖顺序。
- App 在确认前重启，回到同一 Thread 后仍显示同一 Proposal 和候选员工，不额外调用模型。
- 确认后，标题和 Inspector 从 canonical Task 绑定显示正式参与员工。
- 普通、窄窗口和隐藏 Inspector 时，恢复入口与匹配员工仍可见。

### 验证

- 新增 Rust 正反例测试覆盖失败持久化、当前 Proposal 读取、过期、regenerate revision 和敏感信息裁剪。
- 新增 Swift 模型与 Store 测试覆盖恢复状态、错误状态和候选员工映射。
- 更新 UI 门禁，验证「尚未匹配员工」「重新生成方案」和方案员工列表。
- 运行 `./scripts/check.sh`。
- 打包启动 App，使用遗留草稿和新建多员工 Proposal 各验证一次；确认前重启 App，检查 Proposal 与员工列表连续且没有额外模型调用。

## 10. 改动边界

预计修改六个生产文件：Runtime CLI、`RuntimeService`、`TaskStore`、Task Thread 模型、Task Thread 视图和 `ContentView`，另补对应测试与门禁。这是修复跨进程恢复链路所需的最小边界，不能只改视图。若实现需要继续扩大到更多生产文件、修改已发布 Migration、引入第二套 Proposal 表或让 Swift 自行决定员工，应暂停并重新确认范围。
