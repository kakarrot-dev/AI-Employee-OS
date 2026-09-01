# Phase 5：Deep Agents 正式任务闭环实施验收

版本：v0.1
日期：2026-08-31
状态：完成

## 1. 结论

正式任务已形成 `TaskDraft → TaskRevision → RunGrant → Run → Assignment → Handoff → Checkpoint → 总管审核 → Delivery` 的本地事实闭环。用户只能从总管对话明确同意生成任务草稿；任务页是 Runtime 的只读投影，不提供旁路创建入口。

首个真实任务使用已发布员工和 DeepSeek `deepseek-v4-pro` 完成模型执行、Deep Agents Worker 安全暂停、总管验收及不可变 Delivery。进程重启后，未完成阶段可从数据库与持久 Checkpointer 恢复，已完成 Delivery 不会重放。

## 2. 冻结契约与生命周期

本阶段新增并落实以下实体：

- `Task`：任务聚合根，指向当前 Revision、Run 和终态；
- `TaskDraft`：用户确认前可编辑的目标、验收标准和员工选择；
- `TaskRevision`：确认后冻结，不允许 Run 中静默改变目标或执行范围；
- `RunGrant`：冻结员工版本、精确模型和当前阶段许可；
- `Run`：承载运行、暂停、失败、取消和成功状态；
- `Assignment`：串行员工执行单元，记录 Provider Request、输出、Usage 关联和完成时间；
- `Handoff`：记录上下游结构化交接及内容 Hash；
- `Checkpoint`：依次记录创建、员工完成、Deep Agents 安全暂停、总管审核、Delivery 固化或安全暂停；
- `Delivery`：总管验收通过后生成的不可变交付；
- `ChangeRequest`：运行中需求变化的来源、差异、安全停止点及接受/拒绝决策。

员工执行前再次调用 Phase 4 的版本可用性门禁；未发布、停用、归档或依赖不可用的员工不能进入正式 Run。Phase 8 已将 Manager 拒绝升级为有界返工：继续使用原不可变 EmployeeVersion，退回上游时级联重跑原下游，最多两个返工 Assignment；仍未通过或超限才让 Task/Run 失败且不生成 Delivery。

## 3. Deep Agents 生产 Worker

本地锁定并安装的基线为：

| 依赖 | 版本 |
| --- | --- |
| `deepagents` | `0.7.11` |
| `langchain` | `1.3.18` |
| `langgraph` | `1.2.11` |

正式 Worker 位于 `spikes/deep-agents/formal_worker.py`，使用 `SqliteSaver` 持久化 Checkpoint，并由 Runtime 以固定 Python、脚本和 Checkpoint 路径启动。业务载荷只经标准输入传递，不进入命令行参数或环境变量。

Worker 通过产品自有 Harness Profile 关闭默认 General-purpose Sub-agent。真实探针结果：Root Tool 只有 `task`，Employee Tool 为空；`write_file`、`read_file`、`edit_file`、`delete_file`、`ls`、`glob`、`grep` 和 `execute` 均未暴露。员工节点结束时 `next=["model"]`、`interruptCount=0`，随后由 Runtime 验证 Handoff 并提交 `deep_agents_safe_pause` Checkpoint。

本地 Worker 还通过 Python Socket 边界拒绝网络，并使用最小化环境启动；Provider Credential 不进入 Worker 参数、环境、输入、输出、错误或 Checkpoint。该限制是本地开发边界，发布级签名 Helper、XPC、App Sandbox 与系统网络 Entitlement 仍按用户要求延期到 Phase 9。

## 4. 执行、暂停与恢复

- Assignment 串行执行，当前员工完成并落库后才创建 Handoff；
- Runtime 验证 Deep Agents 持久 Checkpoint 后，才允许总管审核；
- 总管结构化验收全部通过后，Delivery 与成功终态在 Runtime 中固化；
- Provider 请求、Worker 验证或总管验收失败都会收敛为明确失败终态；
- 重启时先识别缺少 Worker 验证的 Handoff，再恢复 Manager 阶段；已有 Delivery 的任务永不重放；
- 本阶段没有外部 ToolAction 或副作用；Delivery 固化是 Runtime 内部数据库行为。

ChangeRequest 不承诺任意时刻即时暂停。请求到达后 Run 先进入 `pausing`；只有当前员工输出、Handoff、Checkpoint 已提交且没有未收敛 ToolAction 时，才进入 `paused`。接受变化会为同一 Task 新建 TaskRevision 和 Run，并取消被替代 Run；拒绝则恢复原 Run。

## 5. 客户端边界

工作台只在用户明确执行“同意转为任务草稿”后调用 Runtime。任务面板展示目标、验收标准、冻结员工、Assignment、时间线、ChangeRequest 和 Delivery；正式启动仍需用户点击“确认并开始”。

任务模块按状态和时间倒序展示 Runtime 投影，没有“新建任务”按钮。Preload 只暴露 `list`、`createDraft`、`updateDraft`、`start`、`requestChange`、`acceptChange`、`rejectChange` 和 `onEvent` 八个 Task 方法。

## 6. 真实验证与问题闭环

真实 Sandbox 首两次调用收到 `response.incomplete`。根因是生产 DeepSeek Adapter 未携带 Phase 0 已验证请求中的 `reasoning: { effort: "none" }`，并非用量或员工契约问题。修正后，真实员工测试在约 1.3 秒完成，`automaticPassed=true`，Usage 来源为 `provider_actual`，员工保持可工作状态。

随后真实正式任务在约 4.0 秒完成：Task/Run/Assignment 均为成功，员工输出包含验收标记，Manager 的所有验收项通过并生成 Delivery。数据库回读得到 1 个 Task、1 个 TaskRevision、1 个 Run、1 个 RunGrant、1 个 Assignment、1 个 Handoff、5 个 Checkpoint、1 个 Delivery 和 1 个 BudgetLedgerEntry；`PRAGMA quick_check=ok`。Deep Agents SQLite Checkpoint 文件为 32768 字节。

最新 Electron/CDP 验证：Runtime 已连接；Task Bridge 只有八个显式方法；任务页存在 Runtime 状态投影且没有旁路“新建任务”；Renderer 中 Node `process` 与 `require` 均不可见。

自动化覆盖完整成功闭环、员工状态限制、总管拒绝、崩溃恢复，以及 ChangeRequest 安全暂停与新 Revision：

```bash
npm test
npm run build
git diff --check
```

结果：9 个测试文件、33 个测试通过；TypeScript、主进程/Preload/Renderer 生产构建及 Diff 空白检查通过。

## 7. 门禁判定

| 门禁 | 判定 |
| --- | --- |
| 总管不能使用未发布员工或匿名 Agent | 通过：启动前共用 `assertVersionUsable`，Assignment 必须引用冻结 EmployeeVersion |
| Run 中不能扩大员工、模型、Tool 或目录范围 | 通过：TaskRevision 与 RunGrant 冻结；Phase 5 Worker 没有外部 Tool 或文件能力 |
| 需求变化产生新 TaskRevision 和 Run | 通过：接受 ChangeRequest 后新建 Revision/Run，旧 Run 取消 |
| 崩溃恢复不会重复已确认副作用 | 通过：本阶段无外部副作用；已有 Delivery 不重放，未验证 Handoff 先补 Worker Checkpoint |
| 暂停只在安全节点成立 | 通过：员工完成、Handoff 与 Checkpoint 已提交且无未收敛 ToolAction 后才进入 `paused` |

Phase 5 完成，可以进入 Phase 6 Tool Gateway、MCP 与受管网络调研。
