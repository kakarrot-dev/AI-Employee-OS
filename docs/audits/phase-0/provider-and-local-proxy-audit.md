# Phase 0：Poe、DeepSeek 与 Provider 本地代理审计

日期：2026-08-31

结论状态：协议与本地隔离已完成；真实模型门禁待凭证验证

## 1. 决策

**Poe 与 DeepSeek 保留为 MVP 的两个固定 Provider，但只能通过独立 Adapter 接入；本轮不把任何模型标记为“已验证可用”。**

- **协议 Go：** 两家官方接口都能覆盖文本对话、流式输出、函数调用、结构化输出、Usage 和可分类错误，具备进入真实调用验证的基础。
- **隔离 Go：** 确定性 Spike 已证明上游 API Key、固定 Base URL、模型 Allowlist、预算校验与协议转换可以留在 Provider 进程，Worker 只需短期本地 Grant。该 Spike 使用的回环地址已被后续多进程安全审计修订为 `Worker → Runtime 私有 Pipe/UDS → Provider XPC/签名 Helper`，避免给 Worker 网络 Client 权限。
- **直接兼容层 No-Go：** 两家都存在“接受但静默忽略”参数，且 Tool、结构化输出、Streaming 终止、状态保持与推理内容语义不同，不能用一个通用 OpenAI Client 加配置项代替独立 Adapter。
- **Phase 0 门禁未关闭：** 当前没有使用用户的 Poe 或 DeepSeek Credential，也没有产生付费请求；“至少一个真实模型完成 Streaming + 结构化输出 + Tool Proposal + Usage + 取消 + 错误探测”仍待验证。

## 2. 证据等级

本文严格区分三类结论：

1. **官方声明：** 只证明当前文档描述了该能力。
2. **无凭证协议探测：** 只证明公开端点、HTTP 状态、响应外形或认证边界。
3. **真实模型探测：** 必须使用有效 Credential 调用明确 Model ID 才能证明；本轮没有此类证据。

因此，模型配置中的能力标志必须来自“Provider + 精确 Model ID + Endpoint + Adapter 版本”的实测记录，不能从 Provider 级文档或 OpenAI 兼容标签继承。

## 3. 当前官方能力快照

### 3.1 Poe

官方 OpenAI 兼容接口同时提供 `/v1/chat/completions` 与 `/v1/responses`。MVP 文本路径选择 **Responses API 作为首选协议**，原因是它明确提供 `text.format` JSON Schema；Chat Completions 的 `response_format` 被忽略。

| 能力 | 当前官方事实 | 产品约束 |
| --- | --- | --- |
| Base URL | `https://api.poe.com/v1` | 固定在 Adapter，不允许用户或 Worker 覆盖 |
| 模型枚举 | `/v1/models` | 只作为候选目录；保存前仍须逐模型探测 |
| Streaming | Chat Completions 声明完整支持；Responses 提供语义流 | Adapter 转为内部事件，不透传原始 SSE |
| Tool Calling | Chat Completions 声明支持 `tools`、`tool_choice`、`parallel_tool_calls` | 只发送产品冻结的 Proposal Tool；最多接受一个 Call |
| 严格 Tool Schema | Chat Completions 的 `strict` 被忽略 | 本地再次解析并校验参数；失败即拒绝 Proposal |
| 结构化输出 | Responses 的 `text.format` 支持 JSON Schema；Chat Completions 不支持 | 使用 Responses；仍执行本地 Schema 校验 |
| Usage | Chat Completions 返回 prompt、completion、total token | 标记为 `provider_actual`，保留 Provider Request ID 与计量来源 |
| 状态保持 | Responses 支持 `previous_response_id` | MVP 不使用；对话与恢复事实源保持在本地 Runtime |
| 计费 | API Key 所属账户消耗 Poe Points；付费模型要求订阅或 Add-on Points | 建立账户级预算与低余额错误，不把 Point 等同于 Token 成本 |
| 限流 | 官方声明每用户每分钟 500 请求 | 解析请求限流 Header 和 `Retry-After` |

