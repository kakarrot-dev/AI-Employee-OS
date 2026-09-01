# Phase 0：依赖、许可证与兼容矩阵

日期：2026-08-31

状态：本地开发门禁已完成；Apple 真实签名包与发布材料延期到 Phase 9

## 1. 口径

本清单只记录 Phase 0 已固定并实际审计的直接候选、参考输入和 Spike 依赖。它不是发布物 SBOM，也不把未进入产品的上游完整依赖树列为产品依赖。Phase 1 起每个可分发产物仍须从 lockfile 和最终 Bundle 生成机器可读 SBOM、第三方声明与许可证原文。

结果分为：

- **采用：** 允许按约束进入后续实现。
- **参考：** 只保留设计或路由知识，不打包上游运行时。
- **拒绝：** 已完成审计，但不进入产品。
- **待验证：** 关键运行门禁需要真实 Credential、签名身份或 Profile，不能由文档推导。

## 2. 直接依赖与许可证清单

| 对象 | 固定版本或快照 | 许可证/使用边界 | 决策 | 事实源 |
| --- | --- | --- | --- | --- |
| Eigent | `v1.0.3` / `92f17b596ce2ae27977d6db2f0ed11a81560115f` | 根许可证、README 与仓库元数据为 Apache-2.0，`package.json` 为 MIT；按 Apache-2.0 保守处理，首次分发派生文件前需澄清冲突 | 参考；仅允许逐文件审计后抽取通用 UI Primitive | [Eigent 审计](eigent-client-shell-audit.md) |
| Deep Agents | `0.7.11` / `4bc11004ba86999c2f6d59b1d958b53195619bcc` | MIT；只作为可替换 Harness，不作为 Runtime、权限或副作用边界 | 采用，受 `DeepAgentsAdapter` 约束 | [Deep Agents 审计](deep-agents-orchestration-audit.md) |
| LangChain | `1.3.18` | 由仓库 `uv.lock` 固定；发布前从最终环境生成完整许可证清单 | 采用为 Spike 依赖 | [Deep Agents Spike](../../../spikes/deep-agents/pyproject.toml) |
| LangChain Core | `1.6.1` | 同上 | 采用为 Spike 依赖 | [Deep Agents Spike](../../../spikes/deep-agents/pyproject.toml) |
| LangGraph | `1.2.11` | 同上 | 采用为 Spike 依赖 | [Deep Agents Spike](../../../spikes/deep-agents/pyproject.toml) |
| LangGraph Checkpoint | `4.1.1` | 同上 | 采用为 Spike 依赖 | [Deep Agents Spike](../../../spikes/deep-agents/pyproject.toml) |
| LangGraph SQLite Checkpointer | `3.1.1` | 同上；正式产品存储仍以产品数据库契约为准 | 采用为 Spike 依赖 | [Deep Agents Spike](../../../spikes/deep-agents/pyproject.toml) |
| TencentDB Agent Memory / MemoryCore | `v2.0.1` / `a5dcbe6e9fee0d1d1e32d935326f1d3bcf927fdb` | MIT；发布版本与包内版本不一致，缺少可复现 lockfile，删除与加密不满足要求 | 拒绝，不打包、不兼容其 108 个接口 | [Memory 审计](memorycore-local-memory-audit.md) |
| FastEmbed | `0.8.0` / `6fa442b9603cd197c4b8cf19f072b3b9bbaac9b0` | Apache-2.0 | Phase 7 候选，尚非发布基线 | [Memory 审计](memorycore-local-memory-audit.md) |
| `Qdrant/bge-small-zh-v1.5` | `46fbe35fd4374a00fee7de77dfddaeb6dd6a2c59` | MIT；ONNX SHA-256 为 `1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38` | Phase 7 候选，需质量、性能与分发复验 | [Memory 审计](memorycore-local-memory-audit.md) |
| Agent Reach | `v1.5.0` / `f65526cbaaad3879473acc1ba6dbefd195caf2be` | MIT 只覆盖自身代码，不覆盖第三方 CLI、服务、平台内容或用户会话 | 参考；只保留人工审计后的路由知识 | [Agent Reach 审计](agent-reach-managed-research-audit.md) |
| GitHub REST Adapter | `research-source/v1` 产品契约 | 不打包 `gh` 或 Agent Reach；只读公开仓库搜索 | 采用为 Phase 6 首批来源 | [Agent Reach 审计](agent-reach-managed-research-audit.md) |
| RSS/Atom Adapter | `research-source/v1` 产品契约 | 产品自有解析器；不打包 `feedparser` | 采用为 Phase 6 首批来源 | [Agent Reach 审计](agent-reach-managed-research-audit.md) |
| Poe API | 固定官方 Origin；公开目录 349 个条目；Allowlist 为 `claude-sonnet-4.6`、`gpt-image-2`、`seedance-2.0` | 远端服务，不属于可再分发开源依赖；Credential、Points 和服务条款由用户账户约束 | 协议采用；三种精确模型真实调用待验证 | [Provider 审计](provider-and-local-proxy-audit.md) |
| DeepSeek API | 固定官方 Origin；`deepseek-v4-pro` + `/responses` | 远端服务，不属于可再分发开源依赖；Credential、余额和服务条款由用户账户约束 | 协议及精确模型采用 | [Provider 审计](provider-and-local-proxy-audit.md) |

