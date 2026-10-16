# 第三阶段实施契约：Poe 总管、团队与审批恢复

范围来自用户确认的第三阶段：用 Poe 迁移总管分派、多员工协作和审批恢复；保留 Runtime 的任务、权限、审批、工具网关及所有已有未提交修改。此文细化既定迁移方案，不增加新的产品流程或授权方式。

## 执行结构

- 新的 Poe 团队 Run 冻结 `openai-agents-ts-v2`、SDK `0.20.0`、总管配置、员工版本、TaskRevision 与 RunGrant；历史 Run 保留其原执行器。
- 总管路由由真实 SDK Agent/Runner 经原 Provider IPC 调用 Poe，结果继续交给 SupervisorRouter 校验并创建真实 Task/Assignment。路由确认后，成员冻结为 TaskRevision 和 Assignment，执行依赖顺序由现有 Runtime 约束。
- 每个正式 Run 有 SDK 根总管及冻结员工 `agent.asTool()` 图。根总管的 Poe 调用只能分派当前 Runtime 指定的员工和 Assignment；参数不能修改目标、资源或计划。员工 inputBuilder 读取 Runtime 冻结请求，忽略模型自行编写的任务正文。
- 每轮分派、员工模型调用、总管审核都计入同一个 Run 的 provider_step 与 BudgetLedger。总管不能跳过前置 Assignment，不能调用未冻结员工；员工不能使用其他员工的工具。并行独立 Run 各自保存上下文，单个依赖链保持串行。
- 员工只通过 `propose_tool_action` 使用现有 ToolGateway；原草稿内容绑定、来源绑定、范围校验、幂等和 Handoff audience 校验继续生效。总管只能得到已保存 Handoff 或“仍需续跑”的状态。
- 结构化审核继续由 TaskService 接受/返工/拒绝，SDK 文本结束不是 Delivery 成功。Python 交接检查保留到第四阶段。

## 审批与提交边界

1. Provider 完整响应到达后，SDK 的条件 needsApproval 回调先用原 TaskService 校验提案；同步事务准备 ToolAction、Approval、Assignment 绑定及 SDK receipt 检查点，尚不执行副作用。
2. 如 Runtime 要求审批，SDK 产生原生子员工中断并传播到根总管。将根 RunState、SDK 版本、员工图、父子关系、调用 ID、动作参数摘要、冻结授权摘要与检查点代次一起保存，才将该动作视为可接受审批。
3. 用户通过现有 tool.approve/reject 操作 Runtime Approval。SDK 状态不接受来自模型或客户端的授权决定。批准前重新检查 Run 状态、Grant 有效期/摘要、Assignment、动作参数及最新检查点；不使用 alwaysApprove。
4. 批准决策、动作开始状态和检查点决策在一个 SQLite 同步事务中提交，随后由原 Gateway 执行动作。SDK 恢复回调仅返回已保存动作结果，不能再次执行该副作用。拒绝在 Runtime 阻止后续动作，并映射 SDK reject。
5. 结果与 SDK 恢复之间的崩溃由 Runtime 结果账本消歧：已成功的动作只回传结果；未结算写入标为 result_unknown，等待现有人工核实入口；不把结果未知当失败自动重试。

## 恢复与重放

- RunState 使用现有 Checkpoint 实体，不新增任务、审批或工具事实表。只加载最新代次，验证序列化状态摘要、版本、父子绑定和冻结授权；旧快照、跨 Run/Assignment 和过期授权均拒绝。
- SIGKILL 后从已提交的根 RunState 恢复，重建同一员工图，将 Runtime Approval 映射为 SDK approve/reject；待审批时不发起新的模型或工具请求。
- 若崩溃发生在动作准备完成、原生 RunState 尚未落盘的窄窗口，使用检查点内已接受的根分派响应及员工提案响应重建审批中断，不重新调用 Provider、不执行工具、不重记用量。响应缓存不授予权限，仍绑定当前 Runtime 动作和 Grant。
- 一般模型请求中断后，沿用 Runtime 已保存 Handoff、输出和 ToolResult 重建上下文；不会重做已完成员工。存在运行中副作用或未知结果时先阻止恢复。
- 审批暂停、正常退出与重启均不能把 approval_required 升为 full_access，也不能增加预算、延长 Grant 或换用新员工版本。
- 大文档分批/上下文压缩继续由 Runtime 发出受控续跑请求；不得靠丢弃尚未结算调用突破 Provider 输入上限。超出冻结历史预算应失败或进入现有分批策略，不静默提高预算。

## 验收

确定性测试覆盖：真实 SDK 父子图、按序分派、Handoff 隔离、工具/员工越权拒绝、审批准备的事务回滚、批准/拒绝、过期授权、状态摘要与代次、重复审批、旧快照重放、写入未知结果、预算合并、两个 Run 隔离、恢复不扩权，以及第一二阶段回归。

真实 Electron + Poe 在独立数据库验证：总管路由至两名员工；文档源读取→文档生成→回读→总管验收；待审批安全点 SIGKILL 后以同一 Approval 恢复，批准只写入一次；拒绝不写入；取消不触发后续分派。测试写入仅在专用 fixture 目录；不向真实第三方账户发送消息或创建会议。

对本轮开始时的 48 个未提交文件生成 SHA-256 基线。仅扩展与第三阶段直接相关的已有文件，保留上一阶段实现和证据；无关文件字节保持一致。完成后记录差异、测试与实测门禁，不提交或推送，不提前执行第四阶段依赖删除。