主要依据：[Poe OpenAI Compatible API](https://creator.poe.com/docs/external-applications/openai-compatible-api)、[Poe External Application Guide](https://creator.poe.com/docs/external-applications/external-application-guide)。

### 3.2 DeepSeek

DeepSeek 当前同时提供 Chat Completions 与 Responses API。MVP 首选 **Responses API** 以统一处理 Streaming、函数调用、结构化结果和 Usage，但 Adapter 必须主动收窄其兼容行为。

| 能力 | 当前官方事实 | 产品约束 |
| --- | --- | --- |
| Base URL | `https://api.deepseek.com` | 固定在 Adapter，不允许用户或 Worker 覆盖 |
| 当前模型目录 | `deepseek-v4-flash`、`deepseek-v4-pro`、`deepseek-v4-flash-vision-exp` | 精确 Model ID 保存；不把文档目录当实时可用证明 |
| Streaming | Responses 使用语义 SSE；以 `response.completed`、`incomplete` 或 `failed` 结束，没有 `[DONE]` | Adapter 独立解析；忽略空行与 `: keep-alive` |
| Tool Calling | Function Tool 支持；`parallel_tool_calls` 被忽略且始终并行 | 禁用服务端 Tool；只传 Proposal Function；多 Call 直接拒绝 |
| 结构化输出 | Responses 的 `text.format` 完整支持；Chat Completions 提供 JSON Object | 使用 JSON Schema，并在本地二次校验 |
| Usage | 返回 input、output、cached 与 reasoning token | 只记录计量值，不记录或展示隐藏推理正文 |
| 推理内容 | Streaming 可返回 `response.reasoning_text.*` | Adapter 丢弃正文事件；不得进入日志、Trace、记忆或客户端 |
| 状态保持 | `previous_response_id` 与 Conversation 不支持，API 无状态 | Runtime 始终提供所需本地上下文 |
| 不支持参数 | 多项参数会静默忽略 | Adapter 只发送明确支持的字段，不能靠错误响应探测支持度 |
| 限流与长等待 | 超并发返回 429；等待时可能发空行或 keep-alive；10 分钟未开始推理会断开 | 独立连接/首 Token/总时长超时，支持用户取消 |

主要依据：[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)、[Responses API](https://api-docs.deepseek.com/guides/responses_api/)、[Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit/)。

## 4. 无凭证协议探测

探测时间：2026-08-31；请求未携带 API Key，也未发送用户内容。

| 请求 | 观测 | 能证明什么 |
| --- | --- | --- |
| `GET https://api.poe.com/v1/models` | HTTP 200；当前返回 349 个条目，含 ID、Owner、上下文、支持端点、特性和可选价格字段 | 模型目录当前公开且可机器读取；不证明任一模型可被当前账户调用 |
| `POST https://api.poe.com/v1/chat/completions` | HTTP 400，`missing_api_key` | 当前缺 Key 的错误外形；不代表所有 Poe 错误都符合文档表 |
| `GET https://api.deepseek.com/models` | HTTP 401，纯文本 `Authentication Fails (governor)` | 模型枚举也受认证；错误不一定是 OpenAI JSON |
| `POST https://api.deepseek.com/chat/completions` | HTTP 401，同样为纯文本 | Adapter 必须容忍非 JSON 认证错误 |

Poe 目录中的价格、模型和能力元数据是易变外部事实。产品可以缓存带时间戳的候选快照，但不能把它写死为产品能力或历史 Run 的价格事实；Run 必须冻结当时使用的 Model ID、价格元数据来源和实际 Usage。

## 5. 统一内部契约，而非统一厂商配置

Runtime 只向 Provider 代理发送版本化内部请求，最小字段为：

- `request_id`、`run_id`（后者绑定在 Grant 中）
- 已脱敏输入或消息
- 冻结的 Proposal Tool Schema
- 输出 Schema
- 最大输入、最大输出、首 Token、总时长和金额预算
- 是否流式、取消关联 ID

Worker 请求中**不得出现** Provider API Key、Provider Base URL、任意 Model ID、服务端 Web Search、MCP、Computer Use 或其他厂商内置 Tool。Provider Adapter 从短期 Grant 解析固定 Provider、精确 Model ID 和预算，从签名配置解析固定 Base URL，再从 Keychain 取 Credential。

内部响应事件至少包括：

- `output_delta`
- `structured_result`
- `tool_proposal`
- `usage`
- `completed` / `incomplete` / `cancelled` / `failed`

两家原始错误统一映射到稳定错误码，但保留不含 Secret/Prompt 的 Provider、HTTP 状态、Request ID 和可重试建议。认证失败、余额不足、限流、模型不存在、输入超上下文、首 Token 超时、总时长超时、上游不可用和输出不合法必须区分。

## 6. 本地 Provider 代理 Spike

可执行证据位于 [`spikes/provider-proxy`](../../../spikes/provider-proxy/README.md)。Spike 只使用 Python 标准库和本机 Fake Upstream，不发起外网请求。

运行命令：

```bash
python3 spikes/provider-proxy/provider_proxy_spike.py
```

本轮结果：

| 验证项 | 结果 |
| --- | --- |
| Worker 环境与参数不含上游 Credential | 通过 |
| Provider 给固定上游注入 Credential | 通过，Fake Upstream 观察到 5 个认证请求 |
| HMAC 短期 Grant 的签名与过期时间 | 通过；过期 Grant 被拒绝 |
| 固定模型、输入/输出预算和 Tool Allowlist | 通过 |
| Worker 覆盖 `base_url` 或 `model` | 被拒绝 |
| Streaming、结构化结果、本地 Schema 校验 | 通过 |
| Tool Proposal 聚合、本地参数校验、实际 Usage | 通过 |
| 401、429 与 `Retry-After` 规范化 | 通过 |
| 取消传播与上游连接关闭 | 通过；Fake Upstream 观察到断连 |
| 审计事件、Worker stdout/stderr 不含上游 Credential | 通过 |

该 Spike 证明的是协议和进程职责可行性，不证明 Python 标准库实现可以直接进入生产。后续 [macOS 多进程 Keychain、签名与网络沙箱审计](macos-process-keychain-sandbox-audit.md) 已排除 Worker 回环 TCP，生产实现改为 Runtime 私有 Pipe/UDS 中继到 Provider XPC/签名 Helper，并仍须覆盖 Grant 的 Audience/Nonce/单次使用与重放防护、Peer Identity、Data Protection Keychain Access Group、真实代码签名、崩溃清理和内存清零。

## 7. 保存时真实模型探测计划

每个模型配置必须记录探测时间、Provider、精确 Model ID、Endpoint、Adapter 版本和原始 Request ID。探测按以下顺序执行，并设置极小 Token/金额预算：

1. 普通非流式响应与实际 Usage。
2. 流式文本、首 Token、正常终止和 keep-alive。
3. JSON Schema 结构化输出，并执行本地校验。
4. 单个无副作用 Proposal Tool，校验 Call ID、名称和参数。
5. 明确要求不调用 Tool，以及诱导多个 Tool Call；确认 Adapter 拒绝越界。
6. 用户取消，确认客户端、Runtime、Provider 和上游连接收敛。
7. 无效 Model ID、超上下文、超时、429、余额不足和认证失败的错误映射。
8. 确认 Prompt、响应、隐藏推理和 Credential 不进入不允许的日志与 Trace。

真实探测只允许使用用户明确配置的 Credential，并会消耗 Poe Points 或 DeepSeek 余额。缺少 Credential 时配置保持 `unverified`，不能凭官方文档自动启用总管或员工角色。

## 8. 门禁结果

| Phase 0 Provider 门禁 | 结果 |
| --- | --- |
| 固定 Poe、DeepSeek 官方 Provider 与 Base URL | 通过 |
| 两个独立 Adapter 的协议差异与收窄规则 | 通过 |
| 模型枚举、价格和能力元数据边界 | 通过（协议级） |
| Worker 不接触 API Key 的本地代理路径 | 通过（确定性 Fake Upstream） |
| 任意 Base URL、模型和 Tool 覆盖被拒绝 | 通过 |
| 取消、错误、Usage 与日志脱敏内部契约 | 通过（确定性 Fake Upstream） |
| 至少一个真实模型完成全套能力探测 | **未通过：本轮未使用 Credential** |
| Keychain/签名/网络架构 | 已由后续多进程安全审计选型；真实 Apple 签名包、升级和崩溃恢复未验证 |

**当前判定：Provider 协议和本地隔离方案允许进入实现准备；在真实模型门禁通过前，Phase 0 Provider 子审计不得标记完成，也不得声称 Poe 或 DeepSeek 已可用于生产 Run。**
