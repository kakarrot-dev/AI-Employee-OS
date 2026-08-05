# AI Employee OS

AI Employee OS 是一个 Local-first 的 macOS AI 员工运行平台。当前产品只保留 Alex 一个 AI 员工，优先验证由 DeepSeek 驱动、SQLite 持久化并可跨重启恢复的真实多轮对话。

## 当前状态

Alex 当前不绑定任何 Skill 或 Tool，固定 PRD Golden Path 已移除。用户在 macOS Keychain 配置 DeepSeek API Key 后，可与 Alex 进行真实多轮对话；Conversation、Message 与脱敏 ModelCall 状态由 Rust Runtime 持久化。

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

## 运行对话

通过 App 设置页把 DeepSeek API Key 保存到 macOS Keychain，然后在“工作”页与 Alex 对话。DeepSeek Chat Completions 是无状态接口，Runtime 会从 SQLite 重建当前 Conversation 的有序消息并随每轮请求提交。

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
