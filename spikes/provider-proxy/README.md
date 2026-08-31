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
