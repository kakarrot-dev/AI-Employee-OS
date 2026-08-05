# AI Employee OS

AI Employee OS 是一个 Local-first 的 macOS AI 员工运行平台。默认员工为 Alex（AI 产品经理）；客户端支持多员工 Profile 编辑，工作执行主路径仍以 Alex + `prd-generation` 验证。

## 当前状态

- 在 macOS Keychain 配置 DeepSeek API Key 后，可与员工进行真实多轮对话；Conversation、Message 与脱敏 ModelCall 由 Rust Runtime 持久化。
- 可编辑 Identity / Soul / Persona；Effective Prompt 由 Runtime 单向编译。
- 仓库内置 Skill：`prd-generation`、`requirement-analysis`；Tool：`file-tool`、`document-tool`。Runtime bootstrap 安装后，技能库与工具库可浏览；Skill 可绑定到员工，Tool 为全局安装。客户端不创建 Package。
- 对话路径做意图识别：闲聊走 chat worker；工作意图在 `tasks_enabled` 时走 `run-task` / Graph / ToolExecutor（副作用只经 Rust）。
- 导航：办公室、通讯录、工作库、技能库、工具库、设置。

## 架构

```text
Swift macOS Client
  交互 / Store / Keychain
        |
        v
Thin Rust Runtime
  Task / Action / Permission / Tool Gateway / SQLite / Event
        |
        v
Python Agent Worker
  Intent / Chat / Context / Planning / LLM Provider
```

Rust 是系统能力边界，Python 不直接执行本地工具，Swift 不参与推理。

## MVP 范围

**产品主路径**

- 默认员工 Alex；多员工 Profile 编辑
- DeepSeek 多轮对话与意图路由
- Agent / Skill / Tool Package（仓库安装）
- Task Inspector（能力接通时）

**Runtime 能力（产品面逐步暴露）**

- Task / Action 状态机
- File、Document、Knowledge Tool
- Permission、Approval、Audit
- 基础 Trace、Evaluation、Memory

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
scripts/                    本地验证入口（check.sh 等）
script/                     打包与分发（build_and_run.sh 等）
```

## 开始开发

验证门禁（Rust、Python、契约、Runtime 端到端、Swift 模型检查）：

```bash
./scripts/check.sh
```

单独运行 Runtime 测试：

```bash
cargo test --manifest-path runtime/rust-core/Cargo.toml
```

构建并启动 macOS App（需本地 codesign 身份）：

```bash
./script/build_and_run.sh
```

UI Demo（无需真实 Runtime 数据）：

```bash
./script/build_and_run.sh --ui-demo
```

## 运行对话

1. 通过设置页把 DeepSeek API Key 保存到 macOS Keychain。
2. 在「工作库」选择员工（默认 Alex）对话。
3. DeepSeek Chat Completions 无状态；Runtime 从 SQLite 重建当前 Conversation 有序消息并随每轮请求提交。

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
