# Phase 10：网络情报员与文档编写员实施验收

版本：v0.1
日期：2026-09-02
状态：实现完成，真实外部来源覆盖存在已记录边界

## 1. 员工与最小权限

Runtime 安装两个稳定、可重复安装的员工资料：

- `网络情报员` 只绑定 `capability.network-intelligence.v1`，使用 Agent-Reach、Last 30 Days、OpenCLI 三个 Skill 和对应固定只读 Tool；不绑定文件 Tool。
- `文档编写员` 只绑定 `capability.local-document.v1`，使用查看、独占创建、唯一文本编辑三个本机文档 Tool；不绑定网络 Tool。

工作台创建事项时按 `网络情报员 → 文档编写员` 冻结串行 Assignment。文档员工存在时，用户必须先通过原生目录选择器明确授权至少一个文件夹；绝对目录进入 TaskDraft、TaskRevision 与 RunGrant，不能由模型自行添加。

## 2. 外部网络能力边界

外部 Runner 不提供 Shell 字符串或可覆盖命令：

| ToolVersion | 固定执行边界 |
| --- | --- |
| `agent-reach.search@network-intelligence/v1` | `mcporter call exa.web_search_exa`，仅 query 与 1–10 条上限 |
| `last30days.research@network-intelligence/v1` | 已安装 Skill 的 Python 入口，固定 quick/agent JSON/no-browser-cookies，临时输出运行后删除 |
| `opencli.social-search@network-intelligence/v1` | 固定 Reddit、X、小红书只读 search Adapter；分平台失败保留 |

网络查询继续经过敏感路径、Secret、编码内容与提示注入检查。返回内容统一转换为带 URL、Hash、采集时间和 `untrusted_external_content` 标记的 ResearchItem；三个来源完成或明确失败后才形成 ResearchBundle。

2026-09-02 本机体检：Agent Reach v1.5.0 可执行；OpenCLI v1.8.7、daemon 19825 与扩展 v1.0.23 已连接；Last 30 Days v3.21.1 可发现 Reddit、X、YouTube、Hacker News、Polymarket、GitHub、arXiv、Techmeme 和 keyless Web。限制：Reddit 实时探测 HTTP 429；X 浏览器会话尚未通过真实研究运行验证；可选 ScrapeCreators、Perplexity 等 Key 未配置。因此不得声称所有社交来源已可用。

## 3. 本机文档边界

- 只接受绝对路径，目标必须位于 RunGrant 授权目录的真实路径下；拒绝路径穿越与符号链接越界。
- 单文档与单次内容上限 1 MiB。
- `create` 使用独占创建，不覆盖同名文件。
- `edit` 要求旧文本恰好匹配一次，临时文件同目录写入后原子替换。
- 创建和编辑为中风险副作用，默认逐次审批；完成后回读内容并记录 SHA-256。
- Delivery 只把成功且 Hash 回读一致的文件动作登记为 Artifact。

## 4. 验证

自动化覆盖员工幂等安装与权限互斥、串行团队和授权目录冻结、目录内创建/查看/编辑、重复创建、歧义编辑、目录越界与符号链接拒绝、ToolAction 审批与 ResearchBundle 原有安全门禁。

执行命令：

```bash
npm run typecheck
npm test -- --run
npm run build
git diff --check
```

真实登录态平台的内容质量、频控和平台授权会随当前浏览器会话变化，不由一次 Doctor 结果替代；运行时必须保留失败来源与信息缺口。
