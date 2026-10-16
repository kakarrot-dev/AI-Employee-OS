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
14. [Phase 5：Runtime 受管正式任务闭环实施验收](docs/audits/phase-5/formal-task-implementation.md)
15. [Phase 6：Tool Gateway、MCP 与受管网络调研实施验收](docs/audits/phase-6/tool-gateway-and-managed-research-implementation.md)
16. [Phase 7：最小本地记忆与召回实施验收](docs/audits/phase-7/local-memory-implementation.md)
17. [Phase 8：主验收场景实施验收](docs/audits/phase-8/main-acceptance-scenario.md)
18. [Phase 9：本地无签名打包与生命周期验收](docs/audits/phase-9/local-unsigned-packaging.md)
19. [Phase 10：网络情报员与文档编写员实施验收](docs/audits/phase-10/specialist-employees-and-local-tools.md)

发生冲突时，以产品规格为产品边界，以系统架构方案为技术边界；实施路线图不得扩大前两者定义的 MVP。

## 当前阶段

2026-10-16：桌面 Renderer 采用 [Open Claude UI](https://github.com/Caho1/open-claude-ui) 的 MIT 主题与交互机制，重构为统一侧栏、宽阅读区、常驻输入框和按需事项边栏；正式样式独立于 Web 原型。现有 Runtime、SDK 执行、权限和存储契约继续复用。范围与验证见 [重构契约](docs/audits/2026-10-16-open-claude-ui-client-contract.md) 和[验收记录](docs/audits/2026-10-16-open-claude-ui-client.md)。

产品规格 v0.1 已冻结，Phase 0–10 的本地运行边界已完成。当前已有 Electron 六模块客户端、独立 Local Control Runtime、版本化本地数据库、Provider Service、可恢复的总管流式对话、Agent 员工治理、Runtime 受管正式任务闭环、ToolAction 与受管 ResearchBundle，以及 AES-256-GCM 加密的本地记忆、异步待授权队列、固定 512 维中文 Embedding 和 RunGrant 约束召回，并已生成包含独立 Python、Worker、Keychain Helper 与固定模型的本地 arm64 `.app`。DeepSeek `deepseek-v4-pro` 已完成真实能力探测、全链路对话、Usage 落账、取消、员工测试和正式任务交付；Poe 只允许 `claude-sonnet-4.6`、`gpt-image-2`、`seedance-2.0`，缺少 Poe Credential 时保持未验证。MemoryCore 不集成。核心受管调研不依赖 Agent Reach；用户于 Phase 10 显式安装的“网络情报员”本机扩展可通过固定只读 Tool 调用 Agent-Reach、Last 30 Days 与 OpenCLI，但这些外部依赖不打包、不获得任意 Shell，也不代表所有登录态平台已可用。云端记忆提取未经单独授权不会执行。Apple 签名/Profile、发布级 XPC/Keychain Access Group、公证与升级矩阵按用户边界保持延期，本地 ad-hoc 产物不得公开分发。

2026-10-15 的 SDK 迁移已完成 Poe 执行与 4D 候选包门禁：OpenAI Agents SDK TS 负责员工执行，Runtime 保留任务、权限、审批和工具网关。生产执行与候选包不再依赖 DeepAgents；历史 Run/审批和旧 checkpoint 仍按原契约保留。自然路由空验收修复已完成三组 Poe 重复验收，具体边界见 [路由修复](docs/audits/2026-10-15-supervisor-route-repair.md) 与 [4D 报告](docs/audits/2026-10-15-agents-sdk-phase-4d.md)。DeepSeek 早期实测不等于本次 SDK 迁移验收，当前 SDK 实测仍以 Poe 为准。

## 本地构建

```bash
npm ci
npm test
npm run package:local
```

默认产物位于 `build/local-release/dist/AI Employee OS-darwin-arm64/AI Employee OS.app`。当前只构建 Apple Silicon arm64。组装前须准备与 `spikes/local-memory/uv.lock` 同步的虚拟环境和固定模型缓存；解释器与 site-packages 从同一环境读取，不能混用 Python ABI。默认模型输入为 `spikes/local-memory/.model-cache`；其他已校验缓存可通过 `--model-cache` 显式传入。构建缺资源会失败，不能把部分目录当成可用包。

保留已有构建、使用独立目录验证时，直接运行以下步骤；预先保留现有签名 helpers，不调用会重建它们的 `npm test`、`npm run build` 或 `package:local`。将模型参数替换为实际的已校验缓存路径：

```bash
npm run typecheck
npx vitest run src/runtime src/provider src/main src/shared
node --test scripts/release_paths.test.mjs
npx electron-vite build
node scripts/assemble_bundled_runtime.mjs --release-root="$PWD/build/verification/local-release" --model-cache="/absolute/path/to/model-cache"
node scripts/generate_release_metadata.mjs --release-root="$PWD/build/verification/local-release"
node scripts/package_local_app.mjs --release-root="$PWD/build/verification/local-release"
```

封装可用 `--electron-zip-dir=/absolute/path/to/zip-directory` 复用相同锁定版本的本地 Electron 压缩包，避免另行下载。4D 完整候选磁盘占用约 726 MiB，运行资源约 359 MiB；旧构建为不完整目录，未计算缩减比例。首次启动会校验真实 `model_optimized.onnx` 并原子安装到应用私有目录。候选尚未安装替换、完成发布签名或公证。
