<p align="center">
  <img src="docs/design-system/assets/app-icon/ai-employee-os-app-icon-master.png" width="160" alt="AI Employee OS 应用图标">
</p>

<h1 align="center">AI Employee OS</h1>

<p align="center">
  一个 Local-first 的 macOS AI 员工运行系统，让 AI 员工可以对话、执行受控工作并交付可审计成果。
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/kakarrot-dev/AI-Employee-OS/actions/workflows/ci.yml"><img src="https://github.com/kakarrot-dev/AI-Employee-OS/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/macOS-14%2B-29271d" alt="macOS 14 或更高版本">
  <img src="https://img.shields.io/badge/Swift-5.10-b7791f" alt="Swift 5.10">
  <img src="https://img.shields.io/badge/Rust-stable-2c6f75" alt="Rust stable">
</p>

> [!IMPORTANT]
> AI Employee OS 正在持续开发。当前仓库提供可运行、可验证的本地 MVP，面向开发和评估，不是已经公证的普通用户发行版。

## 项目介绍

AI Employee OS 将 AI 助手变成受治理的本地工作者。macOS 客户端负责交互与 Keychain 访问，Rust 运行时负责状态和权限，Python Worker 负责意图、上下文、规划和模型调用。

默认员工是 AI 产品经理 Alex。客户端可以创建和编辑多个员工 Profile，当前已经验证的工作执行主路径仍是 Alex 与内置 `prd-generation` Skill。

## 当前能力

- 原生 SwiftUI 工作空间，包括办公室、通讯录、工作库、技能库、工具库和设置。
- 基于 SQLite 持久化的多轮对话，可跨重启恢复。
- 编辑员工的 Identity、Soul 和 Persona，由 Rust 运行时编译 Effective Prompt。
- 识别对话意图，在闲聊和受治理的工作执行之间路由。
- 从仓库安装 Agent、Skill 和 Tool Package。
- Task 与 Action 状态机，包括审批、取消、审计、事件和恢复。
- 所有 Tool 调用通过 Rust `ToolExecutor` 执行，具备幂等和结果验证机制。
- 将 Swift 客户端、Rust 运行时、Python Worker 和内置 Package 打包到本地 macOS App Bundle。
- 使用 Claude Cream 设计 Token，支持浅色和深色外观。

## 系统架构

```text
Swift macOS Client
  UI、本地 Store、Keychain
        |
        v
Thin Rust Runtime
  Task、Action、Permission、Approval、Tool Gateway、SQLite、Event
        |
        v
Python Agent Worker
  Intent、Chat、Context、Planning、LLM Provider
```

系统通过明确边界控制权限：

- Swift 不参与推理，也不直接执行 Tool。
- Python 不直接取得系统权限。
- 所有 Tool 调用都必须经过 Rust `ToolExecutor`。
- Secret 只保存在 macOS Keychain 和受控进程环境中，不得进入 SQLite、日志、Trace、Memory 或 Agent Context。

机器可读契约以 [Unified Data Model](docs/AI%20Employee%20OS%20Unified%20Data%20Model%20v1.0.md) 和 [MVP API & Interface Specification](docs/AI%20Employee%20OS%20MVP%20API%20&%20Interface%20Specification%20v1.0.md) 为准。

## 环境要求

- macOS 14 或更高版本
- Swift 5.10 工具链
- Rust stable 工具链及 `rustfmt`
- Python 3.13
- 用于真实模型对话的 DeepSeek API Key
- 用于构建 App Bundle 的本地代码签名身份

## 快速开始

克隆仓库：

```bash
git clone https://github.com/kakarrot-dev/AI-Employee-OS.git
cd AI-Employee-OS
```

首次运行时创建本地开发签名身份：

```bash
./scripts/setup_local_signing_identity.sh
```

运行完整验证门禁：

```bash
./scripts/check.sh
```

构建并启动 macOS App：

```bash
./script/build_and_run.sh
```

打包后的应用位于 `dist/AIEmployee.app`。运行数据保存在 `~/Library/Application Support/AIEmployee/`，不会写入只读 App Bundle。

