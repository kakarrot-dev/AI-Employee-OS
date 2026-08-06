# AI Employee OS 协作指南

## 项目目标

本项目实现一个 Local-first 的 macOS AI 员工操作系统。

当前 MVP 主验证路径：

1. 用户在 macOS Keychain 配置 DeepSeek API Key。
2. 在客户端编辑员工 Identity / Soul / Persona；Effective Prompt 由 Rust Runtime 单向编译。
3. 与员工完成可跨重启恢复的多轮对话（新装默认种子为 Alex / `ai-product-manager`，用户可彻底删除且不会被自动恢复）。
4. Skill / Tool 由仓库 Package 安装（客户端不创建）；Runtime bootstrap 安装内置 Package 后，技能库与工具库可浏览。
5. 对话经意图识别区分闲聊与工作：闲聊走 Python chat worker；工作意图仅在存在 readiness=`ready` 的 Skill 时，由 Rust 锁定员工 Capability Set，Agent 在同一 Generic Run 中逐轮选择 Skill 与其声明的 Tool/Action。Golden Path 已移除。

可执行 Skill 必须是 Manifest `schema_version: 2.0.0`。默认员工 bootstrap 绑定 `local-file-operations` 与 `web-search`。当前主验证可执行路径为 `local-file-operations`（授权目录内读 / 创建 / 精确编辑 UTF-8 文件，经审批后由 `file-tool` 执行）。`web-search` 已合入并绑定；真实搜索依赖本机 `mcporter` + Exa，尚未作为无外部依赖的默认门禁。仓库中 `prd-generation` / `requirement-analysis` 等 Manifest 1.0 Skill 若仍存在，readiness 为 `incompatible`，不作为工作执行主路径。

客户端已支持多员工 Profile 的创建、编辑、停用，以及默认种子员工的彻底删除；任意新建员工的工作执行与 per-employee `tasks_enabled` 尚未成为主验证路径。

## 事实源优先级

发生冲突时按以下顺序裁决：

1. `docs/AI Employee OS Unified Data Model v1.0.md`：持久化模型唯一事实源。
2. `contracts/`：Tool、Skill 和跨进程数据的机器可读契约。
3. `docs/AI Employee OS MVP API & Interface Specification v1.0.md`：进程接口语义（CLI / 子进程；非 gRPC）。
4. Runtime、Security、Memory、Skill、Tool 专题文档：领域行为。
5. `docs/架构总览.md`、`docs/design-system/`、`docs/releases/`：总览、UI 与历史里程碑；不覆盖上述契约。

若实现需要改变冻结契约，先更新 ADR、canonical 文档和测试，再修改代码。禁止在专题模块中建立第二套状态或 Schema。

## MVP 边界

### 产品可见（当前主路径）

- Swift macOS Client：办公室、通讯录、工作库、技能库、工具库、设置
- DeepSeek 驱动的多轮对话与意图路由
- 员工 Profile：Identity / Soul / Persona；默认种子可彻底删除且不自动恢复
- 仓库内置 Agent / Skill / Tool Package 的安装、列表与 Skill 绑定
- 已合入内置 Tool：`file-tool`（读 / 创建 / 编辑授权本地文件）、`agent-reach-tool`（`search_web`）
- 已合入可执行 Skill：`local-file-operations`、`web-search`（Manifest 2.0）
- Task Inspector（在 `tasks_enabled` 时展示执行步骤与交付）

### 进行中（未成默认门禁 / 未成主验证路径）

- `web-search` 真实网络端到端（依赖本机 `mcporter` + Exa，CI/本地门禁目前以 Fake Decision 验证到审批闸）
- 任意新建员工的工作执行成为与默认路径同等的主验证

### Runtime 已具备、产品面尚未完整暴露

- Task / Action 状态机、Permission、Approval、Audit、基础 Trace
- Memory、Knowledge、Evaluation 基础设施
- Generic Run Snapshot、Checkpoint、Deliverable、基础恢复与 Evaluation

### 暂不包含

Computer Use、任意站点网页抓取、Multi-Agent 协作、Cloud Sync、Marketplace、企业 RBAC、公证发行与自动更新。

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
- `tasks_enabled` 仅为兼容派生字段；授权与路由使用当前员工每个 Skill 的 `ready | disabled | missing_dependency | incompatible | invalid_package`。
- Python Task Worker 只返回 `ask_user | tool_call | complete`；安全字段和所有 Tool 调用由 Rust 生成与执行。
- 聊天 Task 不在启动前锁死单一 Skill；每个 `tool_call` 必须声明锁定 Capability Set 内的 `skill_id`，Rust 校验 Skill → Tool → Action 授权链。显式 `run-skill` 仍为单 Skill 集合。
- 工作执行只走 Generic Run Kernel；禁止恢复 Golden Path。

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
