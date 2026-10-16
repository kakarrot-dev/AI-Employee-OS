# 4C：Runtime 交接统一与历史 Run 边界

状态：用户已授权先梳理边界、明确门禁后继续迁移。Runtime 执行与历史恢复门禁已通过，客户端自然路由仍保留一例失败，4D 未推进，见 [4C 验收报告](2026-10-15-agents-sdk-phase-4c.md)。本阶段移除执行及启动路径的最后 DeepAgents worker 依赖，保留 Provider 启用范围及冻结的权限、审批和工具治理。

## 已确认的依赖

| 位置 | 当前作用 | 本阶段处理 |
|---|---|---|
| `src/runtime/index.ts` 的 worker spawnSync | 所有员工完成后，以 FormalModel 复演交接 | 改为保存事实上的 Runtime 校验；不新增模型调用 |
| `spikes/deep-agents/formal_worker.py` | 假模型、无网络；每次 unlink 同 Run SQLite 再写入，未从旧 SQLite 恢复 | 保留历史研究源码与环境，不再由产品 Runtime 调用 |
| 无 employeeExecutor 的 Run | 当前非 SDK 执行器，包括 DeepSeek 新 Run；员工 Provider 循环、工具、审批均在 TS Runtime | 不强制转换成 SDK；交接校验由 Runtime 接管 |
| SDK v1/v2 的 Run、SDK RunState 和分派回执 | SDK 执行与历史恢复 | 保留图、版本、binding、Runtime/旧 Provider 回执兼容及 4B 零付费分派 |
| `deep_agents_safe_pause`、旧 Handoff、SQLite 文件 | 历史记录和回滚材料 | 原记录不改写、不删除、不当作绕过事实校验的授权 |
| Main RuntimeSupervisor / bundledRuntimePaths | 传入及探测可选的 worker 路径 | 删除这些运行参数与路径字段；继续要求 memory 和工具 helpers |
| assemble_bundled_runtime / release metadata | 仍打包、导入并统计 DeepAgents 的 Python 环境 | 本阶段保留，另设包体裁剪门禁 |
| check_phase_0.sh、spikes 和历史审计 | 研究复现材料，不是当前执行依赖 | 保留，避免以字符串清理破坏历史证据 |

打包前置问题已现场确认：两个 `.venv` 都为 CPython 3.13.15；assembly 却固定访问 DeepAgents python3.14 与 memory python3.12 site-packages，且 memory `.model-cache` 不存在。现有 local-release 只有部分产物，不能作为可用安装包的体积基线。修复该构建链及正式包体裁剪进入下一门禁，不静默扩大本阶段范围。

## 历史兼容契约

1. Task/Run/Revision/Grant/Assignment/Approval/ToolAction/Handoff/Delivery 是恢复权威。旧 DeepAgents SQLite 是历史附件，本轮从不读取、重建或删除它。
2. 通用 Runtime 交接校验复用既有 SDK 校验：绑定 activeRun、冻结版本与 Grant、串行 Assignment、交接来源/接收者、已结算工具、同 Run 证据和摘要。SDK v1/v2 仍必须有合法 typed envelope，验证摘要保持兼容。
3. 只有无 employeeExecutor 的旧路径允许无 envelope 的 LegacyTextHandoff。按现有 `output.text` SHA-256 规则读取，校验 Run/Assignment/接收者及 artifact/evidence 引用，不补写 envelope、不改旧 Hash、不把它当成 SDK 状态。未知执行器失败关闭。
4. 新旧 Run 在最终审核、审核恢复、分批审核和拒绝计划变更后的审核入口都经过同一校验。旧 deep_agents_safe_pause 仍可显示，不能替代当前事实验证。相同事实重复校验只写一份 handoff_validated。
5. 既有审批、幂等、未知结果、安全暂停和历史格式纠正上下文保持原机制。停止启动时将旧 approval_required Run 替换成 full_access 新 Run 的自动策略迁移；停止恢复时为旧小预算更换 Revision/Grant 的自动扩容。这两处现有自动升级与原授权保持、typed Handoff 冻结引用相冲突，按用户保留权限/审批的要求取消，不新增默认放权。预算不足按原预算失败，不自动放大；不转移执行器、重做已完成动作或丢弃旧 Token 账本。
6. 回滚材料保留不等于跨版本安装器回滚已验证；本轮不变更数据库 Schema、发布或替换已安装客户端。

实测补充的必要兼容修复：旧非 SDK Poe 字符串流式请求无法解析当前实际 `data: {"type":"response.completed",...}` SSE，因要求额外 `event:` 行而丢失文本、Usage 和终态。保留两次失败与原始响应；复用已验证的 Responses 解析器处理旧字符串流，保留原请求与权限绑定，不放宽函数名、call_id、终态或用量校验。旧文档已完成写入与回读但末轮文本为空时，保留其冻结草稿与工具证据；SDK 原校验不变。

实际开销门禁补充：逐请求核对发现旧非 SDK 总管审核未写入 BudgetLedger。新回执统一记录总管实际 Usage，按 requestId 去重；provider_step 保存实际 Provider/Model，历史无该元数据时优先使用冻结 reviewContext 的请求。保留发现该问题的原始 Run 与漏记账目，不补写假回执；最终构建另做真实 Poe 核对。

## 推进顺序与验收

先保留失败案例，再统一交接校验和 Main 启动依赖；全部确定性检查通过后，使用隔离数据库和现有签名 helpers 做真实 Poe 验证。

- 确定性：typed SDK v1/v2、无执行器 typed/legacy text、重启及旧 worker checkpoint、冻结审核上下文、前序/接收者/Hash/引用/工具/Grant 失败关闭，旧记录逐字节保留；审批和未知写入回归不退化。
- 实际旧 Runtime 先产生待审批的非 SDK Poe Run，新 Runtime 在不提供 worker 的条件下恢复，等待零调用、同审批/Grant、批准后写入一次并回读交付。保留旧 SQLite 哨兵文件，验证字节未变。
- 新 SDK Poe 自然语言双员工、审批 SIGKILL 恢复、拒绝/取消，以及旧 SDK RunState/准备窗口兼容；保持 4B 付费 manager_dispatch 为零。
- 保留修改前构建与真实 Poe 对照。分别核对路由、Run、stage、Provider 实际 usage 和账本；不将不同输出引起的 Token 波动说成架构节省，不将取消缺失 usage 记为免费。
- 相关后端回归、typecheck、直接 electron-vite 构建；不重建/重签 native helpers。核对本轮 80 个文件和原始 27 个用户文件、暂存区与 HEAD。

下一阶段包体门禁：独立输出目录，Python 解释器与 site-packages ABI 一致，记忆服务和固定模型 Hash 可离线运行；移除 DeepAgents 的实际打包依赖与组件清单后，验证包内 Runtime 启动、历史恢复和 SDK 协作，才报告包体收益。本阶段不对安装体积、内存或启动时间作改善承诺。

实现者可自行决定内部校验函数名和测试夹具；优先复用当前 validator，不增加第二套 Runtime 状态机或配置开关。

只读 builder check 已完成：上述自动权限升级和预算换版是两项重要问题，均按既有授权作出保留原冻结事实的决定；无其他重要未决问题。
