# Phase 0：Deep Agents 编排与恢复审计

日期：2026-08-31

结论状态：已完成

审计对象：`deepagents==0.7.11`，源码快照 `4bc11004ba86999c2f6d59b1d958b53195619bcc`

## 1. 决策

**有条件采用 Deep Agents 作为可替换的 Agent Harness；不把它当作 Runtime、权限内核或副作用执行边界，也不直接使用默认 `create_deep_agent` 配置。**

- **Go：** 固定版本的同步 Sub-agent 委派、LangGraph Streaming、持久 Checkpoint、Interrupt 和静态节点断点满足 MVP 串行编排所需的基础机制。
- **No-Go：** 默认 General-purpose Sub-agent、默认 Filesystem/Execute Tool Surface、并行委派提示、`recursion_limit=9999`、远程 Async Sub-agent 和 Deep Agents 自带权限规则均不能直接成为产品行为。
- **安全边界：** Worker 只能获得无副作用的 Proposal Tool；真实 Tool、Credential、网络、文件和 Shell 能力留在 Local Control Runtime 与受管 Runner 中。

## 2. 固定基线

| 组件 | 已验证版本 | 来源 |
| --- | --- | --- |
| Deep Agents | `0.7.11` | [官方 Release](https://github.com/langchain-ai/deepagents/releases/tag/deepagents%3D%3D0.7.11) / [固定源码](https://github.com/langchain-ai/deepagents/tree/4bc11004ba86999c2f6d59b1d958b53195619bcc) |
| 许可证 | MIT | [官方 LICENSE](https://github.com/langchain-ai/deepagents/blob/4bc11004ba86999c2f6d59b1d958b53195619bcc/libs/deepagents/LICENSE) |
| Python | `>=3.11,<4.0` | 固定快照的 `libs/deepagents/pyproject.toml` |
| LangChain | `1.3.18` | 上游 `uv.lock` |
| LangChain Core | `1.6.1` | 上游 `uv.lock` |
| LangGraph | `1.2.11` | 上游 `uv.lock` |
| LangGraph Checkpoint | `4.1.1` | 上游 `uv.lock` |
| SQLite Checkpointer | `3.1.1` | Spike 单独固定；不在 Deep Agents 上游默认依赖中 |

本仓库的可执行验证位于 [`spikes/deep-agents`](../../../spikes/deep-agents/README.md)。

## 3. 源码事实

### 3.1 Deep Agents 是 Harness，不是 Runtime

`create_deep_agent()` 组装 Middleware，最终调用 LangChain `create_agent()`；图执行、Streaming、Checkpoint 和 Interrupt 由 LangGraph 提供。Deep Agents 自身不提供跨产品数据库的事务、Run 状态机、预算、权限或副作用恢复协议。

官方架构同样明确三层关系：Deep Agents 是 Harness，LangChain 构造 Agent Loop，LangGraph 提供 Runtime。参见 [Deep Agents 官方仓库](https://github.com/langchain-ai/deepagents)与 [LangGraph Interrupt 文档](https://docs.langchain.com/oss/python/langgraph/interrupts)。

### 3.2 同步 Sub-agent 是 `task` Tool

- Root 通过 `task(description, subagent_type)` 调用临时 Sub-agent。
- Sub-agent 每次调用使用新的消息上下文，只接收任务描述及允许传播的状态；Root 默认只收到 Sub-agent 最后一个非空 AIMessage 或结构化结果。
- 声明式 Sub-agent 默认继承 Root 的 `interrupt_on`，但显式配置会覆盖；`CompiledSubAgent` 和远程 Async Sub-agent 不自动继承。
- Parent Config、Runtime Context 和 Streaming Namespace 会传播到同步 Sub-agent。
- 官方实现允许同一轮生成多个 `task` Tool Call 并行执行，且默认 Tool 描述主动鼓励并行。MVP 的串行约束必须由产品 Runtime 确定性拒绝，而不是只靠 Prompt。

参见 [Sub-agent 官方文档](https://docs.langchain.com/oss/python/deepagents/subagents)与固定快照的 `middleware/subagents.py`。

### 3.3 默认 Harness 超出产品权限边界

固定快照中：

- 未显式关闭时会自动添加 `general-purpose` Sub-agent，违反“只能使用已发布员工、不能动态匿名 Agent”的产品约束。
- `create_deep_agent` 默认组装 Filesystem Middleware 和 `task`；构造出的 Tool Node 包含 `ls`、`read_file`、`write_file`、`edit_file`、`delete`、`glob`、`grep`、`execute` 与 `task`。
- `tools=` 是增量配置，不会移除内置 Tool；Filesystem Middleware 的 Allowlist 至少要求保留 `read_file`。
- Filesystem Permission 在 Middleware Tool 层执行，直接调用 Backend 不受其约束；带 Execute 能力的 Sandbox Backend 目前还不支持该 Permission 机制。
- 工厂将递归上限设为 `9999`，不能替代产品的工作步数、Token、金额和超时预算。
- 官方 README 明确采用 “trust the LLM” 模型，要求边界在 Tool/Sandbox 层实现。这与本产品“Runtime 是唯一权限内核”的方向一致，但意味着默认 Harness 不能直接接触真实副作用。

因此 Phase 5 必须建立 `DeepAgentsAdapter`，启动时校验最终 Tool Surface、Sub-agent 名单和预算，发现默认或未知能力即拒绝启动。

## 4. 可执行 Spike 结果

Spike 使用确定性 Fake Model，不调用真实 Provider。审批暂停与恢复分别在两个独立 Python 进程执行，Checkpoint 使用 SQLite。

| 场景 | 观测结果 | 判定 |
| --- | --- | --- |
| Root 委派临时员工 | Root 产生 `task`，员工只返回 `employee produced handoff`，Root 继续审核 | 通过 |
| Tool 审批前暂停 | `interrupt_count=1`、`next=["tools"]`、`effect_count=0` | 通过：副作用尚未发生 |
| 跨进程批准恢复 | 重建 Agent 与 Checkpointer 后 `effect_count=1`、Interrupt 清空、Run 完成 | 通过 |
| 拒绝 | 恢复后 `effect_count=0`、Interrupt 清空 | 通过 |
| 员工节点完成后安全停止 | `task` Handoff 已写入 Checkpoint，`next=["model"]` | 通过 |
| 跨进程恢复安全停止 | 使用同一 `thread_id` 和 SQLite Checkpoint 后 Root 完成审核 | 通过 |
| Streaming | 观测到 Root 与 `tools:<task-id>` 子图 Namespace，以及 Model、Tool、Interrupt Update | 通过；客户端仍须消费 Runtime 投影 |
| 硬杀进程 | 外部 Effect 已发生但节点未完成；恢复重放节点后 `effect_count` 从 1 变为 2 | 反例成立：硬取消不可安全恢复 |

另外运行了上游四个无网络单元测试，覆盖最终消息 Handoff、并行 Sub-agent、`interrupt_on` 继承和子图 Streaming，结果 `4 passed`。

## 5. 对产品状态语义的修正

### 5.1 Interrupt 不等于所有暂停

Tool 审批使用动态 Interrupt，`state.interrupts` 有值。节点完成后的静态 `interrupt_after=["tools"]` 则表现为 `state.next=["model"]`，`state.interrupts` 可以为空。

因此客户端不能用 Deep Agents 的 `interrupts` 数量推导 Run 状态。只有 Runtime 知道暂停原因、目标节点、ToolAction 是否收敛，并将其投影为产品 `Run.paused`。

### 5.2 安全停止点

允许恢复的安全停止必须同时满足：

1. 当前 Graph Node 已完成。
2. 对应 Checkpoint 已持久化并能以同一 `thread_id` 读取。
3. 当前 Assignment Handoff 已固化。
4. 不存在运行中的 ToolAction；不确定副作用已经收敛为 `result_unknown`。
5. Runtime 已记录 Deep Agents Checkpoint 与不可变 Run、Assignment、EmployeeVersion 和 Model Snapshot 的映射。

静态断点证明 LangGraph 能在节点边界停下，但没有证明 Checkpoint Store 与产品数据库可以原子提交。Phase 2 仍需设计 Outbox、提交顺序和补偿扫描。

### 5.3 硬取消

硬取消只能终止 Worker 进程并把 Run 标记为故障终态或待人工核验：

- 不承诺从被杀节点继续。
- 不自动重放有副作用 Tool。
- 若 Effect 可能已经发生而结果未提交，ToolAction 必须进入 `result_unknown`。
- 只有从最后一个已确认安全 Checkpoint 创建新 Run，才允许继续工作。

## 6. `DeepAgentsAdapter` 强制约束

1. 每次 Run 只从冻结的 EmployeeVersion 创建明确命名的 Sub-agent；关闭并验证不存在默认 `general-purpose`。
2. MVP 同一时刻只允许一个 Assignment；检测到同轮多个 `task` Call、动态 Sub-agent 或 Async Sub-agent 时直接拒绝。
3. 不向 Worker 注册真实 Tool、MCP、Shell、网络或宿主文件系统 Backend；模型只能调用无副作用 Proposal Tool。
4. 若使用 Deep Agents 的 StateBackend 文件能力，只作为 Checkpoint 内部临时上下文，并从正式 Tool、Artifact 和 Evidence 契约中明确区分；不得映射宿主目录。
5. 最终 Tool Surface 使用 Allowlist 比对，出现 `execute`、未知 Tool 或未冻结 Sub-agent 时启动失败。
6. 显式覆盖默认 `recursion_limit`，同时由 Runtime 执行工作步数、Token、金额、超时和取消预算。
7. 使用持久 Checkpointer；`thread_id` 由 Runtime 生成并绑定 Run/Assignment，禁止复用到新 Revision。
8. Streaming 只进入受版本化 Schema 约束的 Runtime Event Adapter；不把原始 System Prompt、隐藏推理、Secret 或未脱敏 Tool 参数发送给客户端。
9. Tool 审批的权威记录是 Runtime 的 ToolAction 与 Approval；Deep Agents Interrupt 只是暂停机制。
10. 启动时记录 Deep Agents、LangChain、LangGraph、Checkpointer 和 Adapter 版本；升级必须重跑本 Spike。

## 7. 未关闭风险

- Checkpoint Store 与产品数据库的跨库提交、Outbox、补偿和清理策略尚未 Spike。
- 本轮未调用真实 Poe/DeepSeek 模型；Tool Calling、结构化输出、流式 Token、取消和错误兼容性进入 Provider 审计。
- `PatchToolCallsMiddleware` 的取消后消息修复有源码和上游测试依据，但尚未在“真实 Provider + Worker 硬终止”场景验证；硬终止仍按不可恢复处理。
- Harness Profile API 标记为 Beta。禁用默认 General-purpose 和缩减 Tool Surface 不能只依赖易变的全局注册行为，Adapter 必须有最终运行时断言。
- SQLite Checkpointer 是本地 Spike 选择，不自动满足加密、Migration、并发、WAL、磁盘配额和长期保留要求。

## 8. 门禁结果

| Phase 0 Deep Agents 门禁 | 结果 |
| --- | --- |
| 固定官方版本与许可证 | 通过 |
| Root 委派临时员工并收到 Handoff | 通过 |
| Tool 动态 Interrupt、批准和拒绝 | 通过 |
| 持久 Checkpoint 跨进程恢复 | 通过 |
| 员工节点完成后的安全停止与恢复 | 通过 |
| Root/Sub-agent Streaming 可观测 | 通过 |
| 硬取消不可恢复边界有真实记录 | 通过 |
| 可直接作为产品权限内核 | 不通过，且不作为采用目标 |

**最终判定：Deep Agents 子审计完成；允许按受限 Adapter 方案进入后续 Phase，禁止直接使用默认 Harness 执行真实副作用。**
