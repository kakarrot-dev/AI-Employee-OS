# Phase 9：本地无签名打包与生命周期验收

版本：v0.1
日期：2026-09-01
状态：本地无签名边界完成；公开分发门禁未开始

## 1. 结论

已生成可直接运行的 macOS arm64 App Bundle：

`build/local-release/dist/AI Employee OS-darwin-arm64/AI Employee OS.app`

Bundle ID 为 `com.kakarrot.ai-employee-os`，版本 `0.1.0`，体积约 987 MiB。产物包含 Electron Client、Main/Preload、Local Control Runtime、Provider Service、Deep Agents Worker、Memory Worker、原生 Keychain Helper、GitHub/RSS 受管 Tool 实现、两个 ABI 精确匹配的独立 CPython 运行时和固定 Embedding 模型。包内 runtime 共约 13,439 个普通文件、0 个符号链接，不引用仓库、Homebrew、用户全局 Node/Python、`npm -g` 或 `~/.agent-reach`。

本产物只用于当前用户要求的本地运行。`codesign` 显示 Electron 主可执行文件为 ad-hoc/linker-signed、`TeamIdentifier` 为空；没有 Developer ID、Provisioning Profile、Keychain Access Group、公证、DMG、更新签名或真实跨版本安装器证据。因此不得把它描述为已签名、公证或可公开分发的 Release Candidate。

## 2. 固定运行时

| 组件 | 固定值 |
| --- | --- |
| Electron | `44.0.0` arm64 |
| Deep Agents Python | 独立 CPython `3.14.7` |
| Memory Python | 独立 CPython `3.12.14` |
| Deep Agents lock SHA-256 | `8f67960c88a4eb05aa6bd74502ecbdf23c73fe8eec1c9fe6c6b3a896dc9c28f8` |
| Local Memory lock SHA-256 | `1f93a43e6c7d528ca345d3dd995e34d4be3171fc0ae611b6186b5528bb16c709` |
| Embedding | `BAAI/bge-small-zh-v1.5`，512 维 |
| ONNX SHA-256 | `1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38` |

两个原开发 `.venv` 都动态依赖 Homebrew，不能直接分发。组装脚本改用 python-build-standalone 解释器并复制各自 `uv.lock` 已安装环境；打包前在 `PATH=/usr/bin:/bin`、`PYTHONNOUSERSITE=1` 下验证关键 import。最终包再次执行 Deep Agents 正式 Handoff，Root Tool 只有 `task`、Employee Tool 为空、`proposalOnly=true`、持久 Checkpoint 成功。

## 3. 首次初始化与恢复

固定模型随 App 只读资源分发。首次启动逐文件安装到应用私有 `memory/model-cache`，每个文件先写 `.partial` 再原子 rename；已存在且 Hash 相同的文件跳过。完成后原子写入 `runtime/initialization.json`。

真实全新 `user-data-dir` 启动得到：Runtime `connected`、Schema v2、Memory `hybrid`、512 维、模型 Hash 匹配。随后把用户缓存中的 ONNX 移为“模拟中断”文件并重启；初始化自动补回 ONNX，回读 SHA-256 完全一致，Memory 再次进入 `hybrid`。模型安装不需要运行时访问 Hugging Face，也不依赖 Docker、全局 Python、Node 或数据库。

## 4. 生命周期与恢复

- **关闭窗口：** CDP 关闭唯一窗口后，主进程仍存活，Runtime 继续持有数据库；重新打开 App 后窗口恢复。
- **Runtime 崩溃：** 终止持有 `control.sqlite3` 的 Utility Process 后，客户端显示 disconnected；执行重连后恢复 connected，`PRAGMA quick_check=ok`，审计 Cursor 保持。
- **显式退出：** Runtime 写 `shutdown_requested`，等待当前 Provider 节点完成；在 Handoff 或 Manager 边界写 `safe_paused` 后退出。启动时只自动恢复带应用退出 Checkpoint 的 paused/pausing Run，不会误恢复用户 ChangeRequest 暂停。60 秒仍未收敛时保留 `pausing` 并写本地脱敏诊断，下次启动恢复，不伪造成功。
- **无活动 Run：** AppleScript 触发 Quit 后 Main、Runtime、Provider 均干净退出。
- **副作用：** 未审批 ToolAction 在退出前标记为未执行的 blocked；正在执行的 ToolAction 不伪造结果，等待收敛或由既有 `result_unknown` 协议处理。

