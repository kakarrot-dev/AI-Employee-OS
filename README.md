# AI Employee OS

AI Employee OS 是一个 Local-first 的 macOS AI 员工运行平台。MVP 以 AI 产品经理 Alex 为首个角色，验证从任务输入、Agent 规划、受控工具执行到 PRD 交付和经验沉淀的完整闭环。

## 当前状态

项目已完成安全 Golden Path、Release 1 Decision Substrate 和 Release 2 Execution + Evidence；Release 3 的 SwiftUI Client、运行遥测和本地分发验证正在建设。Runtime 已能以 deterministic Provider 跑通版本锁定的 Skill DAG、Task/Action、版本化 Prompt、预算化 Context、带来源 Knowledge、Memory 读写、受限 Tool Loop、Rust ToolExecutor、PRD 产物、Evaluation 和终态持久化。

## 架构

```text
Swift macOS Client
        |
        v
Thin Rust Runtime
Task / Action / Permission / Tool / SQLite / Event
        |
        v
Python Agent Worker
Context / Planning / LLM Provider / Memory Extraction
```

Rust 是系统能力边界，Python 不直接执行本地工具，Swift 不参与推理。

## MVP 范围

- 单个 AI 产品经理 Alex
- Task 与 Action 状态机
- Agent、Skill、Tool Package
- File、Document、Knowledge Tool
- SQLite 与本地 Knowledge
- Permission、Approval 与 Audit
- 基础 Trace、Evaluation 和 Memory

Computer Use、Multi-Agent、Cloud Sync、Marketplace 和实时网页抓取不在 MVP 内。

## 仓库结构

```text
apps/macos/                 Swift 客户端
runtime/rust-core/          Rust Runtime
runtime/python-agent/       Python Agent Worker
contracts/                  机器可读 JSON Schema 与样例
packages/                   Agent、Skill、Tool Package
storage/migrations/         只追加的 SQLite Migration
docs/                       产品与技术设计
scripts/                    本地验证入口
```

## 开始开发

当前基线只要求 Rust、Python 3 和系统 SQLite：

```bash
./scripts/check.sh
```

单独运行 Runtime 测试：

```bash
cargo test --manifest-path runtime/rust-core/Cargo.toml
```

## 运行 Golden Path

该命令不访问网络，也不调用付费模型。`--approve-write` 表示用户明确批准本次 Markdown 写入；省略时 Runtime 默认拒绝执行。

```bash
cargo build --bins
mkdir -p /tmp/ai-employee-os/output
./target/debug/ai-employee-runtime run-golden \
  --repository-root "$PWD" \
  --database /tmp/ai-employee-os/runtime.sqlite3 \
  --output-dir /tmp/ai-employee-os/output \
  --input "为企业 AI 知识库设计一个 PRD" \
  --approve-write
```

成功时 stdout 返回结构化 JSON，其中包含 `task_id`、`artifact_path`、Decision Context、Memory Outcome、Evaluation、Worker Metrics 和有序事件。数据库中的 Task、Action 与 Tool Execution 均应收敛为 `succeeded`。

## 事实源

- 数据模型：[Unified Data Model](./docs/AI%20Employee%20OS%20Unified%20Data%20Model%20v1.0.md)
- 接口：[MVP API & Interface Specification](./docs/AI%20Employee%20OS%20MVP%20API%20&%20Interface%20Specification%20v1.0.md)
- 架构决策：[ADR](./docs/AI%20Employee%20OS%20技术决策记录%20ADR（Architecture%20Decision%20Records）v1.0.md)
- 协作与验收：[AGENTS.md](./AGENTS.md)
- Release 1：[Decision Substrate](./docs/releases/Release%201%20Decision%20Substrate.md)
- Release 2：[Execution and Evidence](./docs/releases/Release%202%20Execution%20and%20Evidence.md)
- Release 3：[Agent Experience and Production](./docs/releases/Release%203%20Agent%20Experience%20and%20Production.md)

## 安全

不要提交 API Key、Token、Cookie、私钥、真实用户数据或运行时数据库。所有 Tool 调用必须经 Rust Runtime 完成权限检查、审批判断、审计和幂等控制。
