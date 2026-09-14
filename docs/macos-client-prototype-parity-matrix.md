# macOS 客户端原型一致性矩阵

## 事实源

- 界面基础布局、组件层级与交互入口：`prototypes/macos-client-v2`。消息页以当前客户端为准，直接复用 `src/renderer/src/components/{client-ui,message-ui}.tsx` 与 `prototype-adapter.css`，原型只提供演示数据。
- 业务数据、权限、状态机和副作用：Runtime Bridge 与 `src/shared/*-contract.ts`。
- 原型出现但 Runtime 尚未开放的能力必须明确说明边界。Web 0.1 飞书会议使用独立、全程标明演示来源的本地流程；客户端不因此获得真实会后转写或摘要能力。不得用模拟数据伪装真实成功。

## 全局布局与复用契约

| 区域 | 原型契约 | 复用组件 | 状态 |
| --- | --- | --- | --- |
| Window Toolbar | 40px 全宽拖拽区、macOS 原生 traffic lights、当前对象标题、辅助状态、右侧动作 | `Toolbar` + `application-toolbar` 四插槽契约 | normal / loading / disconnected；非控件区域均可拖动，交互控件保持 no-drag，右侧动作距窗口边缘 24px，不得在 Renderer 重绘三色按钮 |
| Rail | 消息、通讯录、能力、连接；底部个人资料与系统 | `Rail`、`Avatar` | default / selected / badge |
| Context Pane | 标题、搜索、筛选、对象列表、Runtime 页脚 | `ContextPane`、`SectionHeader`、`SearchBox`、`ListRow` | loading / empty / populated / filtered |
| Workspace | 页面工具条下的稳定内容区 | `Workspace`、`DetailPage` | loading / empty / ready / error |
| Overlay | 创建、设置、确认删除与详情 | `ClientModal` | open / busy / error / nested confirm |
| Icon System | Iconoir 极简单线图标、1.5 线宽、14/16/18/20/24px 五种语义尺寸；官方品牌 Logo 保持原图 | `ClientIconSystem` + `--icon-size-*` | 页面不得设置像素尺寸、手绘 SVG、使用文本伪图标或引入第二套图标库 |

共享组件只负责结构、样式和可访问行为，不持有业务状态，不解释 Runtime 字符串。

## 消息

| 页面/组件 | 原型状态 | Runtime 映射 | 验收 |
| --- | --- | --- | --- |
| 会话列表 | 不分类展示全部会话、选中、删除 | `ConversationSummaryView`；未读为本地阅读状态 | 搜索、选中、删除、未读提示、空态均可操作 |
| 事项边栏 | 右侧事项列表、数量、最新更新排序、空态、折叠与定位 | `TaskDetailView`；Web 使用演示事项 | 左右栏独立折叠，定位条目滚动并聚焦消息中的事项卡；不再切换对话 / 事项页签 |
| 对话时间线 | 用户消息、总管消息、流式生成、失败 | `ConversationMessageView`、`ConversationStreamEvent` | 历史与流式内容使用同一消息组件；只有实际超过折叠阈值且尚未展开的消息显示渐变，短消息不显示渐变 |
| 事项路由 | Web 0.1 不做意图识别、自动归类或追问；客户端保留自己的 Runtime 路由 | `TaskBridge.createDraft/requestChange` | 每个入口只触发真实 Runtime 命令；直接回答或未形成事项不在消息时间线插入横幅 |
| 事项卡 | draft / pending / running / succeeded / failed / cancelled / needs_attention | `TaskDetailView.state` | 标签、动作与状态机一致 |
| 审批卡 | pending / approved / rejected / result_unknown | `approvals`、`toolActions` | 审批与拒绝调用真实 Tool Action API |
| 交付卡 | 验收结果、产物、证据、未解决问题 | `delivery` | 可查看完整证据，不伪造文件预览 |
| Composer | 文本、发送、取消、附件、模型、麦克风 | 文本/取消已开放；附件、模型切换、语音尚无 Bridge | 永久固定；不可用能力保留原型入口并明确禁用原因 |

