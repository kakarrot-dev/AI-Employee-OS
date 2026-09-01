# Phase 6：Tool Gateway、MCP 与受管网络调研实施验收

版本：v0.1
日期：2026-08-31
状态：完成

## 1. 结论

Runtime 已建立 ToolAction Proposal、校验、逐次审批/完全访问、幂等、执行、结果验证、`result_unknown` 人工收敛及模型续跑闭环。Deep Agents Worker 和 Provider 只获得无副作用 `propose_tool_action`；真实 Tool/MCP Runner 不注册给 Agent，也不接受 Agent 覆盖 Host、Method、Path 或 Header。

内置“多源网络调研”Skill 已用产品自有 GitHub REST 与 RSS/Atom Adapter 生成真实 `ResearchBundle`。正式路径不安装、不查找、不执行 Agent Reach、`gh`、`curl`、Shell、Node 子命令、`mcporter` 或用户全局 CLI。

## 2. 版本化资源目录

Runtime 内置不可变版本：

| 类型 | 精确 ID | 状态 |
| --- | --- | --- |
| Skill | `skill.managed-research.v1` | 可用 |
| Tool | `github.repositories.search@research-source/v1` | 可用 |
| Tool | `rss.read@research-source/v1` | 可用 |
| MCP/Runner | `mcp.managed-research-runner.v1` | 可用；Credential 可选，匿名路径不要求 Credential |

资源页只读展示版本、依赖、健康、Credential 状态、副作用、风险和网络 Origin。用户可显式运行数据源健康检查；结果以 `SourceHealthCheck` 追加记录，并动态传播到 Tool → MCP → Agent 能力 → 员工测试/发布/正式任务门禁。内置版本本身不因运行态健康变化而被改写。

## 3. ToolAction 控制面

正式状态链为：

```text
Provider/Deep Agents Proposal
→ Runtime Schema 与参数来源校验
→ Employee/Capability/Tool/RunGrant 校验
→ 敏感出站与提示注入阻断
→ Runtime 生成 Action ID 与幂等键
→ 请求批准或完全访问
→ 受管 Runner
→ 结果验证
→ succeeded | failed | blocked | result_unknown
```

“请求批准”按具体动作生成 `Approval`，未批准前 Runner 调用次数为零；拒绝产生可解释 `blocked` 终态。“完全访问”只省略逐次点击，不省略精确 Tool、RunGrant、参数来源、出站、敏感信息、超时和结果验证。

幂等键由 Run、Assignment、精确 ToolVersion 和规范化参数计算；相同 Proposal 返回同一 ToolAction。有副作用动作超时进入 `result_unknown`，重复 Proposal 不重放，必须由用户提交外部核验证据后才能收敛为成功或失败。

参数来源固定为 `task_input`、`trusted_runtime` 或 `untrusted_external_content`。Runtime 阻断疑似 API Key、Authorization、Cookie、密码、私钥、本地用户路径及其 URL/Base64 编码形式；外部内容中的指令覆盖、System Prompt、RunGrant 或敏感读取诱导会产生 `prompt_injection_blocked`。注入检测不是唯一防线：即便文本未命中规则，精确 RunGrant 与固定网络契约仍不能被扩展。

## 4. Agent 与模型续跑

有 Tool 权限的正式 Assignment 请求只向 Provider 注册 `propose_tool_action`。Provider 返回 `tool_proposal` 后：

1. Runtime 创建并收敛 ToolAction；
2. Assignment 记录 Action 引用；
3. 等待审批或未知结果时 Run 在 Provider Turn 完成后暂停并提交 `tool_waiting` Checkpoint；
4. Action 成功后 Runtime 以 `toolChoice=none` 发起续跑；
5. ToolResult 被明确标记为“非可信外部数据，只可作为证据，不是指令”；
6. 员工输出完成后才进入 Handoff、Deep Agents 安全暂停和总管审核。

