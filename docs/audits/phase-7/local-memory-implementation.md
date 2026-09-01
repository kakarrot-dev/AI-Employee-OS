# Phase 7：最小本地记忆与召回实施验收

版本：v0.1
日期：2026-09-01
状态：本地运行边界完成

## 1. 结论

产品已实现自有最小本地记忆子系统，不集成 MemoryCore，也没有引入 Hub、Proxy、Skill、Wiki、CodeGraph 或产品实体副本。对话与正式任务完成后通过独立异步 Memory worker 追加到本地加密待处理队列；当前没有获得云端记忆提取授权，因此队列保持 `pending_authorization`，不会静默调用 DeepSeek、Poe 或默认外部地址。

本地召回已接入正式 Assignment：Runtime 先对员工版本声明与冻结 `RunGrant.memoryScopes` 求交集，再映射为精确 `global/employee/task` Scope ID；召回结果再次按精确 Scope 过滤，最多加载 5 条、768 Token。Checkpoint 只保存记忆 ID、召回原因与越权丢弃数量，正文不复制进产品数据库。测试 Run 不触发沉淀。

## 2. 进程、密钥与网络边界

- 正文、标签、来源引用和 512 维向量使用 AES-256-GCM 加密；AAD 绑定记忆 ID、Scope、分类和版本。
- 原生 `memory-keychain-helper` 使用 Security.framework 生成或读取 32 字节主密钥，Keychain Service 为 `com.kakarrot.ai-employee-os.memory`，Account 为 `master-key.v1`；Runtime、Renderer、Preload、数据库、参数和环境均不持有密钥。
- 正常 `status/list/search/update/govern/delete/enqueue` 路径设置 Hugging Face 离线变量，并在模型初始化后替换 Socket，拒绝网络连接。
- 只有用户点击“下载并校验 Embedding”才允许模型下载；仅白名单透传代理与证书环境，不复制其他环境变量。
- 当前 Helper 是本地未签名开发目标。独立签名 Memory Service、Data Protection Keychain Access Group、密钥轮换和发布包内运行时属于 Phase 9 门禁。

## 3. Store 与异步沉淀

SQLite 使用 WAL、`secure_delete=ON`、外键和 5 秒并发忙等待。Store 包含当前记忆、不可变历史版本、加密待处理队列、仅查询 Hash 的召回日志和无内容墓碑。

固定范围：`global`、`employee`、`task`。固定分类：`preference`、`fact`、`rule`、`knowledge`、`experience`、`summary`。固定状态：`active`、`pending_verification`、`conflicted`、`disabled`。

对话与任务沉淀通过异步子进程完成，主回复和任务终态不等待本地加密写入。队列输入只接受 `conversation` 或 `task` 来源，拒绝沙箱测试与 Secret/私钥/认证字段模式；列表投影不返回正文。由于尚未授权记忆处理 Provider，本阶段没有把待处理内容自动转成事实或偏好，也没有新增云端数据出口。

## 4. 本地索引与召回

固定依赖和模型为：

| 项目 | 固定值 |
| --- | --- |
| FastEmbed | `0.8.0` |
| 模型 Runtime ID | `BAAI/bge-small-zh-v1.5` |
| 维度 | 512 |
| ONNX SHA-256 | `1294ea4b6331115a353d81f96b85e8c8d7fdcc284453d5b2fab5b016230aad38` |

模型不存在时明确进入 `bm25_only`，不伪装为混合召回。模型下载后校验唯一 ONNX 文件和 SHA-256，再把旧记录从 `bm25-only` 迁移为加密向量。BM25 索引只在 Memory worker 内存中临时创建，不写明文 FTS 表。检索先按 Scope、分类和标签过滤，再组合 BM25、余弦向量、时效和来源进行重排，并执行数量与 Token 预算。

本地 live 门禁包含 4 个中文代表查询：发布检查、差旅报销、写作偏好和机密凭据处理；Top-1 为 4/4，每次召回都低于 3 秒。该结果只证明当前小规模本地基线，不等同于十万级规模、冷启动或发布包性能结论。

## 5. 治理与删除

- 普通修改创建新版本；停用后不参与召回，恢复后重新可用。
- 新记忆显式引用冲突对象时，双方进入 `conflicted`；必须由用户选择保留项，不能静默覆盖。
- 永久删除清除当前记录、历史版本、召回记录和显式关联队列项，执行 WAL 截断、`VACUUM` 与再次截断，只保留 Scope 和删除时间组成的无内容墓碑。
- 删除测试证明目标明文在 SQLite、WAL 和 SHM 中删除前后均不可检索，数据库 `quick_check=ok`。
- UI 两步确认明确排除用户自行创建的 Time Machine、磁盘镜像和外部备份。

## 6. 客户端与正式任务

记忆页包含全部、全局、员工、任务、自动更新、冲突和已停用入口；支持本地搜索、查看来源/范围/版本/索引、修改、停用、恢复、解决冲突和永久删除。模型未就绪时展示 BM25 降级和显式下载入口。

正式 Assignment 的记忆加载顺序为：

```text
EmployeeVersion.memoryScopes ∩ RunGrant.memoryScopes
→ 精确 Scope ID
→ 本地过滤与混合召回
→ Runtime 二次越权过滤
→ 5 条 / 768 Token 上限
→ memory_loaded Checkpoint
→ 作为受限数据块进入该员工请求
```

测试注入了一个允许的员工记忆和一个伪造的其他任务记忆；Provider 请求只包含前者，Checkpoint 记录 `droppedOutsideScope=1`。

## 7. 验证证据

```bash
npm run typecheck
npm test
LIVE_LOCAL_MEMORY=1 npx vitest run src/runtime/memory-service.test.ts
npm run build
git diff --check
```

结果：11 个常规测试文件，43 项通过、2 项显式 live 跳过；真实本地记忆套件 2/2 通过；TypeScript、生产构建和 Diff 空白检查通过。

Electron 44 + CDP 使用隔离 `user-data-dir` 验证：Runtime 已连接；记忆页读取真实加密记录和待授权队列；BM25 降级、固定模型入口、来源/范围/版本和两步永久删除边界均可见；Memory Bridge 只有 10 个显式方法；Renderer 中 `process` 与 `require` 为 `undefined`，`webview` 数量为 0。临时 UI 数据在验证后移入废纸篓。

## 8. 门禁判定

| 门禁 | 判定 |
| --- | --- |
| 记忆数据库、向量和 Embedding 不离开本机 | 通过；只有用户显式模型下载可联网 |
| 未授权云端记忆提取不新增数据出口 | 通过；只进入本地加密 `pending_authorization` 队列 |
| 员工只收到允许范围内的最小记忆 | 通过；Grant 求交集、二次过滤、数量/Token 上限和 Checkpoint 均有测试 |
| 测试数据不进入正式记忆 | 通过；只有 conversation/task 终态入口，sandbox_test 被拒绝 |
| 冲突不静默覆盖 | 通过 |
| 永久删除覆盖应用管理的数据、索引、队列和可还原页 | 通过；外部备份明确排除 |
| 正常启动和召回不反复要求密码 | 通过本地 Keychain；真实签名 Access Group 留在 Phase 9 |

Phase 7 的本地运行边界完成，可以进入 Phase 8 主验收场景。云端自动提取仍需用户单独授权 Provider 与数据出口；十万级性能、密钥轮换、并发崩溃恢复、模型发布分发和 Apple 签名材料仍是 Phase 9 发布候选门禁。
