# AI Employee OS 协作指南

## 项目目标

本项目实现一个 Local-first 的 macOS AI 员工操作系统。

当前 MVP 主验证路径：

1. 用户在 macOS Keychain 配置 DeepSeek API Key。
2. 在客户端编辑员工 Identity / Soul / Persona；Effective Prompt 由 Rust Runtime 单向编译。
3. 与员工完成可跨重启恢复的多轮对话（默认员工为 Alex / `ai-product-manager`）。
4. Skill / Tool 由仓库 Package 安装（客户端不创建）；Runtime bootstrap 安装内置 Package 后，技能库与工具库可浏览。
5. 对话经意图识别区分闲聊与工作：闲聊走 Python chat worker；工作意图在 `tasks_enabled` 时走 `run-task` / Graph / ToolExecutor。工作执行主路径仍以 Alex + `prd-generation` 为准。

客户端已支持多员工 Profile 的创建、编辑与停用；多员工工作执行与 per-employee `tasks_enabled` 尚未成为主验证路径。

## 事实源优先级

发生冲突时按以下顺序裁决：

1. `docs/AI Employee OS Unified Data Model v1.0.md`：持久化模型唯一事实源。
2. `contracts/`：Tool、Skill 和跨进程数据的机器可读契约。
3. `docs/AI Employee OS MVP API & Interface Specification v1.0.md`：进程接口语义。
4. Runtime、Security、Memory、Skill、Tool 专题文档：领域行为。
5. Blueprint、Code Skeleton：实现参考，不覆盖上述契约。

若实现需要改变冻结契约，先更新 ADR、canonical 文档和测试，再修改代码。禁止在专题模块中建立第二套状态或 Schema。

## MVP 边界

### 产品可见（当前主路径）

- Swift macOS Client：办公室、通讯录、工作库、技能库、工具库、设置
- DeepSeek 驱动的多轮对话与意图路由
- 员工 Profile：Identity / Soul / Persona
- 仓库内置 Agent / Skill / Tool Package 的安装、列表与 Skill 绑定
- Task Inspector（在 `tasks_enabled` 时展示执行步骤与交付）

### Runtime 已具备、产品面尚未完整暴露

- Task / Action 状态机、Permission、Approval、Audit、基础 Trace
- Memory、Knowledge、Evaluation 基础设施
- Graph Runtime 与 Golden Path 编排

### 暂不包含

Computer Use、Multi-Agent 协作、Cloud Sync、Marketplace、企业 RBAC、实时网页抓取。

## 架构边界

```text
Swift macOS Client          交互、本地 Store、Keychain；不推理、不直接执行 Tool
        |
        v
Thin Rust Runtime           Task/Action、权限、审批、Tool Gateway、SQLite、事件
        |
        v
Python Agent Worker         意图分类、闲聊、Context/规划推理；不直接取得系统权限
```

硬规则：

- 所有 Tool 调用必须经过 Rust ToolExecutor。
- Secret 不进入仓库、SQLite、日志、Trace、Memory 或 Agent Context；API Key 只经 Keychain 注入受控进程环境。
- Skill 通过 `agent_skills` 绑定到员工；Tool 为全局安装（无 per-agent Tool 绑定表），客户端不可创建 Package。
- `tasks_enabled` 表示工作执行能力已接通（当前实现以 Alex 已启用 Skill + 存在 active Tool 为条件）。

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
- 被纠正过的协作模式记入 `tasks/lessons.md`，避免重复踩坑。

## 验证门禁

提交前至少运行：

```bash
./scripts/check.sh
```

该命令覆盖：Rust 格式与测试（含 Migration 重放）、Runtime/Tool Gateway 构建、契约正反例、Keychain 边界、本地签名身份、员工 Runtime 端到端检查、Python 单测、Swift 客户端模型检查。无法运行的检查必须在交付中明确说明，不得声称通过。

打包并启动本地 App：

```bash
./script/build_and_run.sh
```

## Git 规则

- 主分支为 `main`，提交保持单一目的。
- 不使用 `git add .`；只暂存本任务明确涉及的路径。
- 不提交 Secret、数据库运行文件、构建产物或本地环境配置。
- 未经明确授权，不发布 Release，不删除分支或远端数据。
