# AI Employee OS

一个 Local-first 的个人 Agent 团队工作台。

本项目从零开始，以用户与“总管”的自然语言对话为唯一正式工作入口。总管负责识别意图、组织用户创建并发布的 Agent 员工、审核执行结果，并向用户交付可验证产物。

当前目录仅保留本轮从零设计产生的方案，不继承旧实现。

## 当前事实源

1. [MVP 产品规格](docs/product-spec.md)
2. [系统架构方案](docs/system-architecture.md)
3. [实施路线图](docs/implementation-roadmap.md)
4. [Phase 0：Eigent 客户端壳审计](docs/audits/phase-0/eigent-client-shell-audit.md)
5. [Phase 0：Deep Agents 编排与恢复审计](docs/audits/phase-0/deep-agents-orchestration-audit.md)
6. [Phase 0：MemoryCore 与最小本地记忆审计](docs/audits/phase-0/memorycore-local-memory-audit.md)
7. [Phase 0：Poe、DeepSeek 与 Provider 本地代理审计](docs/audits/phase-0/provider-and-local-proxy-audit.md)
8. [Phase 0：Agent Reach 与受管网络调研审计](docs/audits/phase-0/agent-reach-managed-research-audit.md)
9. [Phase 0：macOS 多进程 Keychain、签名与网络沙箱审计](docs/audits/phase-0/macos-process-keychain-sandbox-audit.md)
10. [Phase 1：空客户端壳实施与验收](docs/audits/phase-1/client-shell-implementation.md)
11. [Phase 2：Local Control Runtime 与版本化契约实施](docs/audits/phase-2/runtime-contract-implementation.md)
12. [Phase 3：Provider 与总管对话实施验收](docs/audits/phase-3/provider-and-conversation-implementation.md)
13. [Phase 4：Agent 员工管理实施验收](docs/audits/phase-4/employee-management-implementation.md)
14. [Phase 5：Deep Agents 正式任务闭环实施验收](docs/audits/phase-5/formal-task-implementation.md)
15. [Phase 6：Tool Gateway、MCP 与受管网络调研实施验收](docs/audits/phase-6/tool-gateway-and-managed-research-implementation.md)
16. [Phase 7：最小本地记忆与召回实施验收](docs/audits/phase-7/local-memory-implementation.md)
17. [Phase 8：主验收场景实施验收](docs/audits/phase-8/main-acceptance-scenario.md)
18. [Phase 9：本地无签名打包与生命周期验收](docs/audits/phase-9/local-unsigned-packaging.md)

发生冲突时，以产品规格为产品边界，以系统架构方案为技术边界；实施路线图不得扩大前两者定义的 MVP。

## 当前阶段

产品规格 v0.1 已冻结，Phase 0–9 的本地运行边界已完成。当前已有 Electron 六模块客户端、独立 Local Control Runtime、版本化本地数据库、Provider Service、可恢复的总管流式对话、Agent 员工治理、Deep Agents 正式任务闭环、ToolAction 与受管 ResearchBundle，以及 AES-256-GCM 加密的本地记忆、异步待授权队列、固定 512 维中文 Embedding 和 RunGrant 约束召回，并已生成包含独立 Python、Worker、Keychain Helper 与固定模型的本地 arm64 `.app`。DeepSeek `deepseek-v4-pro` 已完成真实能力探测、全链路对话、Usage 落账、取消、员工测试和正式任务交付；Poe 只允许 `claude-sonnet-4.6`、`gpt-image-2`、`seedance-2.0`，缺少 Poe Credential 时保持未验证。MemoryCore 不集成，Agent Reach 不作为运行时依赖；云端记忆提取未经单独授权不会执行。Apple 签名/Profile、发布级 XPC/Keychain Access Group、公证与升级矩阵按用户边界保持延期，本地 ad-hoc 产物不得公开分发。

## 本地构建

```bash
npm ci
npm test
npm run package:local
```

产物位于 `build/local-release/dist/AI Employee OS-darwin-arm64/AI Employee OS.app`。当前只构建 Apple Silicon arm64；运行时资源约 700 MiB，总 App 约 987 MiB。首次启动会把包内固定 Embedding 模型原子安装到应用私有目录。
