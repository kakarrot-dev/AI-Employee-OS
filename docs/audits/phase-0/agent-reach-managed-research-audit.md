# Phase 0：Agent Reach 与受管网络调研审计

日期：2026-08-31

结论状态：已完成

审计基线：Agent Reach `v1.5.0`，源码 Commit `f65526cbaaad3879473acc1ba6dbefd195caf2be`

## 1. 决策

**No-Go：不把 Agent Reach 包、Skill、Installer、Doctor 或其 Shell 命令链作为产品运行时。Go：只把固定源码中的渠道选择知识作为人工审计输入，在产品内重建独立、版本化、最小权限的 Tool Adapter。**

- **MVP Go：** 首批受管来源固定为 GitHub 公开仓库搜索与 RSS/Atom 读取。确定性 Spike 和本轮真实只读协议探测都已通过，且不依赖用户全局 Python、Node、Shell 或 CLI。
- **Conditional：** Exa Search 与 Jina Reader 技术上可通过受管 HTTP/MCP 重建，但查询或目标 URL 会发送给第三方服务；Credential、计费、数据使用、用户披露和服务协议尚未形成产品闭环，不进入首批默认来源。
- **No-Go/延期：** 依赖浏览器登录态、Cookie、非官方抓取、媒体下载、全局 CLI 或第三方转写的社交、视频、招聘、播客和金融渠道不进入 MVP。
- **安全边界：** Agent 只调用产品冻结的 `github.repositories.search`、`rss.read` 等 Tool Schema；不能生成 Shell、选择可执行文件、拼接 Base URL、读取浏览器 Cookie 或触发安装/更新。

