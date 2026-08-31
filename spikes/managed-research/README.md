# 受管网络调研 Phase 0 Spike

该 Spike 将 Agent Reach 的两条路由知识重建为产品自有 Adapter：

- GitHub 公开仓库搜索：固定 `https://api.github.com/search/repositories`。
- RSS/Atom 读取：只允许用户明确提供的公网 HTTPS URL。

它不安装或执行 `agent-reach`、`gh`、`curl`、`mcporter`、Node、Shell 或任何用户全局 CLI。确定性模式使用内存 Fake Transport，验证：

- 固定方法、Origin/Path、超时、响应体和条目上限。
- 查询参数编码与疑似 Secret 阻断。
- HTTPS、UserInfo、环回、链路本地和云元数据地址拒绝。
- 外部内容始终标记为非可信数据，即使内容包含提示注入文本。
- 两个来源尝试进入带时间和 SHA-256 的统一 Bundle。

## 运行

确定性验证，不访问网络：

```bash
python3 spikes/managed-research/managed_research_spike.py
```

显式只读协议探测，会访问 GitHub REST API 与 GitHub Blog RSS：

```bash
python3 spikes/managed-research/managed_research_spike.py --live
```

参考脚本需要测试 Python，但只使用标准库，不查找或调用上游 CLI/第三方 Python Package；正式产品必须使用应用内固定 Worker Runtime，不能要求用户安装 Python。当前 `--live` 模式为本机已配置的透明代理显式允许 RFC 2544 `198.18.0.0/15` 虚拟 DNS；确定性模式与默认 Transport 仍拒绝该地址。生产实现必须把此例外绑定到用户批准的代理配置，并用出站代理或 OS Sandbox 消除 DNS Rebinding/TOCTOU、限制重定向和连接 IP；Credentialed GitHub 请求禁止跨 Origin 重定向，可选 Token 保存在 Keychain、只注入对应 Runner。
