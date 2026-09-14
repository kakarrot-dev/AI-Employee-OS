# Microsoft Teams 客户端连接

## 范围

AI Employee OS 内置 Microsoft Graph 连接：按完整姓名或企业邮箱精确查找企业联系人，创建附带 Teams 链接的 Outlook 日历会议，并向本事项已有会议添加参会人、发送日历邀请。无需额外 MCP 进程、下载目录、全局 Codex 配置或外部 Node 项目。不包含聊天消息、Planner、转录、通知 Bot 或会议生命周期自动化。

代码：`src/main/teams-connection.ts`、`src/shared/teams-contract.ts`、`src/runtime/teams-tools.ts`、`src/renderer/src/TeamsConnectionModal.tsx`。

## 连接与凭据

连接页 → Microsoft Teams → 填写租户 ID、应用 ID、客户端密钥、组织者邮箱 → 验证并连接。主进程使用 client credentials 获取 Microsoft Graph 令牌，读取通讯录及组织者日历，检查 Calendars.ReadWrite 和 Teams 日历支持。状态按查找/创建能力分别呈现。

凭据通过已签名的 provider-keychain-helper 写入 macOS 钥匙串，服务 `com.kakarrot.ai-employee-os.teams.credentials.v1`。Renderer 仅在用户输入时持有新密钥，成功后清空；状态和 Runtime 不接收密钥、访问令牌。更新失败不覆盖原凭据。断开删除钥匙串凭据并撤销 Runtime 工具可用状态。

通常需要 Microsoft Graph 应用权限 User.Read.All、Calendars.ReadWrite 及管理员同意，组织者需具有支持 Teams 的 Exchange 日历。连接检查不创建会议，不能代替真实会议创建验收。

## 执行与恢复

客户端内置 Teams 会议专员及对应 Skill/Tools。任务 RunGrant 冻结工具范围；联系人 ID 必须来自同一事项当前运行或明确祖先运行的成功查询。重名或未找到由专员澄清，不猜测身份。

查找只执行 GET。创建显示主题、含时区时间及联系人列表，用户确认后才调用 `/users/{organizer}/events`，同时提交日历邀请。组织者固定为连接配置账号；邀请提交不代表接受。

每次创建使用持久化 ToolAction ID 作为 Graph transactionId；同一事项运行链中第二次创建被拒绝。网络超时、5xx 或成功返回但缺少链接均归为结果未知，不自动重试。必须在组织者日历中核实后处理；没有事件 ID 和入会链接不宣称成功。恢复和返工保留原始动作、确认及回执。重试生成新 Run，沿 supersedesRunId 引用同一 Task 的历史回执，不复制或伪造成功动作。旧数据已有重复创建时，补邀仅允许最近一场。

补邀使用 `teams.meetings.add-attendees@teams/v1`。先 GET 原会议与新联系人，保留全部已有参会人，仅 PATCH attendees 并带 If-Match 防止并发覆盖；再次 GET 核对原人员、新人员和会议链接。已在名单中则不 PATCH、不重发。写入超时或回读不确定归为 result_unknown，拒绝自动重试。

## 验证

单元测试覆盖输入校验、凭据保存/恢复/断开、权限缺失、目录映射、日历邀请请求、缺失链接及结果未知。Runtime 测试覆盖联系人来源、动作确认、防重复以及查询到会议回执的完整链。界面测试覆盖连接管理和确认卡片；新增回归覆盖原名单保留、补邀回读、重复添加无副作用、并发冲突、写入不确定、跨运行恢复和文本伪工具输出。实际邀请结果以客户端 ToolAction 回执为准。

Microsoft 官方契约：

- [创建日历事件、应用权限及自动发送邀请](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)
- [日历支持的在线会议提供商](https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0)

- [更新日历事件及仅更新参会人时的通知行为](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0)

2026-09-08 客户端真实恢复验证：原事项重试沿用已有会议回执；企业通讯录精确查询“马二峰”返回 not_found，本轮未创建新会议、未提交补邀。原会议 GET 确认主题、时间、原参会人和链接保持一致；真实 PATCH 尚待提供准确联系人身份后验证。

## 卡片确认闭环（2026-09-08）

产品验收口径：创建日历会议与提交日历邀请只完成第一步。必须由每位参会人点击 Teams 私聊中的确认卡，才计入已确认；日历 RSVP、员工文字、发送成功回执、发起人在客户端点击按钮都不能替代参会人的卡片回执。

消息流沿用 `MessageActionCard` 和 `MessageConfirmationActions`。创建确认按钮明确表示“创建会议并发送确认卡”。参会名单展示姓名、邮箱、逐人状态和已确认人数。状态分别为：卡片未发送、正在发送卡片、等待确认、已确认参加、已拒绝参加、发送结果待核实。全员未确认时运行暂停并显示等待参会人确认；任何拒绝都不能算全员确认。全部确认后仅恢复结果整理与验收，不重新开放工具执行或延长写操作授权。

### 项目内实现与凭证

- `src/main/teams-card-service.ts`：项目内 Bot 服务，监听本机 `127.0.0.1:3978/api/messages`，通过 Bot Framework `CloudAdapter` 验证入站身份。监听本机端口不代表已建立公网回调。
- `src/main/teams-card-ledger.ts`：使用权限为 0600 的原子替换文件保存卡片发送与响应回执，位于用户数据目录 `teams/`。不保存 Graph/Bot 密钥；沿用系统钥匙串中的租户与应用凭证。
- 使用个人会话中经过验证的租户、`from.aadObjectId`、会话 ID 和每人独立的随机 nonce 绑定回执，忽略卡片数据中自称的身份。重复回调幂等；卡片过期或身份不匹配时拒绝处理。
- 创建日历会议的回执先保留；卡片发送独立进行。卡片发送失败不得转为再次创建会议；发送中断或超时记为结果未知，不自动重复发送。
- 回执通过受信任的主进程送入 Runtime；Renderer 和模型没有修改参会确认状态的接口。

### 真实联通所需条件

1. 当前 Entra 应用对应的 Azure Bot 已开启 Microsoft Teams 渠道，且 Teams 应用 manifest 使用同一 Bot 应用 ID，并支持 `personal` 范围。
2. Azure Bot 的消息终结点配置为公网 HTTPS 地址的 `/api/messages`，经已有的可信隧道或反向代理转发到客户端上述本地地址。应用运行期间该地址必须可达；关闭客户端后本机无法接收点击回调。
3. 每位参会人安装/打开这个 Bot 的个人会话，使经过认证的 Teams 事件建立会话引用。客户端不会假造联系人已安装 Bot。
4. 在客户端确认创建；若名单显示卡片未发送，先完成上述连接，再点击“发送未发送的确认卡”。此操作只发送尚未尝试过的卡片，不会重建会议或重发结果未知的卡片。

现有便携包提供普通 Bot 私聊通知，但没有卡片点击回执；本项目运行时不引用该下载目录。真实公网终结点、Teams 应用安装和真实点击回执必须分别核验，不能以本地模拟测试代替联通验收。

微软协议依据：[Adaptive Card actions](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-actions)，`Action.Execute` 的 `adaptiveCard/action` 回调。
