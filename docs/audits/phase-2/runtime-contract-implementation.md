# Phase 2：Local Control Runtime 与版本化契约实施

日期：2026-08-31

状态：完成

## 1. 事实源与进程边界

Local Control Runtime 作为独立 Electron Utility Process 运行，Client Main 只通过继承的私有 MessagePort 发送版本化命令。当前没有 TCP、回环 HTTP、公开 Unix Socket、Shell、模型、Tool 或长期 Secret 通道。Renderer 继续通过窄 Preload Bridge 读取 Runtime 状态，不能访问数据库。

Runtime 数据库使用 Node `node:sqlite`，位于应用私有 `runtime/control.sqlite3`。启动时执行只追加 Migration、`PRAGMA quick_check`、事件游标恢复，再向 Main 发送 `runtime.ready`。

## 2. 版本化契约

Schema v1 定义：

- Employee
- TaskDraft
- TaskRevision
- ChangeRequest
- Run
- Assignment
- Handoff
- ToolAction
- Approval
- Artifact
- Evidence
- Delivery
- RunGrant
- BudgetLedgerEntry

TaskRevision 冻结目标、验收标准、员工/能力/模型版本、预算、超时、授权模式和资源范围。RunGrant 的后续版本只能缩短期限、降低预算、缩小目录/Tool/模型/记忆范围或保持/收紧授权模式，不能扩权。

跨进程协议固定 `schemaVersion=1`，当前只允许 `health`、`recover` 与带上限的 `events.after`。未知版本、命令、枚举、额外 Payload、非法游标和非法 Limit 默认拒绝。

## 3. SQLite 与 Audit

数据库 Schema v2 包含：

- `schema_migrations`
- `entity_records`
- `audit_events`
- `runtime_projection`

实体保存与 Audit Event、事件游标更新在同一 `BEGIN IMMEDIATE` 事务内提交。数据库 Trigger 阻止 Audit Event 的 UPDATE/DELETE，也阻止不可变实体的 UPDATE/DELETE；应用接口还会在写入前拒绝覆盖不可变 Snapshot。

事件使用单调递增 `sequence`。客户端或 Sidecar 重连可从最后游标调用 `events.after`，Runtime 崩溃后用 Audit 最大序号重建投影游标。

## 4. 状态与治理

- Task：`pending → running → succeeded | failed | cancelled`
- Run：`created → running → pausing → paused → running`，并允许从运行边界进入终态
- ToolAction：`pending → running → succeeded | failed | result_unknown | cancelled`，以及审批前 `blocked`
- `result_unknown` 是不可自动重放的终态。
- UI 的草稿、待开始、运行中、需要处理和终态由 Runtime 的 `projectTaskState` 唯一计算。
- Run 工作区达到软限制时告警，达到硬限制时返回 `safe_pause`；活动和未解决终态 Run 永不按保留期清理，只有已交付且超过保留期的工作区可清理。

## 5. 验收证据

```bash
npm run typecheck
npm test
npm run build
```

结果：6 个测试文件、14 个测试通过；Main、Runtime Sidecar、Preload、Renderer Production Build 通过。

真实 Electron + Utility Process 冒烟验证：

| 场景 | 结果 |
| --- | --- |
| 首次启动 | Runtime connected；DB Schema v1 初测通过，加入强制 Trigger 后当前为 v2 |
| 私有进程通信 | Main 收到 `runtime.ready` 与 Health；Renderer 只看到投影状态 |
| 手动重连 | 通过；修复旧子进程 `exit` 误清理新进程的竞态后稳定恢复 |
| 强制终止 Utility Process | UI 投影为“Runtime 已停止，可重新连接” |
| 再次连接 | 通过；同一数据库重新 Migration/恢复并回到 connected |
| 数据库文件 | 只创建在隔离测试 `user-data-dir/runtime/control.sqlite3`；测试后已清理 |

## 6. Phase 2 门禁

| 门禁 | 结果 |
| --- | --- |
| 未知 Schema 和枚举默认拒绝 | 通过 |
| 状态机正反例 | 通过 |
| UI 状态来自 Runtime 投影 | 通过 |
| 新库与重复启动 Migration | 通过 |
| 崩溃后重建 Runtime 投影 | 通过 |
| Sidecar 生命周期、健康与重连 | 通过 |
| 追加写 Audit 与不可变 Snapshot | 通过（应用层 + SQLite Trigger） |
| 工作区配额与保留决策 | 通过 |

Phase 2 完成，可以进入 Phase 3 Provider、Credential 与总管对话。