### Web 0.1 飞书会议场景

- 默认会话、新建会话和“通讯录 → 专家团 → 会议专家团 → 选择并进入会话”进入同一组件。
- 自动演示：提交一次会议信息 → 预约会议及邀请 → 会议开始与录制 → 结束通知 → 录制就绪 → 妙记转写等待与自动重试 → 读取内容 → 专家团整理与核对 → 交付摘要文档。时间压缩为约 30 秒，各场会议在切换页面后继续独立推进。
- 时间线保存用户提交快照、飞书妙记来源、自动处理回执、专家团协作记录和摘要文档卡片，不展示会议原文或摘要正文。摘要文档直接复用统一附件组件和“打开方式”菜单，支持独立预览和下载，包含妙记来源、交付团队、会议信息、结论与行动项；过程状态及来源、协作记录复用统一状态和详情展开。
- 所有回复由会议专家团统一呈现，成员身份复用专家团目录。会议策划 Agent 负责筹备和来源核对，会议纪要 Agent 负责妙记读取和内容整理，行动项跟进 Agent 负责负责人及截止时间核对；各会话独立保存来源和协作记录。
- Web 端全程标明演示模式，不创建真实会议、不发送邀请、不读取真实飞书妙记、不调用真实专家团执行服务或模型。原型不实现意图识别、自动归类或追问。
- 布局/字段/测试边界见 `prototypes/macos-client-v2/FEISHU_MEETING_V01.md`。

## 通讯录

| 页面/组件 | 原型状态 | Runtime 映射 | 验收 |
| --- | --- | --- | --- |
| 通讯录类型 | 专家 / 专家团 Tab、对应搜索、列表和详情 | 客户端使用 Employee / ExpertGroup；Web 专家团复用候选目录作为明确标注的原型示例 | 点击或方向键切换 Tab；切换清空搜索、保留各自选中对象，详情标题随类型与选择同步；支持无搜索结果 |
| 专家团进入会话 | 会议专家团打开飞书结构化表单；其他专家团新会话保留手动输入 | Web 会话分别保存草稿、消息和会议状态 | 会议专家团固定选择飞书场景，无意图识别；切换菜单或会话后数据保留，新建会议互相隔离；刷新重置，未调用 Runtime |
| 员工目录 | 搜索、选中、状态灯、空态 | `EmployeeSummary` | draft / pending_test / active / disabled / archived 全覆盖；活动版本存在时保持 active，草稿进度不混入可工作状态 |
| 员工详情 | 资料、能力摘要、最近交付 | `EmployeeDetail` + Task assignments | 不复制版本事实，不隐藏正式引用 |
| 创建 Agent | 头像 / 名称 / 职责 / 说明 / Prompt / 模型与能力 | `EmployeeBridge.create/saveDraft` | 三步字段门禁；创建时持久化头像与职责，创建后进入可编辑草稿 |
| Agent 设置 | 基础 / Prompt / 模型能力 / 记忆 / 测试发布 | Employee lifecycle APIs | 测试确认后才能发布；依赖不可用时阻止发布 |
| 生命周期 | 停用 / 启用 / 归档 / 恢复 / 删除草稿 | 对应 Employee API | 有正式引用时不得物理删除 |

## 能力

| 页面/组件 | 原型状态 | Runtime 映射 | 验收 |
| --- | --- | --- | --- |
| Skill 目录 | 搜索、选中、可用性 | `ResourceCatalogView.skills` | 只展示真实版本化 Skill |
| Skill 文档 | SKILL.md、用例、步骤、依赖、绑定 Agent、高级信息 | `description/steps/toolVersionIds` + Employee capabilities | 文档从结构化事实生成并明确来源 |
| Tool 目录 | 搜索、选中、健康状态 | `ResourceCatalogView.tools` | sideEffect/risk/origin/credential 完整显示 |
| Tool 详情 | 调用边界、依赖、绑定 Agent、高级信息 | Tool contract + health checks | 不提供不存在的执行按钮 |

## 连接

