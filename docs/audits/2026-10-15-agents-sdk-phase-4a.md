# 第四阶段 4A：SDK 交接与 DeepAgents worker 解耦验收

日期：2026-10-15。**SDK 依赖解除、历史兼容和固定任务契约的 Poe 回归通过；自然语言任务的交付稳定性门禁未全通过，停在 4A，不进入 4B。**

实施范围见 [阶段契约](2026-10-15-agents-sdk-phase-4a-contract.md)，机器证据见 [验收 JSON](evidence/2026-10-15-agents-sdk-phase-4a.json)。本轮没有替换已安装客户端、操作生产数据库、修改凭据、提交或推送。

## 代码变化

- SDK v1/v2 的交接校验由 TypeScript Runtime 执行，复用 AgentHandoffEnvelope、内容 SHA-256、接收方及 Artifact/Evidence 引用契约。记录新的 `handoff_validated` 检查点，绑定冻结 Revision/Grant、Assignment、Handoff 和当前 Run 的已结算工具动作；不创建或伪造 LangGraph 状态。
- 校验收敛到 `TaskService.startManagerReview`，覆盖普通审核、长文档分批审核、拒绝计划变更及重启恢复。相同事实重复校验不重复落盘，返工产生新证据；单项恢复失败不会继续请求模型。
- SDK 拒绝计划变更后的下游输入改为已校验的累积交接，保留结构化内容；Runtime 创建的返工成员只继承同 Run、同员工版本的原 Assignment 接收权限。修复拒绝变更时校验失败后 Run 悬挂的问题。
- 结构化上游可没有文本输出；只保留原 worker 对末员工非空字符串的要求。历史 Teams 工具回执继续由原任务血缘和业务证据策略处理。
- worker 路径参数延迟到旧执行器真正调用时读取；打包资源检查允许 DeepAgents 文件缺失。记忆服务和必需工具 helper 的检查继续生效。
- 缺少 SDK executor 标记的历史 Run 仍使用原 Python worker；旧 Handoff 与 `deep_agents_safe_pause` 记录不改写。旧 worker、Python 环境和打包配置仍保留。

任务、RunGrant、审批、ToolGateway、实际副作用执行、预算与交付验收仍由现有 Runtime 管理。本轮没有修改 SDK 模型循环、Provider、权限规则、审批语义或工具执行器。

## 确定性与进程验证

51 个后台测试文件：**371 项通过，3 项原有跳过，0 项失败**。新增交接校验测试 25 项，增加打包资源缺失测试 1 项；原有 Runtime、SDK 团队/单员工、Provider、Gateway 和审批恢复测试全部通过。Node/Web 类型检查、Electron Vite 构建和 diff 检查通过。构建使用现有已签名 helper，没有重新编译或签名凭据 helper。

真实 Electron Runtime 的 8 个独立数据库恢复探针全部通过，模型边界只观察请求、不执行 Provider：

| 场景 | 结果 |
|---|---|
| SDK v2 员工已完成、尚无交接检查点，缺少 worker 参数 | TypeScript 校验后只发出一个总管审核请求 |
| SDK v2 已有历史 worker 检查点，缺少 worker 参数 | 旧记录保留，新 TypeScript 校验落盘，正常恢复 |
| SDK v1 安全退出后恢复，缺少 worker 参数 | 进入统一审核门禁并正常恢复 |
| 损坏交接内容哈希 | `handoff_integrity_failed`，Run failed，模型请求 0 |
| 总管不在交接受众内 | `handoff_recipient_not_authorized`，Run failed，模型请求 0 |
| 引用的 Evidence 缺失 | `handoff_evidence_not_found`，Run failed，模型请求 0 |
| 历史 Run、真实原 Python worker | worker 执行并生成真实 SQLite 检查点，恢复原总管请求 |
| 历史 Run、缺少 worker 参数 | `missing_worker_python`，Run failed，模型请求 0，无 SDK 静默替代 |

