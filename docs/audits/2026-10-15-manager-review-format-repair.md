# 总管格式纠正与员工返工分离：验收记录

日期：2026-10-15。**格式纠正门禁通过，Poe 自然语言双员工任务与审批恢复通过；随后进入 4B 并完成首轮基线测量。** 本报告补齐 [4A 报告](2026-10-15-agents-sdk-phase-4a.md) 中的格式纠正阻塞，原报告与失败样本保留当时状态。

实施依据：[修复契约](2026-10-15-manager-review-format-repair-contract.md)。机器证据：[修复验收 JSON](evidence/2026-10-15-manager-review-format-repair.json)。后续测量：[4B 基线](2026-10-15-agents-sdk-phase-4b.md)。没有替换已安装客户端、操作生产数据库、修改凭据、提交或推送。

## 修复行为

根因在 `normalizeManagerReview`：响应结构或 DeliveryResult 校验错误与真正业务不通过都被归为 approved=false，随后进入员工返工，重新申请文件动作。

现在将审核结果分为有效业务审核和格式错误。格式错误只请求总管纠正，每个已完成员工批次最多纠正 2 次；仍计入原 Run 的步数、实际 Token 与截止时间，到上限明确失败。结构有效但业务验收不通过时，继续原来的有界员工返工。

第一次最终审核保存原始 Provider 请求和冻结证据摘要：TaskRevision、RunGrant、完成的 Assignment/Handoff、ToolAction 结果、ResearchBundle。纠正沿用同一份请求、schema 与证据，附加精确错误码及最多 4,000 字符的无效结果数据；不重新召回记忆、不重新做已完成的文档分批审核、不分派员工或执行工具。已存在的业务判断在格式纠正期间保持一致，不能通过改为 approved=false 触发员工返工。

审核检查点记录纠正次数、原请求、证据摘要与内容摘要。重启、正常退出或拒绝计划变更优先恢复该上下文；证据变化拒绝继续。长文档审查批次也绑定证据摘要并保留已完成摘要。没有新摘要字段的历史文档批次重新审核已保存正文，不重做原工具。

SDK 总管 Provider 输入只携带这份完整 Runtime 审核请求，移除额外 SDK root history，避免把旧员工输出及错误审核候选混入纠正。显式 `invalid_structured_output` 也进入同一受限流程，取消、网络与授权错误保持失败语义。旧 Poe 路径先保存实际 usage，再解析 JSON，避免无效响应漏记付费 Token。

历史 Run 的预算/授权升级遇到已冻结审核上下文时停止升级，防止更换 Revision/Grant 或扩大预算。Runtime 的任务、权限、审批、ToolGateway 和交付证据门禁继续生效；旧 worker 路径保留。

## 确定性验证

新增回归先在旧实现复现：12 个场景中 11 个失败，仅真正业务返工场景通过。修复后共 52 个后台测试文件，**396 项通过、3 项原有跳过、0 项失败**；Node/Web 类型检查、Electron Vite 构建和 diff 检查通过。使用现有已签名 helper，没有重建或重新签名凭据 helper。

本轮增加 22 项 Runtime 审核恢复测试、2 项真实 SDK 循环测试和 1 项旧 Poe usage 测试。覆盖错误指标、无效结构、两次纠正上限、业务判断保持、真实业务返工、证据篡改、普通/小预算 legacy/SDK 重启、计划变更、正常退出、长文档摘要复用、分批期间证据变化、截止时间、步数预算及 SDK JSON 解析失败。纠正期间断言 Assignment 与 ToolAction 不增加，原 Grant 不变。

## 真实 Poe 验证

使用独立数据库、fixture 员工与目录、真实 Poe `claude-sonnet-4.6`、原 Provider IPC、DOCX 读取及本机文件工具。SDK Runtime 未提供 DeepAgents worker 参数，也未生成其检查点。

| 场景 | 结果 |
|---|---|
| 从上轮保留的 Poe 错误样本恢复格式纠正 | 一次真实 Poe 纠正后成功交付；完整 Provider 证据消息与已保存待纠正输入相同；Assignment/ToolAction 全字段不变，Grant 不变，无工具提案 |
| 自然语言总管入口 → 读取员 → 文档员 | 实际产生一次 `delivery_key_result_unverified`；总管纠正后交付成功。只有原两名员工和 3 项工具动作，源读取、一次创建与回读均成功，没有员工返工 |
| 写入审批点 SIGKILL → 恢复 | 同一 Approval 与 Grant；等待期间模型请求 0；批准后只创建一次，回读及 Delivery 成功 |
| 拒绝写入 | 原 Approval rejected、动作 blocked、文件不存在、无 Delivery |
| 取消首员工请求 | 下游保持 pending，无工具动作、无 Delivery |

自然语言任务实际使用 14 次模型请求，含 1 次创建任务前的会话路由；该 Run 有 13 次实际回执、50,864 Token，含一次格式纠正。从 Run 创建至 Delivery 为 72.424 秒。审批用例使用 9 次 SDK 请求。实际金额及取消请求最终账单仍未验证。

旧错误样本在专用克隆数据库中重放：适配该 fixture 的验收项数量与引用 ID，建立新的初始测试 Grant 后才冻结证据。初始拒绝是确定性回放，没有伪造 usage；后续纠正调用真实 Poe。该测试不代表对旧生产 Run 自动延长授权。

原始结果在本线程 `sdk-migration/stage-4a-manager-repair/natural-live-2` 与 `format-live-2`。完整路径、请求/任务/审批/检查点 ID、源码/构建/报告 SHA-256、Token 与文件回读哈希见验收 JSON。

## 保留的失败和边界

- 首轮自然语言路由生成空员工集合及空验收标准，被原 Router 以 `invalid_supervisor_route` 拒绝。未创建 Task 或调用工具；原始记录保留在 `natural-live`。再次以相同任务在新的独立 fixture 验证了完整流程。这一前置路由质量问题仍存在，本轮没有放宽校验或实现自动路由纠正，不能推断自然语言任务已达到稳定成功率。
- 第一次旧样本探针删除原 SDK 检查点后造成序号空洞，没有准确恢复待纠正分支。其结果只作诊断记录，不计作格式纠正成功证据。修正 fixture 后，`format-live-2` 验证发送的证据消息逐字等于待纠正请求、attempt=1，并取得真实 Poe 成功结果。
- 没有人工界面验收、安装替换、DeepSeek 实测、真实第三方写操作或总体性能收益结论。

## 修改保护

本轮开始的 71 个未提交文件中，仅扩展了 `task-service.ts`、`team-executor.ts` 及对应 SDK/Poe 相关测试和 Poe usage 处理，共 5 个文件；其余 66 个逐一 SHA-256 相同。迁移最初 27 个用户未提交文件仍全部字节相同。HEAD、暂存区保持不变；没有提交或推送。