确定性测试覆盖“活动 Assignment → shutdown requested → 节点完成 → safe paused → 启动后进入 Manager 恢复”。

## 5. Migration、诊断与存储

Runtime Migration 每版使用 `BEGIN IMMEDIATE` 与失败回滚。既有 Schema 升级前通过 SQLite `VACUUM INTO` 创建一致性快照，最多保留最近 3 份；测试从 v1 升级到 v2，备份仍可读取旧 Marker，原库升级后完整。

本地诊断只保存来源与脱敏错误摘要，不保存 Stack、Credential、Prompt、记忆正文或外部响应正文；保留最近 14 天、最多 20 份、合计最多 20 MiB。模型缓存软上限为 512 MiB；数据库、Checkpoint、加密记忆和导出不作为缓存自动删除。目录、备份、卸载与永久删除边界见 [本地存储、备份与恢复](../../storage-and-recovery.md)，数据出口边界见 [本地隐私说明](../../privacy.md)。

## 6. 许可证与发布元数据

每次本地打包从 `package-lock.json` 和两个最终 Python Runtime 的 `importlib.metadata` 生成：

- `Contents/Resources/legal/third-party-components.json`
- `Contents/Resources/legal/THIRD_PARTY_NOTICES.md`
- `Contents/Resources/legal/PRIVACY.md`
- `Contents/Resources/legal/STORAGE_AND_RECOVERY.md`

本次得到 383 个唯一组件，未知许可证 0。该清单是工程门禁，不是法律意见；公开分发前仍应保存完整许可证原文并完成法务复核。

## 7. 验证证据

```bash
npm test
npm run build
npm run package:local
git diff --check
```

结果：15 个测试文件，54 项通过，2 项显式 live 跳过；TypeScript、Electron 生产构建和 Diff 检查通过。打包 App 在仅保留系统 PATH 的全新用户目录中启动，UI 六模块可见，Renderer 的 `process`/`require` 为 `undefined`、`webview=0`；DeepSeek `deepseek-v4-pro` 仍为 verified，Poe 三个允许模型因 Credential 缺失保持 unverified。

## 8. 门禁判定

| 门禁 | 判定 |
| --- | --- |
| 不安装 Docker、Python、Node 或数据库即可本地首次运行 | 当前 arm64 Mac 隔离 PATH 通过；未获得第二台物理新 Mac 证据 |
| 应用内固定 Runtime 与私有数据目录 | 通过；runtime 0 symlink，不引用用户全局依赖 |
| 首次模型安装与中断恢复 | 通过；包内固定模型、原子复制、真实缺失文件恢复 |
| 关闭窗口后台运行、显式退出安全暂停、崩溃恢复 | 通过本地验证与确定性测试 |
| Migration 失败不破坏原库 | 通过事务回滚与升级前一致性快照测试；真实跨版本安装器未验证 |
| 本地数据离线查看与治理 | 通过架构门禁；Renderer 禁止网络，列表/治理不依赖 Provider |
| 许可证、隐私、备份、卸载、永久删除说明 | 通过；383 组件、未知许可证 0 |
| Apple 签名、公证、Access Group、发布升级链 | **未执行，按用户明确要求排除** |

至此 Phase 0–9 的本地运行目标完成。后续若要公开分发，必须另开发布阶段并提供 Apple 材料；不能用本次 ad-hoc 本地 App 替代该门禁。
