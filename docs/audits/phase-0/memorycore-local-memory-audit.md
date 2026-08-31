# Phase 0：MemoryCore 与最小本地记忆审计

日期：2026-08-31

结论状态：已完成

审计对象：TencentDB Agent Memory `v2.0.1`，源码快照 `a5dcbe6e9fee0d1d1e32d935326f1d3bcf927fdb`

## 1. 决策

**不集成当前 MemoryCore Standalone；采用产品自有 Memory Adapter 与最小本地记忆实现。**

- **No-Go：** MemoryCore 可以无 Docker 启动，Proxy、MemoryKnowledge 和 Skill 不是启动必需项，但固定发布物不能通过可复现构建门禁，本地 Embedding 配置不可达，敏感数据明文落盘，删除不会清理 JSONL/WAL，且其元数据管理面与产品事实源重复。
- **Go：** 使用固定版本 FastEmbed 与本地中文 ONNX 模型，在产品边界内实现加密记录、进程内 BM25、加密向量、Scope/分类过滤和永久删除协议。
- **兼容边界：** Memory Adapter 是产品内部契约，不复刻 MemoryCore 的 108 个 HTTP 接口、User/Team/Agent/Task/Skill 管理面或旧版数据格式。

该决策不是否定 TencentDB Agent Memory 的团队记忆产品定位；它只说明 `v2.0.1` 不满足 AI Employee OS 的本地、最小、可加密、可彻底删除和单一事实源约束。

## 2. 固定基线