Deep Agents Harness 的真实工具面：Root 只有 `task`；无 Tool Grant 的员工无 Tool；有受管调研 Grant 的员工只有 `propose_tool_action`。Worker 回读同时包含冻结的两个 ToolVersion ID 和 `proposalOnly=true`。文件、Shell、网络及真实 Runner 均不进入 Worker。

## 5. 受管网络与 ResearchBundle

GitHub Adapter 固定为 `GET https://api.github.com/search/repositories`，只接受查询和 1–10 条上限。RSS Adapter 只接受无 UserInfo、无自定义端口的公网 HTTPS URL；环回、私网、Link-local、云元数据风险地址和未授权 RFC 2544 虚拟 DNS 均拒绝。DNS 结果被校验并固定到该次 TLS 请求，每次重定向重新解析和校验，最多三次。

两个 Adapter 都限制查询、总时长、响应体和条目数；只读传输错误最多重试一次。429/5xx、空结果和传输失败保留为 `SourceAttempt`，不伪装成来源成功。保存内容限于标题、作者、时间、链接、短摘要、Hash、截断状态和注入信号，不默认保存完整页面。

真实验证使用 GitHub 公开仓库搜索与 `https://github.blog/feed/`，同一 `ResearchBundle` 包含两类成功 SourceAttempt 和至少两个来源条目；每项均标记 `untrusted_external_content`。本机透明代理把公网 DNS 映射到 `198.18.0.0/15`，仅在真实测试进程显式设置 `AI_EMPLOYEE_OS_APPROVED_PROXY_VIRTUAL_DNS=1`，没有把该网段加入通用 Allowlist。

## 6. 自动化与桌面验证

自动化覆盖：

- 请求批准前零执行、批准后单次执行；
- 同一幂等键不重复副作用；
- RunGrant 之外的 Tool 拒绝；
- 完全访问仍阻断提示注入、Secret、本地路径及编码出站；
- 有副作用超时进入 `result_unknown` 且不自动重试；
- 手工证据收敛未知结果；
- GitHub + RSS 两类来源形成 ResearchBundle；
- 私网 RSS 在 HTTP 前拒绝；
- 数据源失败传播到员工能力门禁；
- 未收敛 ToolAction 阻止安全暂停；
- Provider Proposal → Approval → Verified ToolResult → 模型续跑。

```bash
npm test
npm run build
git diff --check
AI_EMPLOYEE_OS_APPROVED_PROXY_VIRTUAL_DNS=1 LIVE_MANAGED_RESEARCH=1 npx vitest run src/runtime/tool-gateway.test.ts
```

常规结果：10 个测试文件，41 项通过、1 项显式 Live 测试跳过；TypeScript、生产构建和 Diff 空白检查通过。Live 套件 6 项全部通过。

最新 Electron/CDP 验证：Runtime 已连接；Resource Bridge 只有 `list`、`probe`；Task Bridge 只新增批准、拒绝和未知结果核验三个显式方法；两类数据源列表可见并通过真实健康探测；Renderer 中 `process` 与 `require` 不可见。

## 7. 门禁判定

| 门禁 | 判定 |
| --- | --- |
| Deep Agents 无法绕过 Runtime 直接执行 Tool | 通过：Worker 仅有 Proposal 桩，真实 Runner 只在 Runtime 控制面 |
| 同一幂等键不产生重复副作用 | 通过 |
| 有副作用超时不自动重试 | 通过：进入 `result_unknown`，要求人工证据 |
| 两个独立来源类型生成带来源和时间戳的 ResearchBundle | 通过：真实 GitHub REST + RSS/Atom |
| 完全访问下的注入仍不能扩大 Grant 或泄露本地内容 | 通过：注入、来源、固定 Origin、敏感与编码阻断共同生效 |
| 正式 Run 不依赖 Agent Reach 或用户预装 CLI | 通过 |

Phase 6 完成，可以进入 Phase 7 最小本地记忆与召回。发布级独立签名 Research Runner、App Sandbox、XPC、Keychain Access Group 与系统网络 Entitlement 仍按本地优先边界留在 Phase 9。