Agent Reach 本身是 MIT，但这只覆盖其代码，不授予第三方 CLI、远端服务、平台内容或用户会话的使用与再分发权。固定来源见 [Agent Reach v1.5.0 Release](https://github.com/Panniantong/Agent-Reach/releases/tag/v1.5.0) 与 [源码快照](https://github.com/Panniantong/Agent-Reach/tree/f65526cbaaad3879473acc1ba6dbefd195caf2be)。

## 2. 为什么不能直接嵌入

### 2.1 它是安装/诊断层，不是执行 Gateway

固定源码的 `AgentReach` 只提供 Doctor；模块注释与基类明确说明安装后由 Agent 直接调用 `twitter-cli`、`yt-dlp`、`mcporter`、`gh` 等上游工具。上游 README 还要求 Agent 具备 Shell/Exec 权限。这与本产品“所有真实动作必须经过 Runtime、Agent 不能执行 Shell”的不变量直接冲突。

依据：[固定 `core.py`](https://github.com/Panniantong/Agent-Reach/blob/f65526cbaaad3879473acc1ba6dbefd195caf2be/agent_reach/core.py)、[固定 README](https://github.com/Panniantong/Agent-Reach/blob/f65526cbaaad3879473acc1ba6dbefd195caf2be/README.md)。

### 2.2 Installer 会改变用户全局环境

固定 Installer 会按环境执行或建议执行 `apt`、Homebrew、全局 `npm`、`pipx`、`uv tool`，安装 Node、`gh`、`mcporter`、OpenCLI、`twitter-cli`、`bili-cli`、`rdt-cli`，并引导安装浏览器扩展。更新文档默认从 `archive/main.zip` 安装，并升级多个全局工具。

这不满足：

- 新 Mac 不预装 Python/Node/CLI 也能运行。
- 产品依赖使用私有目录、固定 Artifact 和 Hash。
- 正式 Run 不修改用户全局环境，不运行上游自更新。
- 升级、回滚、签名和许可证清单由产品掌控。

依据：[固定 Installer](https://github.com/Panniantong/Agent-Reach/blob/f65526cbaaad3879473acc1ba6dbefd195caf2be/agent_reach/cli.py)、[固定安装文档](https://github.com/Panniantong/Agent-Reach/blob/f65526cbaaad3879473acc1ba6dbefd195caf2be/docs/install.md)。

### 2.3 Credential 存储不符合产品边界

固定 `Config` 将 Token、API Key 和其他设置保存在 `~/.agent-reach/config.yaml`，权限目标为 `0600`，并允许从环境变量读取。文件权限降低了同机其他用户读取风险，但不等于 Keychain，也不能满足签名进程 ACL、按 Runner 注入、升级与撤销要求。

产品不得读取或迁移用户现有 `~/.agent-reach`、浏览器 Cookie 或 Shell 环境 Secret。Credential 必须由用户在产品内单独授权并写入 macOS Keychain。

依据：[固定 `config.py`](https://github.com/Panniantong/Agent-Reach/blob/f65526cbaaad3879473acc1ba6dbefd195caf2be/agent_reach/config.py)。

### 2.4 发布物与知识文件不能形成单一固定基线

当前固定 Tag 存在可复现性冲突：

- `pyproject.toml` 要求 `yt-dlp[default]>=2026.07.04`。
- 同一 Tag 的 `constraints.txt` 固定 `yt-dlp==2025.5.22`。
- 安装文档指向易变的 `main.zip`，不是 Release 或 Commit。
- 本机 `agent-reach==1.5.0` 实际解析到 `feedparser==6.0.13`、`yt-dlp==2026.7.4`，说明版本号本身不能代表完整依赖图。
- 本机 Codex Skill 的 `SKILL.md` SHA-256 与 Tag 内嵌 Skill 不同，路由知识与 Python 包版本已是两个独立事实源。

因此产品只能选择一个明确 Commit 作为“审计参考”，再把获批映射写入自有 Bundle；不能在运行时读取用户安装的 Skill 或 Agent Reach 配置。

依据：[固定 `pyproject.toml`](https://github.com/Panniantong/Agent-Reach/blob/f65526cbaaad3879473acc1ba6dbefd195caf2be/pyproject.toml)、[固定 `constraints.txt`](https://github.com/Panniantong/Agent-Reach/blob/f65526cbaaad3879473acc1ba6dbefd195caf2be/constraints.txt)。

## 3. 当前环境实探

探测时间：2026-08-31。所有平台调用均为只读；未覆盖、修改或导出 Cookie/Token。

| 来源 | Doctor / 实探 | 证据边界 |
| --- | --- | --- |
| GitHub | Doctor 因保守策略为 `warn`；`gh api` 实际成功 | 本机认证 CLI 当前可用；产品不能依赖它 |
| Exa | Doctor 只确认配置为 `warn`；实际语义搜索成功 | 当前远端 MCP 可用；不证明可分发或数据策略已接受 |
| Web/Jina | Doctor `ok`；实际读取 GitHub 官方文档成功 | 当前服务可用；URL 和抓取内容会经过 Jina |
| RSS | Doctor `ok`；GitHub Blog Feed HTTP 200、解析 10 条 | 协议路径真实可用 |
| B站 | Doctor `ok`；`bili search` 返回非空结构化结果 | 当前非官方 CLI 可用；不代表平台条款或长期维护通过 |
| YouTube | Doctor `ok` 只验证 `yt-dlp` 与 JS Runtime | 未请求具体视频，不能声称字幕可用 |
| V2EX | Doctor 报 `IncompleteRead` | 当前不可用 |
| 小宇宙 | 缺 Groq API Key | 不可用；且涉及音频发送给第三方转写服务 |
| 雪球 | HTTP 400 / 缺会话 | 不可用，不能解释为股票不存在 |
| LinkedIn | 未发现 LinkedIn MCP，OpenCLI 未登录 | 不可用 |
| Twitter/X | `twitter-cli` 缺显式凭据；OpenCLI 快检随后显示会话 | Backend 与会话状态易变，不得静默切换 |
| Reddit | Agent Reach Doctor 未确认 Active Backend | 不可用证明不足 |
| Facebook | Agent Reach Doctor 未确认 Active Backend，OpenCLI 快检未登录 | 不可用 |
| Instagram | Agent Reach Doctor 未确认 Active Backend，OpenCLI 快检显示会话 | 仍不满足合规与产品 Credential 边界 |
| 小红书 | Agent Reach Doctor 未确认 Active Backend，OpenCLI 快检显示会话 | 仍不满足合规与产品 Credential 边界 |

同一次审计中，OpenCLI 初次 Doctor 报扩展未连接，随后 `daemon status` 与再次 Doctor 显示连接成功。这不是矛盾被“修复”，而是浏览器扩展和会话具有明显的时点性；健康状态必须绑定 Backend、Operation、时间和真实最小调用。

## 4. 渠道准入矩阵

| Agent Reach 渠道 | 当前后端形态 | MVP 判定 | 理由 / 后续条件 |
| --- | --- | --- | --- |
| GitHub | `gh` CLI | **Go，重写** | 使用官方 REST，只开放公开仓库只读搜索；可选 Token 独立进 Keychain |
| RSS/Atom | `feedparser` | **Go，重写** | 应用私有解析器；Feed 必须是用户授权的公网 HTTPS URL |
| Exa Search | 远端 MCP + `mcporter` | Conditional | 改为受管 HTTP/MCP Client；用户接受查询出站、计费和数据策略后启用 |
| Web/Jina Reader | `curl` + 托管 Reader | Conditional | 改为受管 HTTP；显示第三方处理边界，禁止 Cookie 转发和反爬绕过 |
| V2EX | 公开 HTTP API | 延期 | 当前实探失败；需补稳定性、条款、限流与错误契约 |
| YouTube | `yt-dlp` | No-Go | 非官方自动访问/下载路径与平台条款风险，不进入 MVP |
| B站 | `bili-cli` / OpenCLI | No-Go | 非官方、上游停更、当前成功不等于可持续分发 |
| Twitter/X | Cookie CLI / OpenCLI | No-Go | 不接管浏览器会话或非官方 Cookie 自动化；仅未来官方 API 方案 |
| Reddit | OpenCLI / `rdt-cli` | No-Go | 当前需要批准/登录态；`rdt-cli` 只在项目元数据声明 Apache-2.0，仓库未发现独立许可证文本，分发闭环也未通过 |
| Facebook | OpenCLI | No-Go | Meta 明确要求程序化数据访问使用获批 Platform API |
| Instagram | OpenCLI | No-Go | 与 Meta 平台权限、App Review 和数据治理未闭环 |
| 小红书 | OpenCLI / MCP / 停更 CLI | No-Go | 浏览器会话、Token、频控和平台授权未闭环 |
| LinkedIn | Scraper MCP / Jina | No-Go | LinkedIn 条款禁止未授权抓取；只能未来走获批官方 API |
| 小宇宙 | 下载 + FFmpeg + Groq/OpenAI | No-Go | 媒体权利、第三方数据出口、Credential、费用和大文件生命周期未闭环 |
| 雪球 | Cookie / OpenCLI | No-Go | 登录态与金融数据风险；不进入通用调研 MVP |

关键平台条款依据：

- [YouTube Terms of Service](https://www.youtube.com/static?template=terms)限制未获授权的下载和自动化访问。
- [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)禁止使用脚本、机器人、浏览器插件等抓取服务内容。
- [Meta Automated Data Collection](https://developers.facebook.com/docs/development/terms-and-policies/automated-data-collection/)要求程序化访问使用获批 Platform API。
- [Reddit Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)要求 API 批准、透明身份和用途约束。

这是一项产品准入判断，不是对所有司法辖区的法律意见。任何后续平台接入都需要重新核实当时条款、官方 API 权限和数据删除义务。

## 5. Conditional 服务的隐私边界

### 5.1 Exa

Exa 官方 Search API 使用 `POST https://api.exa.ai/search` 与 Bearer Key。当前隐私政策说明 Query Data 可能用于改进产品和训练/微调，且查询字段不应提交个人信息；Zero Data Retention 需要单独的团队配置。

因此默认只允许公开、非个人、已脱敏的查询。若未来启用：

- 用户在产品内配置 Exa Credential，不能复用 `mcporter` 配置。
- UI 明确显示查询将发送给 Exa。
- 默认执行敏感字段与本地内容阻断。
- ZDR 与普通账户分别标记，不能凭文档推断已开通。

依据：[Exa Search API](https://exa.ai/docs/reference/search-api-guide-for-coding-agents)、[Exa Privacy Policy](https://exa.ai/privacy-policy)、[Exa Security](https://exa.ai/docs/reference/security)。

### 5.2 Jina Reader

Jina Reader 是外部抓取/转换服务，不是本地解析器。官方说明 Reader 不主动绕过反爬和访问控制，用户负责遵守目标站点条款与知识产权；当前法律页还提示公司收购后数据处理适用 Elastic 的更新条款。

未来启用时禁止传递目标站 Cookie、Authorization、内网 URL 和用户私有页面；请求记录必须标注目标 URL 同时发送给 Jina，并支持用户关闭该来源。

依据：[Jina Reader API](https://jina.ai/reader/)、[Jina Legal Information](https://jina.ai/legal/)。

## 6. 受管 Research Adapter 契约

首批两个 Tool 的固定身份：

```text
github.repositories.search@research-source/v1
rss.read@research-source/v1
```

共同约束：

1. Runner 使用应用私有运行时；命令和参数不来自模型，不搜索父进程 `PATH`。
2. GitHub 固定 `https://api.github.com/search/repositories`、GET 和允许参数；模型不能覆盖 Host、Path、Method 或 Header。
3. RSS 只允许公网 HTTPS，拒绝 UserInfo、环回、私网、Link-local、云元数据和疑似 Secret；每次重定向重新校验。
4. 设置查询长度、条目数、连接/总时长和响应体上限；429/5xx 形成失败的 SourceAttempt，不丢失证据。
5. 可选 GitHub Token 只进入对应 Runner；匿名与认证限流分别记录。GitHub 官方当前说明匿名 REST 主限额为每小时 60 次、认证用户通常为每小时 5,000 次，Search 还有更严格限制。
6. 外部标题、摘要、链接和正文全部标记为 `untrusted_external_content`，不能变成指令。
7. ResearchBundle 保存查询、Backend/Adapter 版本、SourceAttempt、时间、URL、失败、内容 Hash 和截断标记。
8. 来源项 URL 只能用于证据展示或再次经过授权的 Read Tool，不能被模型直接请求。
9. Credentialed GitHub 请求禁止跨 Origin 重定向；RSS 的每次重定向都重新执行公网地址与敏感参数校验。

GitHub 限流依据：[GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)。

## 7. 可执行 Spike

证据位于 [`spikes/managed-research`](../../../spikes/managed-research/README.md)。参考脚本在本轮测试 Python 中运行，但执行路径只使用标准库，不查找或调用任何上游 CLI/第三方 Python Package；产品正式运行时复用应用内固定 Worker Runtime，不能要求用户安装 Python。

确定性运行：

```bash
python3 spikes/managed-research/managed_research_spike.py
```

结果：

| 验证项 | 结果 |
| --- | --- |
| 不执行 Shell 或全局 CLI | 通过 |
| GitHub 固定 Origin/Path/Method | 通过 |
| GitHub + RSS 两个独立 Adapter | 通过 |
| 查询疑似 Secret 阻断 | 通过 |
| 5 类 SSRF 输入拒绝 | 通过 |
| 外部提示注入文本保持非可信 | 通过 |
| 超时、响应体、条目上限 | 通过 |
| 429 失败 SourceAttempt 与 `Retry-After` | 通过 |
| Bundle 时间与 SHA-256 | 通过 |

真实只读协议运行：

```bash
python3 spikes/managed-research/managed_research_spike.py --live
```

GitHub 公开仓库搜索与 GitHub Blog RSS 均返回 2 个规范化条目。重复探测中 RSS 曾出现一次 Chunked `IncompleteRead`，证明 HTTP 200 之前或传输中断不能算来源成功；参考 Transport 对同一只读 GET 最多重试一次，仍失败时形成可重试的失败 SourceAttempt。当前网络使用本地透明代理，将公网 DNS 映射到 RFC 2544 `198.18.0.0/15`；Spike 只在显式 `--live` 探测中允许该代理虚拟地址。生产环境必须把例外绑定到用户批准的代理配置，不能把保留地址加入通用 Allowlist。

Spike 仍未证明 DNS Rebinding/TOCTOU、OS Sandbox、签名 Sidecar、Keychain、崩溃恢复、缓存清理和大响应性能；这些进入正式 Tool Gateway 实现门禁。

## 8. 门禁结果

| Phase 0 Agent Reach 门禁 | 结果 |
| --- | --- |
| 固定 Agent Reach 参考 Commit 与许可证 | 通过 |
| 判断是否可直接作为产品运行时 | 不通过，且不作为采用目标 |
| 不依赖用户全局安装和 Agent Shell | 通过：产品自有 Adapter Spike |
| 至少两个独立来源 Backend | 通过：GitHub REST + RSS/Atom |
| 非可信内容、Secret、SSRF 与限制契约 | 通过（确定性） |
| 当前真实只读协议 | 通过：GitHub + RSS |
| 社交/媒体/招聘/金融平台默认接入 | 不通过，延期或排除 |
| 生产网络沙箱、Keychain、签名与崩溃恢复 | 未验证，进入后续实现门禁 |

**最终判定：Agent Reach 子审计完成。只保留固定路由知识与来源溯源；首版落地产品自有 GitHub REST 与 RSS Adapter，禁止直接安装、运行或调用 Agent Reach 及其上游命令链。**
