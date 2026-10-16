# OpenAI Agents SDK TS 分阶段迁移验收

日期：2026-10-15。结论：阶段 1、2 在下述限定范围内通过。范围：Provider 协议与单员工执行层。用户已确认保留 Runtime 的任务、权限、审批和工具网关；DeepSeek Keychain 读取超时后，用户确认本阶段先用 Poe 完成实测。未操作正式用户数据库、已安装客户端或现有 Credential。

第三阶段已另行完成 Poe 总管、团队和审批恢复迁移，结果见 [第三阶段验收](2026-10-15-agents-sdk-phase-3.md) 与 [阶段证据](evidence/2026-10-15-agents-sdk-phase-3.json)。下文保留第一、二阶段的实现快照与历史验收范围。

## 阶段 2 实现快照

| 层 | 实现与权威来源 |
| --- | --- |
| 执行器 | 精确锁定 `@openai/agents-core@0.20.0` 和 `zod@4.6.7`，打入 Electron Runtime bundle |
| 启用范围 | 新建或重试产生的新 Run；单员工；Poe `claude-sonnet-4.6`；`full_access`；授权工具均为 `none`/`external_read` |
| 版本选择 | `Run.employeeExecutor = openai-agents-ts-v1`；缺少该字段的历史 Run 保留旧路径 |
| 模型与工具循环 | SDK Agent/Runner；仅注册 `propose_tool_action`，每轮只接受一个提案 |
| 工具控制 | 复用 `TaskService.toolProposalContext`、`canAcceptToolProposal`、`ToolGateway.propose` 和 `attachToolAction` |
| 状态与验收 | Runtime 决定下一请求、暂停、失败、交接、返工及 Delivery；SDK `finalOutput` 不改变任务验收状态 |
| 预算 | `provider_step` 绑定实际发送的完整 SDK 历史、估算和 SHA-256；沿用冻结步数、输出上限与截止时间；SDK 重启恢复不扩大冻结授权 |
| 恢复 | 现有 Runtime 检查点和 ToolAction 重建上下文；本阶段不持久化 SDK RunState |
| 数据边界 | SDK 云端 tracing 关闭；Secret 仍只由 Provider 子进程读取；无新增 Renderer/Main 密钥路径 |

团队、总管编排、审批/写操作、DeepSeek 和 Python 交接检查仍由现有实现承担。本阶段没有删除 Python/DeepAgents 依赖。

## 阶段 1：Provider 协议

新增 `ProviderConversationInput`（内部 `schemaVersion=2`），支持分角色消息、instructions、多个工具定义、具名 tool choice、function call 和 result，并保留原字符串请求。外层 IPC 仍为版本 1，历史调用方保持兼容。

输入校验拒绝孤立结果、重复 call ID、未结算历史调用、未知字段、非法角色及工具注册冲突。Responses 解析器处理 UTF-8/SSE 分块、CRLF、EOF、真实 `call_id`、流取消和 Token 上限；只有完整终态才释放工具提案。缺少终态、未知函数及不完整函数参数均停止执行。

真实 Poe 用例已覆盖工具提案、工具结果往返、流式输出、结构化输出、截断和首个 delta 后取消。DeepSeek 完成离线协议覆盖，真实调用仍是后续启用门禁。

实测复现并修复的 Poe 差异：

1. 顶层 `instructions` 连续两次未生效；同样指令以 `system` 消息发送连续两次生效。Adapter 对 v2 请求发送 system input item。
2. Token 上限响应发送 `response.completed`，内部却是 `status=incomplete` 且无原因。仅当实际输出用量达到请求上限时将其归为截断；函数参数仍必须完整。
3. Claude 原生结构化输出拒绝 `uniqueItems`，原总管请求 HTTP 400。仅投影该约束到兼容 Schema，并在返回端按原始 Schema 验证数组唯一性；相同总管请求实测 HTTP 200。

## 阶段 2：单员工执行层

确定性覆盖：真实 SDK 循环与 Runtime/ToolGateway 集成、调用/结果角色与 ID、结果只编码一次、完整历史预算、截断续写、步骤上限、越权工具、并行提案、受阻工具暂停、恢复时保留冻结预算，以及历史/DeepSeek/团队/审批/写操作的路径隔离。

Electron 实测使用独立数据库和已冻结的测试员工版本，模型请求通过实际 Provider utilityProcess、已有 Keychain helper 与 Poe。测试员工为隔离 fixture，没有改动正式员工或发布测试记录。

阶段结果以 [验收证据](evidence/2026-10-15-agents-sdk-migration.json) 为准。原始逐事件记录保存在本次本地 `sdk-migration` 验证目录。

| 实际 Electron 用例 | SDK 模型调用 | 原控制层模型调用 | 结果 |
| --- | --- | --- | --- |
| 单员工文本计算 | 1 | 1 次总管验收 | Task 与 Delivery 成功 |
| 授权 DOCX 读取并复述英文标记 | 2 | 1 次总管验收 | 真实本地读取，ToolAction 成功且结果已验证，Task 与 Delivery 成功 |
| SDK 运行首个 delta 后取消 | 1 | 0 | Provider 返回 `cancelled`，Run 按原语义失败，无隐藏重试或 Delivery |

后台回归：42 个测试文件，289 项通过、3 项跳过；Node/Web 类型检查和 Electron Vite 构建通过。新增执行层测试 17 项。迁移前 27 个未提交文件逐一 SHA-256 核对一致，暂存区和 HEAD 均未变化。

## 保留的问题与后续门禁

- 真实 GitHub 工具调用被已有 `ssrf_target_blocked` 拒绝，保留失败记录；本次没有修改 SSRF 或代理配置。
- 已读取的文档正文数字被总管列成 `keyResults` 时，现有指标证据规则拒绝该数字来源，导致返工后失败。本次保留该交付层问题，文本复述单独验证。
- 成功请求的 Poe 实际 Token 已进入原 BudgetLedger；取消请求的最终计费用量、Poe Points/美元金额换算仍待验证。
- 多员工与 SDK RunState、审批恢复、并发取消、跨进程重放及大文档历史压缩属于阶段 3 门禁；通过后再考虑删除旧循环与 Python worker。
- DeepSeek 完成真实 Provider 和员工执行验证后，才能进入 SDK 启用范围。
- 最终安装包、Apple 签名与公开分发仍需独立验收。

验证命令：

```sh
node_modules/.bin/vitest run src/runtime src/provider src/main
npm run typecheck
node_modules/.bin/electron-vite build
```

构建直接使用已签名 native helper，未重建或修改其 Keychain 访问身份。此次不提交或推送代码，已有未提交文件按迁移前 SHA-256 清单核对。