| 组件 | 固定版本或快照 | 许可证/来源 |
| --- | --- | --- |
| TencentDB Agent Memory | `v2.0.1` / `a5dcbe6e9fee0d1d1e32d935326f1d3bcf927fdb` | MIT；[官方 Release](https://github.com/TencentCloud/TencentDB-Agent-Memory/releases/tag/v2.0.1) / [固定源码](https://github.com/TencentCloud/TencentDB-Agent-Memory/tree/a5dcbe6e9fee0d1d1e32d935326f1d3bcf927fdb) |
| MemoryCore `package.json` | 包内版本仍为 `2.0.0-beta.1` | 固定源码 |
| FastEmbed | `0.8.0` / `6fa442b9603cd197c4b8cf19f072b3b9bbaac9b0` | Apache-2.0；[官方 Release](https://github.com/qdrant/fastembed/releases/tag/v0.8.0) |
| 中文 Embedding | `Qdrant/bge-small-zh-v1.5` 快照 `46fbe35fd4374a00fee7de77dfddaeb6dd6a2c59` | MIT；[官方支持模型表](https://qdrant.github.io/fastembed/examples/Supported_Models/) |
| ONNX | `model_optimized.onnx`，512 维，约 91MB | SHA-256 `1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38` |

## 3. MemoryCore 真实能力

### 3.1 已通过的部分

- 使用 Node.js `26.8.1`、源码入口与 `tdai-gateway.standalone.yaml`，可以不使用 Docker 在回环地址启动。
- SQLite、FTS5/BM25、本地文件和进程内 State Backend 可工作；`/health` 返回 `vectorStore=true`。
- Standalone 启动不依赖 MemoryProxy 或 MemoryKnowledge；Skill 配置关闭后 `/v3/skill/list` 返回 `Skill module not enabled`。
- Bearer Token 能保护数据面；未携带 Token 的请求返回 `401`。
- L0 对话写入、关键词搜索、隔离字段过滤和数据库行删除可运行。

这些事实证明 MemoryCore 不是“只能 Docker/云端部署”，但没有证明它满足本产品的完整门禁。

### 3.2 发布物不可复现

固定标签存在以下发布一致性问题：

1. `MemoryCore/package.json` 声明 `2.0.0-beta.1`，与 Release `v2.0.1` 不一致。
2. MemoryCore 没有提交 `package-lock.json` 或 `pnpm-lock.yaml`；`npm install` 会按时间漂移解析依赖。本轮实际解析 617 个包，因此不能把这组传递依赖称为固定基线。
3. `npm run build` 在 `build:seed-v2` 失败，因为标签中不存在 `scripts/seed-v2/tsconfig.json`。
4. 标签没有提交 `src/**/*.test.ts` 或 `__tests__/**/*.test.ts`；`npm test` 结果为 `No test files found`。Package Script 中声明的 Standalone E2E 目录同样不存在。

源码入口能启动不等于发布物可以被锁定、构建、测试和随客户端分发。

### 3.3 本地 Embedding 不可从配置启用

源码保留了 `LocalEmbeddingService` 与 `node-llama-cpp` 实现，但 `src/config.ts` 明确将用户输入的 `provider="local"` 改写为 `provider="none"`，并记录“Local embedding provider is not available in user config”。Store Factory 与 Store Pool 也只创建远程 Embedding Service。

因此：

- 默认 Standalone 只有 BM25，`/health` 显示 `embeddingService=false`。
- README 所述本地向量能力不能通过产品配置路径使用。
- 开启向量召回需要远程 OpenAI-compatible Embedding，违反“Embedding 完全本地”的产品约束。

### 3.4 默认路径会产生未授权网络尝试

Standalone 可以在 LLM Key 为空时启动，但第一次写入 L0 会立即进入 L1 Pipeline，并向默认 `https://api.openai.com/v1` 发起请求。本轮因 Key 为空返回认证错误，但待提取内容已经进入请求构造路径。

产品不能依赖“请求最终 401”来阻止数据出口。记忆提取必须由 Runtime 在用户明确选择 Provider 后签发短期会话；未授权时只排队，不得尝试默认外部地址。

### 3.5 删除和加密门禁失败

本轮向 L0 写入唯一探针后：

1. `/v3/conversation/delete` 返回 `deleted_count=1`，查询接口不再返回该记录。
2. 同一原文仍完整存在于 `conversations/YYYY-MM-DD.jsonl`。
3. SQLite WAL 中仍可找到多份探针明文。
4. 源码没有 SQLCipher、应用层字段加密、`PRAGMA secure_delete`、删除后 WAL 截断或 `VACUUM` 协议。

这只满足“逻辑删除数据库行”，不满足产品定义的永久删除，也不满足记忆原文和向量索引的应用层静态加密。

### 3.6 产品边界不匹配

MemoryCore 同时提供 User、Team、Agent、Task、Skill、Knowledge、Prompt 和权限关系管理；官方 v3 文档列出 108 个接口。即使 Skill 关闭，Knowledge 元数据接口仍可用，Metadata Router 仍加载。

AI Employee OS 已规定产品数据库是 Employee、Task、Skill 等实体的唯一事实源。通过 Adapter 忽略这些接口仍要承担其依赖、Migration、路由和攻击面，机会成本高于实现 MVP 所需的四层记忆契约。

默认 v3 请求在缺少 `team_id/agent_id/user_id` 时还会写入 `default` Bucket；严格隔离需要额外配置和 Adapter 断言，不能依赖默认行为。

## 4. 最小本地替代 Spike

可执行验证位于 [`spikes/local-memory`](../../../spikes/local-memory/README.md)。

### 4.1 结构

```text
Runtime Memory Adapter
→ 校验 Scope / 分类 / 来源 / 预算
→ 本地 FastEmbed 生成 512 维向量
→ AES-256-GCM 加密正文、标签和向量
→ SQLite 只持久化密文与最小 Scope 元数据
→ 解锁后从密文重建进程内 FTS5/BM25
→ Scope + 分类先过滤，再执行 BM25 + 向量混合召回
```

主密钥在 Spike 中随机生成且不落盘；生产实现必须从 Keychain 获取。AES-GCM 的 AAD 绑定 Memory ID、Scope、分类和版本，防止密文跨对象替换。

### 4.2 实测结果

| 场景 | 结果 |
| --- | --- |
| 模型首次下载 | 约 91MB；本轮 11.5 秒，仅作当前网络快照 |
| 缓存后离线加载 | `HF_HUB_OFFLINE=1`，约 0.03 秒初始化，成功生成 512 维向量 |
| 模型完整性 | ONNX SHA-256 与固定值一致 |
| 中文关键词召回 | “发布前完整测试”命中规则记忆 |
| 中文语义召回 | “上线之前需要完成哪些检查”在无词面命中时仍命中同一规则 |
| 分类过滤 | `episodic` 查询只返回发布计划，不返回 `instruction` |
| Scope 隔离 | `employee-a` 不返回 `employee-b` 记忆 |
| 加密落盘 | 写入后数据库、WAL 中均不存在探针明文 |
| 永久删除 | 记录不再召回；WAL 截断与 `VACUUM` 后目标密文和探针明文均不存在；保留记录仍可用 |

### 4.3 尚未证明

- 该 Spike 解密指定 Scope 的候选并在内存计算余弦相似度，没有证明十万级记忆的延迟和内存上限。
- Keychain ACL、签名升级、主密钥轮换和恢复流程未验证。
- 生产版本、冲突、停用、墓碑、Migration、备份、崩溃中断和并发删除协议未实现。
- 三个中文样例只能证明执行路径，不代表召回质量；模型质量需要独立 Eval Set、Recall@K、nDCG、误召回和长文本截断评估。
- 分类与 Scope 稳定 ID 目前明文存储；是否需要隐藏这类元数据由威胁模型决定。

## 5. 产品实现约束

1. Local Control Runtime 是唯一记忆写入和治理入口；Worker 不直接查询数据库。
2. Memory Adapter 只接收稳定产品 ID，不创建 Employee、Task、Skill 或权限对象。
3. 固定一级分类和 Scope 必须先过滤，再检索；未知分类和跨 Scope 查询默认拒绝。
4. 本地 Embedding Artifact 固定模型快照、文件清单、SHA-256、维度和许可证；下载完成前明确降级为 BM25。
5. 磁盘不保存明文 FTS/BM25 索引；加密字段至少覆盖正文、标签、摘要和向量。
6. 云端记忆提取必须使用 Runtime 已授权的 Provider 会话；无授权或不可用时进入待处理队列。
7. 永久删除覆盖原文、派生摘要、向量、内存索引、缓存、队列、WAL/freelist 和应用管理的备份，只保留无内容墓碑。
8. 正式集成前建立性能、质量、崩溃恢复、Migration 和 Keychain 门禁，不把本 Spike 直接当生产组件。

## 6. 门禁结果

| Phase 0 Memory 门禁 | 结果 |
| --- | --- |
| MemoryCore 固定版本和 MIT 许可证 | 通过 |
| 无 Docker、无 Proxy/MemoryKnowledge 启动 | 通过 |
| Skill 关闭 | 通过 |
| 发布物锁定、构建和测试 | 不通过 |
| MemoryCore 本地 Embedding | 不通过 |
| MemoryCore 应用层加密与永久删除 | 不通过 |
| 与产品单一事实源和最小攻击面一致 | 不通过 |
| 最小替代路径完成本地 Embedding、分类、Scope、混合召回、加密和删除 | 通过（Spike 级） |

**最终判定：MemoryCore `v2.0.1` 不进入产品；Phase 7 按产品自有最小本地记忆子系统推进。**
