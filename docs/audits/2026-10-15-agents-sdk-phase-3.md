# 第三阶段：Poe 总管、团队执行与审批恢复验收

日期：2026-10-15。结论：**Poe 限定范围通过**。新建且总管、全部员工均使用 `claude-sonnet-4.6` 的 Run 采用 `openai-agents-ts-v2`；任务、权限、审批、工具执行和交付验收仍由现有 Runtime 决定。未替换已安装客户端、操作生产数据库、修改凭据、提交或推送；未进入第四阶段依赖清理。

实施依据：[阶段契约](2026-10-15-agents-sdk-phase-3-contract.md)。机器证据：[阶段验收 JSON](evidence/2026-10-15-agents-sdk-phase-3.json)。第一、二阶段的报告和证据继续保留。

## 实现边界

| 职责 | 当前实现 |
| --- | --- |
| 总管理解与路由 | 真实 SDK Agent/Runner 经现有 Provider IPC 调 Poe；SupervisorRouter 验证可用员工及任务输入，再创建原 Task/Assignment，冻结随后执行的成员和顺序。平台指令使用 system，用户、附件和记忆数据保留为 user 内容。 |
| 团队执行 | 根总管与冻结员工 `agent.asTool()` 图；每次只能分派 Runtime 当前 Assignment。员工输入来自冻结任务和 Runtime 上下文，不接受模型改写目标或扩权。 |
| 员工工具 | SDK 只注册提案函数，复用 TaskService 的草稿/来源/范围绑定与 ToolGateway；写入内容仍取已保存草稿，回读路径仍取实际写入结果。 |
| 审批 | 原 Approval 是授权事实，SDK needsApproval 只准备动作。根 RunState 保存完成前不接受批准；批准/拒绝、动作状态和恢复检查点在 SQLite 同步事务中提交，工具副作用在提交之后执行。 |
| 恢复 | SDK `0.20.0`、员工图、父子关系、调用 ID、动作参数摘要、冻结 Grant、检查点代次与内容摘要一起核对。已成功工具只回传结果，运行中写入在重启后成为 `result_unknown`。 |
| 交接与交付 | 原 Handoff audience、依赖顺序、Python 交接检查、总管逐项审核、Artifact/Evidence 和 Delivery 门禁继续生效；SDK finalOutput 不代表任务成功。 |
| 预算与凭据 | 分派、员工和总管审核计入同一 Run 的 provider_step/实际 Token 账本；沿用冻结预算和截止时间。凭据仍只进 Provider 子进程，SDK 云端 tracing 关闭。 |

准备动作后、原生 RunState 尚未提交时崩溃，使用检查点内已经接受的分派响应和员工提案响应重建中断，不重新调用 Provider、不执行工具、不重复记录 Token。普通模型中断则丢弃过期 continuation，依据 Runtime 已保存事实重建；已完成员工和工具不会重做。

正常退出会停在模型/工具之间的安全点；新进程消费旧退出标记并保留审计记录。未结算工具保持等待审批或人工核实。重试 SDK 任务保留原员工版本、总管、审批模式与预算，不沿用旧路径的自动 full_access 升级。

## 确定性验证

50 个后台测试文件，**345 项通过、3 项原有跳过、0 项失败**；Node/Web 类型检查及 Electron Vite 构建通过。使用已有已签名 helper，未重新编译 native helper。

新增团队执行测试 27 项、总管执行测试 2 项，并扩展 Gateway 测试。覆盖真实 SDK 父子图、按序分派、两项 Run 交错、越权工具纠正上限、动作参数篡改、过期授权、旧检查点与状态损坏、事务回滚、重复执行抑制、批准/拒绝、普通模型中断、交接后中断、待审批恢复、准备动作后崩溃、写入未知结果、正常退出及人工核实到最终交付的闭环。

```sh
npm run typecheck
npx vitest run src/runtime src/provider src/main src/shared --reporter=json
npx electron-vite build
```

## 真实 Electron + Poe

全部使用独立数据库、fixture 员工和专用目录。模型、Provider 子进程、Keychain helper、Runtime、DOCX 读取、本机文档写入/回读和交付验收均为真实执行。审批通过现有 Tool RPC 处理；未声明确认卡的人工视觉验收已完成。

| 用例 | SDK 模型请求 | 实际结果 |
| --- | ---: | --- |
| 总管调用双人组：读取员 → 文档员 | 13，含会话路由 | DOCX 真实提取；指定文件独占创建一次，回读 SHA-256 一致；两名员工成功，Task/Delivery 成功。 |
| 待审批点 SIGKILL → 相同 Approval 恢复 | 7 | 等待期间新增模型请求 0；Grant 不变；批准后只创建一次并成功回读、交付。 |
| 拒绝写入 | 4 | 原 Approval rejected，SDK 原生拒绝状态已保存；动作 blocked、文件不存在、无 Delivery。 |
| 取消首名员工请求 | 2，其中 1 次被取消 | Provider 返回 cancelled；下游员工保持 pending，未调用工具、无 Delivery。 |
| 模型调用中退出 → 安全暂停 → 重启 | 5 | 暂停前无工具动作；重启消费旧退出标记，Grant 不变，读取与交付成功。 |
| 最终构建再次实测待审批 SIGKILL 恢复 | 7 | 相同 Approval、0 次等待期间请求、一次写入、回读与 Delivery 再次通过。 |

主四用例记录位于本次 `sdk-migration/stage-3/acceptance-v2`；最终构建补验位于 `final-restart`、`final-approval`。完整绝对路径、请求/任务/动作 ID、状态摘要、Token、文件 SHA-256 和原始报告 SHA-256 已收录验收 JSON。

双员工用例的 Run 有 12 次实际 Token 回执，另 1 次会话路由单独入账，该 Run 的输入输出合计 44,064 Token（不含会话路由）；其中 4 次为执行期总管分派。本阶段证明治理和恢复成立，**不等于模型调用数、Token 或安装体积已经优化**。Poe 金额与取消请求最终计费仍未验证。

## 实测失败及修复

- 首轮子员工重新调用缺少完整冻结验收标准，选错文件名并提议重复创建，被 Runtime 拒绝。现在每轮显式带入冻结目标、验收与目录；仅替换已过时的 Runtime 策略消息，保留所有函数调用和结果。
- 总管曾将技术校验状态列为业务指标，被原 Delivery 契约拒绝并触发返工。现在把现有交付文案契约加入 SDK 审核的 system 指令，没有放宽指标来源或交付证据校验。
- 路由曾返回空员工集合和空验收标准，被 Router 拒绝。已将可信平台契约与用户/附件数据分角色发送。
- 恢复测试复现并修复：过期 continuation 冲突、退出误报授权过期、重试自动扩权、旧 Run 回调污染新 Run、实时未知写结果无法续跑，以及旧退出标记导致人工核实后再次暂停。保留失败用例及原始实测报告。

## 修改保留及后续门禁

迁移最初的 **27 个用户未提交文件逐一 SHA-256 一致**。本阶段开始时的 48 个未提交文件，仅扩展与迁移直接相关的 Runtime 文件和迁移报告；其他文件保持字节一致。HEAD 和暂存区未变化，没有提交或推送。

DeepSeek 实测、真实第三方消息/日历副作用、大文档的 SDK 历史压缩实测、Poe 金额核算、安装包与人工界面验收仍是后续门禁。历史 Run 与旧执行路径、Python/DeepAgents 交接检查继续保留；本轮不移除依赖。
