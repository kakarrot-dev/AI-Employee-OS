# 4B：由 Runtime 推进冻结 Assignment

状态：用户已授权本阶段范围；只读 builder check 返回 `nothing important left`。实现与验收已通过，见 [4B 实测报告](2026-10-15-agents-sdk-phase-4b-runtime-dispatch.md)。前置事实见 phase-4b 基线及 manager-review-format-repair 报告。

## 目标与边界

去掉总管跟随冻结计划产生的付费 `manager_dispatch` 请求。Runtime 只推进当前唯一合法 Assignment，仍通过同名 SDK 父 Agent、`Agent.asTool()` 子员工及原工具调用进入执行。自然语言路由、员工推理、最终质量审核和格式纠正仍使用现有 Provider。

保留 Task、Run、TaskRevision、RunGrant、Approval、ToolGateway、Handoff、Delivery 的权威及现有暂停/取消/未知结果处理。不更换 SDK 版本，不删除 DeepAgents 历史执行路径，不修改权限、模型配置、正式数据、凭证或既有未提交工作。

## 推进契约

1. 新分派必须属于当前 Task 的 activeRun，Run 正在运行且 Grant 有效；冻结修订包含员工版本；整个 Run 恰有一个 running Assignment，所有前序 Assignment 已 succeeded；待执行 ProviderRequest 必须与该 Assignment、已登记 provider_step 匹配。
2. Runtime 构造仅含精确 assignmentId 的 SDK function_call，工具名由冻结员工版本计算；保持现有父/子 Agent 命名及图。以 Runtime 来源、稳定 callId/responseId、员工/Assignment/员工请求绑定记录检查点，再进入子员工。
3. Runtime 分派只生成 SDK 控制响应，Usage 为零；不发 Provider IPC，不创建付费 provider_step、usage event 或 BudgetLedgerEntry。不把 Runtime 控制次数计入模型调用或伪造 Provider 回执。
4. 重复进入同一员工的工具后续轮次也适用；仍保留 SDK maxTurns 和 Runtime 对实际 Provider 请求的步数、Token、截止时间门禁。

## 检查点兼容

沿用 `openai-agents-ts-v2`、SDK 0.20.0、既有图名称及冻结 binding 算法。dispatch 回执采用向后兼容联合类型：原 `{assignmentId, request, events}` 没有来源字段也可读取；新回执明确标为 Runtime。旧 Provider 回执只重放已经接受的 SDK 响应，不重新请求/记账。

完整 RunState 待审批恢复与 prepared-before-RunState 窗口分别验证。重放 Runtime 分派必须保持原 callId、参数、员工请求和图绑定；重放旧付费分派保持原 Provider callId。审批引用、Grant、工具幂等键及结果校验继续由原 Runtime 机制约束。检查点损坏、跨 Run/员工/请求绑定、非唯一或跨越前序的分派均失败关闭。

## 验收与对照

- 先保留失败用例，覆盖零付费分派、唯一合法 Assignment、前序门禁、回执绑定、真实 SDK 父子图、审批批准/拒绝/重启、准备窗口及旧检查点。
- 运行相关 Runtime/Provider/Main/Shared 回归、类型检查及不重建 native helpers 的应用构建。
- 复制修改前构建，在隔离数据库、同一 Poe 模型和同一自然语言/工具场景上记录对照；候选验证多员工交接、真实文档写入与回读、SIGKILL 审批恢复、等待期零调用、一次写入、拒绝和取消。
- 分列路由与 Run、实际请求与已收到 usage、各 stage 的输入/输出 Token。候选新 Run 的付费 manager_dispatch 必须为零；同时列实际任务总量。模型输出造成的轮次变化、取消计费未知及样本边界单独说明，不用静态估算替代实际 Token。
- 历史旧版已挂起审批用修改前 Runtime 建立，再用候选构建恢复，同一审批和 Grant、无额外等待调用、无重复写入。
- 本阶段验收通过后停在 4B 交付点，后续压缩/裁剪仍按新门禁推进。保留所有历史证据和全部未提交文件，核对原始 27 个用户文件及本轮 77 文件基线。

实现细节（Runtime 控制 ID 命名、内部纯校验方法、测试夹具）由实现者按现有风格决定，不增加配置开关或依赖。
