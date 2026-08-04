# AI Employee OS 协作指南

## 项目目标

本项目实现一个 Local-first 的 macOS AI 员工操作系统。MVP 只验证单个 AI 产品经理 Alex 完成 `接收任务 -> 规划 -> 调用工具 -> 产出 PRD -> 保存经验` 的可靠闭环。

## 事实源优先级

发生冲突时按以下顺序裁决：

1. `docs/AI Employee OS Unified Data Model v1.0.md`：持久化模型唯一事实源。
2. `contracts/`：Tool、Skill 和跨进程数据的机器可读契约。
3. `docs/AI Employee OS MVP API & Interface Specification v1.0.md`：进程接口语义。
4. Runtime、Security、Memory、Skill、Tool 专题文档：领域行为。
5. Blueprint、Code Skeleton：实现参考，不覆盖上述契约。

若实现需要改变冻结契约，先更新 ADR、canonical 文档和测试，再修改代码。禁止在专题模块中建立第二套状态或 Schema。

## MVP 边界

包含：Swift macOS Client、薄 Rust Runtime、Python Agent Worker、SQLite、Agent/Skill/Tool Package、Memory、Knowledge、Permission、Approval、Audit 和基础 Trace。

暂不包含：Computer Use、Multi-Agent、Cloud Sync、Marketplace、企业 RBAC、实时网页抓取。

## 架构边界

- Swift 负责交互，不参与 Agent 推理，也不直接执行 Tool。
- Rust 负责 Task/Action 状态、权限、审批、Tool Gateway、持久化和事件。
- Python 负责 Context、规划和推理，不直接取得系统权限。
- 所有 Tool 调用必须经过 Rust ToolExecutor。
- Secret 不进入仓库、SQLite、日志、Trace、Memory 或 Agent Context。

## 状态与安全不变量

- Task 状态仅为 `pending | running | succeeded | failed | cancelled`。
- Action 状态仅为 `pending | running | succeeded | failed | blocked | result_unknown | cancelled`。
- Task 不使用 `blocked`；审批阻塞由 Action 表达。
- `result_unknown` 禁止自动重放，只能经人工核验收敛为 `succeeded` 或 `failed`。
- 同一 `idempotency_key` 不得重复产生副作用。
- 未知 `schema_version`、未知枚举或未知权限默认拒绝。
- Audit Log 追加写，禁止更新或删除既有事件。

## 实现规则

- 先理解直接调用方和测试，再修改；只解决根因，不用静默降级掩盖错误。
- 优先复用现有类型和契约，保持最小实现，不提前建设 Phase 2 能力。
- Migration 只追加，不修改已发布文件；数据库变更必须覆盖 fresh install、重复启动、外键和完整性检查。
- 外部副作用必须有幂等键、明确超时和可验证结果。
- 用户可见内容使用简体中文；代码标识符、协议字段和错误码使用英文。

## 验证门禁

提交前至少运行：

```bash
./scripts/check.sh
```

该命令必须覆盖：格式检查、Rust 测试、Python 测试、Migration 重放和契约正反例。无法运行的检查必须在交付中明确说明，不得声称通过。

## Git 规则

- 主分支为 `main`，提交保持单一目的。
- 不使用 `git add .`；只暂存本任务明确涉及的路径。
- 不提交 Secret、数据库运行文件、构建产物或本地环境配置。
- 未经明确授权，不发布 Release，不删除分支或远端数据。