## 3. 已验证兼容矩阵

| 边界 | 验证输入 | 当前结果 | 后续约束 |
| --- | --- | --- | --- |
| Eigent Web Renderer | 固定快照；Node `22.23.2`；跳过生命周期脚本的隔离安装与 Vite Production Build | 6,900 个模块可编译；不证明桌面壳、原生模块或 Runtime 可用 | Phase 1 新建骨架，不 Fork 原产品壳 |
| Deep Agents 编排 | Python `>=3.11,<4.0`；仓库 `uv.lock`；SQLite Checkpointer | 串行委派、持久 Checkpoint、Interrupt、节点级安全停止和硬取消边界已通过确定性 Spike | 禁用默认文件、Shell、通用 Sub-agent 与并行委派 |
| 最小本地记忆 | Python `>=3.12,<3.14`；FastEmbed `0.8.0`；固定中文 ONNX | 本地 Embedding、加密、分类过滤、混合召回与删除 Spike 已通过 | Phase 7 仍需正式性能、质量、加密与不可恢复删除门禁 |
| 受管网络调研 | Python 标准库；GitHub REST 与 RSS/Atom；无上游 CLI | 两种独立来源的确定性与真实只读协议探测已通过 | Phase 6 重写产品 Adapter，不运行 Agent Reach |
| Provider 隔离 | Python 标准库；本机 Fake Upstream；短期 Grant | Streaming、结构化输出、Tool Proposal、Usage、取消、错误归一化和 Secret 隔离已通过 | 生产链路改为 Worker 无网络、Runtime 私有 IPC、Provider 签名 Helper |
| 真实 Provider | 用户明确授权的现有 Credential；`deepseek-v4-pro`；官方 `/responses` | 非流式、语义 Streaming、JSON Schema、Proposal Tool、禁止 Tool、Usage、取消与错误探测通过 | 结论只绑定该精确 Model ID、Endpoint 与探测器版本 |
| Keychain 签名身份边界 | macOS `26.6.2`；Apple Silicon；隔离 Keychain；ad-hoc 负例；项目稳定本地签名身份 | 不同身份被拒绝；同一稳定身份与标识可跨二进制变化无交互读取；不读取登录 Keychain 业务 Secret | 只证明签名身份连续性，不替代 Apple Access Group、Profile 或公证 |
| 网络失败模型 | `sandbox-exec deny network*`；临时回环 Server | 沙箱进程被拒绝、Control 可连接 | `sandbox-exec` 已弃用，不进入产品 |
| Apple Access Group / App Sandbox | Apple Development、Developer ID、匹配 Profile 与真实 App/XPC 包 | **延期：当前机器无 Provisioning Profile** | 不阻塞本地 Phase 1–8；Phase 9 发布候选前必须完成正负例、升级、回滚和无重复弹窗矩阵 |

## 4. Phase 0 总门禁

| 门禁 | 状态 |
| --- | --- |
| Eigent 解耦或组件抽取决策 | 通过：新骨架 + 逐文件抽取 |
| Deep Agents 串行委派、持久恢复与硬取消边界 | 通过 |
| MemoryCore 采用/拒绝决策与最小本地记忆 Spike | 通过：拒绝 MemoryCore，采用产品自有最小实现 |
| 至少两个受管独立来源，无全局 CLI/Runtime | 通过：GitHub REST + RSS/Atom |
| Worker 不接触 API Key 的 Provider 隔离路径 | 通过：确定性 Fake Upstream；真实包仍待验证 |
| 至少一个真实精确模型全套能力探测 | **通过：`deepseek-v4-pro` Responses API** |
| 本地稳定签名身份、升级连续性与负例拒绝 | 通过 |
| Apple Development / Developer ID 真实包、Access Group 与升级矩阵 | 延期到 Phase 9：当前机器无 Provisioning Profile |

按用户确认的“先完成本地可运行版本”边界，Phase 0 本地开发门禁完成，可以进入 Phase 1。Apple 签名 App/XPC 包的权限与升级矩阵仍是不可替代证据，但它属于 Phase 9 发布候选门禁，不得在最终分发时跳过。

可用 `./scripts/check_phase_0_external_gates.sh` 只读检查本机外部门禁材料是否就绪。它只判断签名身份、Profile 和产品 Credential 容器是否存在，不读取 Credential 值，也不代表用户已授权付费请求。

## 5. 本轮复验记录

2026-08-31 运行 `./scripts/check_phase_0.sh`：Provider Fake Upstream、GitHub/RSS 受管调研、临时 Keychain ACL、稳定本地签名升级和网络失败模型全部通过。Deep Agents 与最小本地记忆没有进入测试断言，因为 `uv` 下载锁定依赖时连续遇到 `files.pythonhosted.org` TLS handshake EOF；这是依赖准备失败，不是功能断言失败，也不替代两者此前已记录的 Spike 证据。

同日运行外部门禁预检：项目稳定本地签名身份与旧产品 Credential 容器存在；Apple Development 身份、Developer ID Application 身份和 Provisioning Profile 均不存在。随后在用户明确授权下读取现有 Credential 并完成 `deepseek-v4-pro` Responses API 真实探测；Credential 值、Prompt、响应正文、隐藏推理和原始错误正文均未写入证据。