非法数据通过专用 fixture 注入，未更改正式存储。第一次探针读取审计字段的方法有误，探针报告失败；Runtime 已正确拒绝损坏交接。修正探针后 8 项通过，第一次报告保留在 `recovery/results-harness-attempt-1.json`。

## Poe 实测

全程使用独立 fixture 数据库、真实 Poe `claude-sonnet-4.6`、真实 Provider IPC、DOCX 读取和本机文件工具。每个 SDK Runtime 均未传入 worker Python、worker script 或 checkpoint directory 参数，也未创建 DeepAgents 检查点目录。

| 实测批次 | 场景 | SDK 请求数 | 结果 |
|---|---|---:|---|
| 首轮实现，边界修正前 | 总管会话路由至双员工 | 13 | 源读取 → 交接 → 一次写入 → 回读 → Delivery 成功 |
| 首轮实现，边界修正前 | 审批点 SIGKILL 恢复 / 拒绝 / 取消 | 7 / 4 / 2 | 全部符合预期 |
| 最终构建 | 固定任务契约，双员工协作 | 12 | 两员工成功；一次创建、相同 SHA-256 回读；Delivery 成功 |
| 最终构建 | 审批点 SIGKILL → 同一 Approval 恢复 | 7 | Grant 不变，等待时模型请求 0；批准后创建一次、回读、Delivery 成功 |
| 最终构建 | 拒绝写入 | 4 | Approval rejected、动作 blocked、文件不存在、无 Delivery |
| 最终构建 | 取消首员工请求 | 2，含取消请求 | 下游保持 pending，无工具动作、无 Delivery |
| 最终构建 | 再次从自然语言总管会话启动双员工 | 39 | 交接与文件证据通过；总管交付格式连续不合约，最终 `manager_rework_limit_reached`，无 Delivery |

首轮报告位于 `stage-4a/live`；最终构建的固定契约回归位于 `stage-4a/final-core`；失败样本位于 `stage-4a/final-live`。绝对路径、请求/任务/审批/检查点 ID、来源与构建 SHA-256、Token 账本和实际文件哈希均在验收 JSON 中。没有将首轮报告标成最终构建实测。

## 尚未通过的门禁

最终自然语言样本中，Poe 在 `deliveryResult.keyResults` 填入 acceptance marker 和 SHA-256/bytes 等技术校验字段。原 Delivery 契约拒绝这些指标，`normalizeManagerReview` 将结果转为未通过，既有 `handleManagerEvent` 把它当作员工任务返工；重试又尝试创建已有文件，随后读取、编辑和回读，最终达到返工上限。该失败 Run 有三次通过的 TypeScript 交接检查点，未调用 Python，也未生成虚假 Delivery。

同类交付格式失败在第三阶段已被记录。本轮再次出现，说明仅增强 system 指令尚不足以稳定约束模型。此次失败消耗 39 次模型请求，Run 实际账本 173,901 Token（不含会话路由）；不能把框架迁移称为调用数或成本优化。Poe 金额和取消请求最终账单仍未验证。

**4B 前应先修复这一恢复分类：**总管交付格式不合约时，在原预算内让总管基于同一份冻结证据做有界格式纠正；不得为纠正格式重新分派员工或重做文件操作。业务验收不通过仍走原员工返工。验收应断言格式纠正期间 Assignment/ToolAction 数量不增加、合法结果可交付、达到纠正上限时明确失败，并重新跑自然语言 Poe 用例。本轮保持原交付门禁，不提前实施这项额外流程变更。

## 未提交修改保护

本阶段开始的 64 个未提交文件中，仅扩展 `src/runtime/domain.ts`、`src/runtime/index.ts`、`src/runtime/task-service.ts`；其余 61 个逐一 SHA-256 相同。迁移最初 27 个用户未提交文件仍全部字节相同。HEAD、暂存区不变；历史验收报告与证据保留。

DeepSeek 实测、全局旧依赖删除、记忆服务迁移、性能测量、安装包及界面人工验收继续留在后续阶段。
