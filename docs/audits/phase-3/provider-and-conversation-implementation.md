# Phase 3：Provider 与总管对话实施验收

版本：v0.1
日期：2026-08-31
状态：本地开发边界完成；Poe 真实调用与 Apple 发布级隔离待外部材料

## 1. 结论

本阶段建立了可运行的 `Renderer → Main → Local Control Runtime → Provider Service → DeepSeek` 纵向闭环。总管消息、回复和 Provider 实际 Usage 由 Runtime 写入本地数据库；Renderer 只接收窄 Bridge 和流式事件。长期 Credential 只由 Provider Service 通过 macOS Keychain 读取，不进入 Runtime 命令、数据库或 Renderer。

Poe 接入面固定为三个精确 Model ID，未配置 Poe Credential 时全部保持 `unverified`，不会因公开模型目录存在而自动启用：

| 角色 | 精确 Model ID | 路径 | 当前状态 |
| --- | --- | --- | --- |
| Claude 文本 | `claude-sonnet-4.6` | Responses + Streaming | Adapter 已实现，真实调用待验证 |
| ChatGPT Image 2 | `gpt-image-2` | Chat Completions，`stream=false` | Adapter 已实现，真实调用待验证 |
| Seedance 视频 | `seedance-2.0` | Chat Completions，`stream=false` | Adapter 已实现，真实调用待验证 |

DeepSeek 基线固定为 `deepseek-v4-pro` + 官方 `/responses`。本阶段复用了 Phase 0 已授权 Credential，并通过生产进程链完成真实流式对话与取消验证；没有读取或输出 Credential 正文。

## 2. 本地进程与 Secret 边界

- Main 分别监管 Runtime Utility Process 和 Provider Utility Process；二者只通过 Electron 继承的私有消息通道通信，不开放 TCP、回环 HTTP 或 Unix 公共端点。
- Runtime 只得到 Provider、精确 Model ID、预算、输入与规范化事件，不得到 API Key。
- Provider Service 是唯一调用 `/usr/bin/security` 和 Provider 官方 Origin 的进程。Keychain 调用使用 `execFile` 参数数组，不通过 Shell、命令行 Secret 或环境变量传值。
- Renderer 不能读取数据库、Keychain 或通用 `ipcRenderer`；Provider Bridge 只暴露状态，Conversation Bridge 只暴露发送、取消、历史和事件订阅。
- 本地未签名开发包尚不能形成真实 Keychain Access Group、App Sandbox `network.client` 和 XPC Code Requirement 隔离。用户已将 Apple 签名、Profile、公证和发布级 Helper 验证延期到 Phase 9；本阶段不把 Utility Process 边界冒充发布级安全证明。

## 3. Adapter 契约

统一内部事件只包含：文本增量、结构化结果、Tool Proposal、媒体结果、Provider 实际 Usage、完成和稳定错误码。Adapter 固定官方 Origin，拒绝 Allowlist 外模型和非法输出预算；Tool 事件只能形成 Proposal，不在 Provider 进程执行本地 Tool。

DeepSeek 自动化测试覆盖：

- 非流式文本、语义 Streaming、Provider 实际 Usage 和完成事件；
- JSON Schema 请求与结构化结果；
- Function Tool Proposal 的参数规范化；
- HTTP 401、429 和 Retryable 属性映射；
- 流提前终止拒绝；
- 固定官方 `/responses` Origin。

Poe 自动化测试覆盖图像与视频的分离非流式路径；真实媒体引用、Points、超时和错误外形必须等 Poe Credential 配置后分别探测。

## 4. 总管对话与恢复

Runtime 是 Conversation、Message、BudgetLedgerEntry 和 Audit Event 的唯一写入者。每次发送先保存用户消息，再提交固定 DeepSeek 请求；只有收到 Provider `completed` 后才保存不可变助手消息。取消或失败不会保存半截助手消息。

真实闭环验证结果：

| 场景 | 结果 |
| --- | --- |
| 流式对话 | `deepseek-v4-pro` 返回预期文本，Runtime 保存 1 条用户消息、1 条助手消息和 1 条 `provider_actual` Usage |
| 重启恢复 | 使用同一隔离数据库重启 Electron 后，Runtime Schema v2 恢复，历史两条消息重新投影到界面 |
| 立即取消 | Runtime 接受取消，终态事件为 `failed/cancelled`；历史仅有用户消息，无助手消息和 Usage |
| 取消后数据库 | `Conversation=1`、`Message=1`、Audit Event `=2`、`PRAGMA quick_check=ok` |
| 敏感元数据扫描 | Entity JSON 中 `credential`、`authorization`、`api_key` 匹配数为 0 |

## 5. 验证命令与结果

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

结果：TypeScript 检查通过；7 个测试文件、22 个测试通过；Main、Runtime、Provider、Preload 和 Renderer 生产构建通过；Diff 空白检查通过。

## 6. 门禁判定

| 门禁 | 判定 |
| --- | --- |
| Secret 不进入日志、数据库和 Agent Context | 本地实现通过；数据库元数据扫描无匹配，当前尚未引入 Agent Worker |
| Worker 中不存在 Provider Secret | 协议设计通过；真实 Worker 进程在 Phase 5 引入后做进程级复验 |
| 至少一个真实 Provider 完成流式对话和结构化输出 | 通过：`deepseek-v4-pro`；结构化输出已有 Phase 0 真实探测和生产 Adapter 测试 |
| Tool Calling、Usage、取消和错误有真实探测记录 | 通过：Phase 0 真实探测；本阶段另完成真实 Usage 落账和真实取消 |
| 重启后读取历史且不泄漏 Secret | 通过 |

Phase 3 在用户授权的本地运行边界内完成，可以进入 Phase 4。Poe 三模型未因缺少 Credential 被伪标为可用；发布级签名/XPC/Keychain Access Group 以及 Worker 无网的动态证明分别留在 Phase 9 和 Phase 5 对应门禁中。