| 页面/组件 | 原型状态 | Runtime 映射 | 验收 |
| --- | --- | --- | --- |
| 可连接应用 | 协作沟通：飞书、Microsoft Teams、钉钉、企业微信、微信；知识与文件：Notion、语雀、WPS Office、百度网盘；研发与云服务：GitHub、Gitee、阿里云 | 客户端为 `data-source="bridge"`；飞书映射 `ConnectionBridge`，其余应用仍为静态目录 | 复用招募员工目录组件和顶部指标；飞书按“凭证 → 文档权限与回调配置 → 用户授权”三步完成，支持安全设置入口、授权取消、重新授权、状态与断开；仅“飞书资料员”通过 RunGrant 调用搜索与只读文档 Tool；错误码 `20029` 有明确恢复路径；已连接数来自真实状态，敏感凭证不进入 Renderer 或配置文件，其余 11 项保持“未连接”且无虚假动作 |

## 系统

| 分区 | 原型契约 | 数据来源 / 边界 |
| --- | --- | --- |
| 个人资料 | 头像、名称、角色、说明 | 本地客户端资料，可编辑并持久化 |
| 通用 | 主题、启动与通知 | 主题真实生效；未开放的 OS 权限明确禁用 |
| 总管 | 头像、名称、System Prompt、模型、全局记忆 | `SupervisorBridge` + Runtime 单例配置；平台安全与权限注入保持只读 |
| 模型服务 | Provider、模型、Credential、验证 | `ProviderStatus`，不可回显密钥 |
| 资源与权限 | 默认授权、资源健康、MCP | `ResourceCatalogView` 与 Runtime 策略 |
| 记忆与存储 | 健康、队列、检索、编辑、禁用、恢复、删除 | `MemoryBridge` |
| 用量与预算 | 聚合用量与预算 | 无聚合接口时展示明确空态，不展示模拟金额 |
| 关于与诊断 | 版本、Runtime、重连、诊断边界 | `RuntimeStatus` 与应用版本 |

系统右侧内容统一采用单栏布局：页面简介、分区标题、分区说明、设置内容和操作按纵向阅读顺序排列；不得恢复为“左侧说明 + 右侧控件”的双栏结构。

## 必测状态

1. Runtime 连接中、已连接、断开与重连失败。
2. 各目录 loading、empty、populated、filtered-empty、error。
3. 消息 idle、sending、streaming、canceling、failed。
4. 事项七种状态、变更待处理、审批三种决策与结果未知。
5. 员工六种 UI 状态、创建草稿、测试失败/通过/确认、发布、回滚、停用、归档、恢复、受限删除。
6. Skill/Tool 可用、降级、不可用、Credential 缺失。
7. 连接目录十二个应用、三类分组、三项顶部指标与品牌图标；飞书覆盖未连接、授权中、已连接、需重新授权、异常和断开，其余应用保持无操作边界。
8. 浅色、深色与系统主题，同尺寸原型对照。

## 样式与交互复用规则

- `layout.css`、`typography.css` 和原型 `styles.css` 分别提供尺寸、排版、主题的唯一数值来源。Web 与客户端在入口全局加载同一结构适配文件 `src/renderer/src/prototype-adapter.css`；切换页面不装卸样式，适配层不得重复定义尺寸、主题或硬编码排版值。
- 旧 Renderer 组件样式必须使用 `legacy-*` 作用域，禁止覆盖原型的 `.composer`、`.context-pane`、`.delivery-card` 等公共契约。
- React Aria 的 `data-focus-visible/data-focus-within/data-disabled` 状态在正式原生控件上分别映射为 `:focus-visible/:focus-within/:disabled`，视觉反馈必须等价。
- 原型入口在 Runtime 未开放时仍可展示可点击说明、真实可用性或明确禁用原因，不允许以无反馈按钮冒充已实现能力。

## 2026-09-10 Web 修复复验

Web 组件复用、筛选空态、本地状态保存、附件可用性与静态契约缺口已处理，详见 `audits/2026-09-10-prototype-parity/web-fixes.md`。此前审计中的客户端草稿、流式投递及页签/动效问题不在本次 Web 修复范围，不能据此判定客户端完整通过。
