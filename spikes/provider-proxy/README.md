# Provider 本地代理 Phase 0 Spike

该 Spike 不调用 Poe 或 DeepSeek，也不证明真实模型能力。它使用本机 Fake Upstream 验证 Provider 代理的最小安全边界：

- Runtime/Provider 持有上游 API Key，Worker 环境和参数中只有短期本地 Grant。
- 本地代理只监听 `127.0.0.1`，校验 Grant 的签名、过期时间、Run、Provider、模型和输入/输出预算。
- Worker 请求不能携带或覆盖 `Base URL`、模型和未授权 Tool。
- Provider 将流式输出、结构化结果、Tool Proposal、实际 Usage 和错误转换为版本化内部事件。
- 取消会终止本地请求并关闭上游连接；审计记录不包含 Prompt 或 Secret。

Fake Upstream 的固定字符串仅是测试夹具，不是产品 Credential。生产实现仍必须从 macOS Keychain 获取真实 Secret，并另行验证代码签名、ACL、升级和崩溃场景。

## 运行

```bash
python3 spikes/provider-proxy/provider_proxy_spike.py
```

脚本只使用 Python 标准库，无外部依赖、无网络请求、无持久化测试数据。成功时输出一组全部为 `passed` 的断言结果。

## 真实 DeepSeek 门禁

真实探测与确定性 Spike 分离，默认不会读取 Credential 或联网：

```bash
python3 spikes/provider-proxy/real_deepseek_probe.py --model '<精确 Model ID>'
```

只有用户明确授权余额消耗后，才添加确认参数：

```bash
python3 spikes/provider-proxy/real_deepseek_probe.py \
  --model '<精确 Model ID>' \
  --acknowledge-paid-request
```

用户明确授权读取已配置的 Keychain 项时，也可传入非敏感的 Service 名称：

```bash
python3 spikes/provider-proxy/real_deepseek_probe.py \
  --model '<精确 Model ID>' \
  --keychain-service com.kakarrot.ai-employee-os.credentials.v2 \
  --acknowledge-paid-request
```

脚本默认从交互 TTY 隐藏输入 API Key，或从明确指定的 macOS Keychain Service 读取；不接受命令行参数或环境变量中的 Key。它使用固定 DeepSeek Origin 和极小 Token 上限，依次验证非流式响应、Usage、流式终止、JSON 本地 Schema、单个无副作用 Proposal Tool、禁止 Tool、连接取消、无效模型和无效认证；不打印 Prompt、响应正文或原始错误正文。

取消验证只能证明客户端在首个 Delta 后关闭连接，不能从客户端证明 Provider 已停止计费。脚本也不会故意制造 429 或余额不足，以免伤害账户或服务。真实输出是敏感运行证据，提交前仍须检查其中的 Request ID 是否适合公开。

### Responses API 首选协议探测

`real_deepseek_probe.py` 保留 Chat Completions 兼容性证据；产品首选协议使用独立工具：

```bash
python3 spikes/provider-proxy/real_deepseek_responses_probe.py \
  --model '<精确 Model ID>' \
  --keychain-service com.kakarrot.ai-employee-os.credentials.v2 \
  --acknowledge-paid-request
```

该工具按 DeepSeek 官方 Responses 契约解析语义 SSE，以 `response.completed` 为正常终态，不等待 `[DONE]`；使用 `text.format=json_schema`、扁平 Function Tool Schema 和 Responses Usage 字段。隐藏推理事件只作为取消活动信号，不记录正文。

## Poe 公开模型目录

公开目录分析不读取 Credential，也不产生 Poe Points 消耗：

```bash
python3 spikes/provider-proxy/poe_model_catalog.py
```

也可以对已经下载的原始 JSON 做确定性复核：

```bash
python3 spikes/provider-proxy/poe_model_catalog.py \
  --input /path/to/poe-models.json \
  --retrieved-at '<ISO-8601 timestamp>'
```

脚本只保留数量、Hash、Owner/Endpoint/Feature 汇总以及产品 Allowlist 的能力元数据，不保存模型描述。当前 Allowlist 固定为 `claude-sonnet-4.6`（文本）、`gpt-image-2`（图像）和 `seedance-2.0`（视频）；图像、视频使用 Chat Completions 非流式路径，不能复用 Claude 的 Responses Streaming Adapter。目录证据不能证明当前账户可调用、真实协议行为、语义质量或实际 Points 消耗；这些结论仍需要用户明确配置 Poe Credential 后按精确 Model ID 真实探测。