## 配置模型

1. 打开客户端设置。
2. 将 DeepSeek API Key 保存到 macOS Keychain。
3. 进入工作库并选择员工，默认员工为 Alex。
4. 开始对话或提交工作请求。

DeepSeek Chat Completions 本身无状态。每次请求模型前，Runtime 都会从 SQLite 重建当前 Conversation 的有序消息。

## 开发命令

```bash
# 完整检查：Rust、Python、契约、Runtime 和 Swift 模型
./scripts/check.sh

# Rust Runtime 测试
cargo test --manifest-path runtime/rust-core/Cargo.toml

# 构建 Swift 客户端
swift build --package-path apps/macos/AIEmployee

# 构建、启动并验证签名后的 App Bundle
./script/build_and_run.sh --verify

# 使用确定性演示数据启动 UI
./script/build_and_run.sh --ui-demo office
```

CI 会在每个 Pull Request 和每次推送到 `main` 时，通过 `macos-latest` 运行 `./scripts/check.sh`。

## 仓库结构

```text
apps/macos/AIEmployee/     SwiftUI macOS 客户端
runtime/rust-core/         Rust Runtime 与安全边界
runtime/python-agent/      Python Agent Worker
contracts/                 机器可读 JSON Schema 契约
packages/                  内置 Agent、Skill 和 Tool Package
storage/migrations/        只追加的 SQLite Migration
docs/                      产品、架构、安全和 UI 文档
scripts/                   验证与本地环境初始化
script/                    App 打包与分发检查
```

## MVP 边界

当前 MVP 包括真实多轮对话、员工 Profile 编辑、仓库 Package 安装、受治理的工作执行和 Task Inspector。

以下能力暂不属于当前 MVP：

- Computer Use
- Multi-Agent 协作
- Cloud Sync
- Marketplace 分发
- 企业 RBAC
- 实时网页抓取
- 公证发行、自动更新和 DMG 打包

Runtime 已经包含 Memory、Knowledge、Evaluation、权限、审批和 Trace 基础设施，但并非所有能力都已完整暴露到产品界面。

## 项目文档

- [架构总览](docs/架构设计%20v1.0（产品+技术总览版）.md)
- [统一数据模型](docs/AI%20Employee%20OS%20Unified%20Data%20Model%20v1.0.md)
- [MVP API 与接口规范](docs/AI%20Employee%20OS%20MVP%20API%20&%20Interface%20Specification%20v1.0.md)
- [安全与权限架构](docs/AI%20Employee%20OS%20Security%20&%20Permission%20Architecture%20v1.0.md)
- [架构决策记录](docs/AI%20Employee%20OS%20技术决策记录%20ADR（Architecture%20Decision%20Records）v1.0.md)
- [Claude Cream macOS UI](docs/design-system/Claude%20Cream%20macOS%20UI.md)
- [Release 1：Decision Substrate](docs/releases/Release%201%20Decision%20Substrate.md)
- [Release 2：Execution and Evidence](docs/releases/Release%202%20Execution%20and%20Evidence.md)
- [Release 3：Agent Experience and Production](docs/releases/Release%203%20Agent%20Experience%20and%20Production.md)

## 参与贡献

欢迎提交 Issue 和 Pull Request。发起 Pull Request 前请确认：

1. 改动符合当前 MVP 和 canonical contract。
2. 确定性行为已经添加或更新测试。
3. 已运行 `./scripts/check.sh`。
4. 没有提交 Secret、运行时数据库、构建产物或本地配置。

架构边界、事实源顺序、状态不变量和验证要求请阅读 [AGENTS.md](AGENTS.md)。

## 安全

不要在公开 Issue 中提交凭据或私人数据。禁止提交 API Key、Token、Cookie、私钥、真实用户数据或运行时数据库。所有 Tool 副作用都必须经过 Rust Runtime 的权限、审批、审计和幂等控制。

## 许可证

项目目前尚未选择 License。源代码可以公开查看，但目前没有授予使用、修改或再分发许可。在加入明确的开源许可证前，不能将本项目视为已经完成许可授权的开源软件。
