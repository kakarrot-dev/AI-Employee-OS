# 飞书连接闭环契约

## 目标与边界

飞书连接必须形成“准备应用 → 配置回调 → 用户授权 → 本机保存 → 状态验证 → 按需续期 → 断开或恢复”的闭环。客户端不能绕过飞书开放平台的重定向 URL 白名单，也不能把 App Secret、access token 或 refresh token 暴露给 Renderer。

固定回调地址为 `http://localhost:3000/callback`。飞书开放平台“安全设置 → 重定向 URL”中的值必须与其逐字符一致；未登记时飞书返回错误码 `20029`，刷新授权页不能解决该问题。

## 主流程

1. 用户在连接目录打开飞书卡片，客户端读取 Keychain 中的真实连接状态。
2. 用户填写自建应用的 App ID 与 App Secret。App ID 必须以 `cli_` 开头；Secret 只保留在当前表单内。
3. 客户端根据已校验的 App ID 打开该应用的飞书开放平台“安全设置”。用户添加并保存固定回调地址，再在客户端确认已完成。
4. 客户端先监听 `localhost:3000`，再生成一次性的 OAuth `state`，最后以 `prompt=consent` 打开系统浏览器授权页，确保每次连接都签发新的授权码。
5. 回调只接受 `GET /callback`，并校验错误参数、`state` 和授权码。任何不匹配均拒绝继续。
6. Main Process 使用 App ID、App Secret 和官方 Node SDK 的 OAuth v3 接口交换用户令牌；申请 `offline_access`、`search:docs:read`、`docx:document:readonly` 与 `wiki:wiki:readonly`。该自建应用连接按飞书机密客户端协议执行，不混用 PKCE 授权参数。
7. 只有令牌交换成功后，App ID、App Secret、access token、refresh token、过期时间与授权范围才作为一个版本化对象写入 macOS Keychain。
8. 客户端收到成功状态后刷新飞书卡片与顶部“已连接”指标；Renderer 只接收 App ID、过期时间、范围和状态，不接收任何 Secret 或 token。

## 状态、失败与恢复

| 状态 | 触发 | 影响 | 恢复动作 | 验收证据 |
| --- | --- | --- | --- | --- |
| 未连接 | Keychain 无飞书凭证 | 卡片显示“未连接” | 完成三步连接流程 | `getFeishuStatus()` 返回 `not_connected` |
| 配置中 | 用户填写凭证、登记回调 | 尚未访问用户数据 | 打开安全设置并确认回调地址 | 开始授权按钮在确认前禁用 |
| 授权中 | 本机监听成功且浏览器已打开 | 等待一次性回调 | 完成授权或主动取消 | 卡片/弹窗显示“授权中”，可执行取消 |
| 回调错误 | 拒绝授权、state 不匹配或缺少 code | 不交换、不保存令牌 | 修正配置后重新发起 | 明确错误文案；Keychain 不新增凭证 |
| `20029` | 飞书后台未登记完全一致的重定向 URL | 授权页无法回调客户端 | 在安全设置添加固定 URL，保存后重新授权 | 引导直达安全设置，文案包含 `20029` 的恢复方式 |
| 已连接 | 换取令牌且四个权限均已授予 | “飞书资料员”可获得三个只读 Tool | 正常使用或管理连接 | 状态含 App ID、过期时间与范围，不含 Secret/token |
| 需重新授权 | refresh token 失效、过期或缺少任一文档权限 | “飞书资料员”不进入可调用名单 | 添加权限、发布应用版本并重新执行三步流程 | 返回 `reauthorization_required` |
| 连接异常 | Keychain、网络或令牌刷新失败 | 不把异常误报为已连接 | 保留原因，允许检查或重试 | 返回 `error` 与可行动说明 |
| 已断开 | 用户二次确认断开 | 本地飞书凭证删除、指标减一 | 重新授权 | Keychain 删除成功后返回 `not_connected` |

## 取消与幂等边界

- 同一时间只允许一个飞书授权流程；重复发起返回 `feishu_connection_in_progress`。
- 用户点击“取消授权”或在授权中关闭弹窗时，客户端必须关闭本机监听并拒绝仍在等待的流程，不保存半成品凭证。
- 取消、拒绝、超时和 `20029` 不删除已有的有效连接；只有明确执行“断开连接”才删除 Keychain 记录。
- 令牌刷新必须写回飞书返回的新 refresh token，不复用已经轮换的旧值。

## 当前 Agent 与 Tool

- 只有内置“飞书资料员”绑定 `capability.feishu-documents.v1`，可调用 `feishu.documents.search@feishu-documents/v1` 和 `feishu.documents.read@feishu-documents/v1`。
- 其他 Agent 不会因为飞书已连接而自动获得权限；必须显式绑定同一 Capability 才能进入 RunGrant。
- 搜索只返回当前用户可访问的文档元数据；读取的 `documentId` 必须来自同一 Assignment 的成功搜索结果。
- access token 只由 Main Process 从 macOS Keychain 读取，Runtime 与 Worker 只接收状态和 ToolResult。
- 正式任务执行读取 Tool 后，文档纯文本会作为 ToolResult 进入该 Agent 当前配置的模型服务；仅连接、续期或检查状态不会读取文档。
- 当前不支持消息、文档写入、日历或通讯录。新增能力必须使用独立 Tool、独立权限与独立验收，不能把“已连接”当作授权。
