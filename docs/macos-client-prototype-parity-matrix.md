# macOS 客户端原型一致性矩阵

## 事实源

- 界面布局、组件层级、视觉状态与交互入口：`prototypes/macos-client-v2`。
- 业务数据、权限、状态机和副作用：Runtime Bridge 与 `src/shared/*-contract.ts`。
- 原型出现但 Runtime 尚未开放的能力必须展示明确的不可用状态，不得用模拟数据伪装成功。

## 全局布局与复用契约

| 区域 | 原型契约 | 复用组件 | 状态 |
| --- | --- | --- | --- |
| Window Toolbar | macOS 原生 traffic lights、当前对象标题、辅助状态、右侧动作 | `Toolbar` | normal / loading / disconnected；不得在 Renderer 重绘三色按钮，弹窗必须避开原生按钮安全区 |
| Rail | 消息、通讯录、能力；底部个人资料与系统 | `Rail`、`Avatar` | default / selected / badge |
| Context Pane | 标题、搜索、筛选、对象列表、Runtime 页脚 | `ContextPane`、`SectionHeader`、`SearchBox`、`ListRow` | loading / empty / populated / filtered |
| Workspace | 页面工具条下的稳定内容区 | `Workspace`、`DetailPage` | loading / empty / ready / error |
| Overlay | 创建、设置、确认删除与详情 | `ClientModal` | open / busy / error / nested confirm |

共享组件只负责结构、样式和可访问行为，不持有业务状态，不解释 Runtime 字符串。

## 消息

| 页面/组件 | 原型状态 | Runtime 映射 | 验收 |
| --- | --- | --- | --- |
| 会话列表 | 全部 / 待处理 / 未读、选中、归档 | `ConversationSummaryView` + `TaskDetailView`；未读为本地阅读状态 | 搜索筛选、选中、归档、空态均可操作 |
| 对话时间线 | 用户消息、总管消息、流式生成、失败 | `ConversationMessageView`、`ConversationStreamEvent` | 历史与流式内容使用同一消息组件；只有实际超过折叠阈值且尚未展开的消息显示渐变，短消息不显示渐变 |
| 事项路由 | 新建事项 / 归入事项 / 变更事项 | `TaskBridge.createDraft/requestChange` | 每个入口只触发真实 Runtime 命令；直接回答或未形成事项不在消息时间线插入横幅 |
| 事项卡 | draft / pending / running / succeeded / failed / cancelled / needs_attention | `TaskDetailView.state` | 标签、动作与状态机一致 |
| 审批卡 | pending / approved / rejected / result_unknown | `approvals`、`toolActions` | 审批与拒绝调用真实 Tool Action API |
| 交付卡 | 验收结果、产物、证据、未解决问题 | `delivery` | 可查看完整证据，不伪造文件预览 |
| Composer | 文本、发送、取消、附件、模型、麦克风 | 文本/取消已开放；附件、模型切换、语音尚无 Bridge | 永久固定；不可用能力保留原型入口并明确禁用原因 |

## 通讯录

| 页面/组件 | 原型状态 | Runtime 映射 | 验收 |
| --- | --- | --- | --- |
| 员工目录 | 搜索、选中、状态灯、空态 | `EmployeeSummary` | draft / pending_test / active / disabled / archived / pending_changes 全覆盖 |
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

## 系统

| 分区 | 原型契约 | 数据来源 / 边界 |
| --- | --- | --- |
| 个人资料 | 头像、名称、角色、说明 | 本地客户端资料，可编辑并持久化 |
| 通用 | 主题、启动与通知 | 主题真实生效；未开放的 OS 权限明确禁用 |
| 总管 | 定义与职责边界 | Runtime 固定注入；无可写接口时只读 |
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
7. 浅色、深色与系统主题，同尺寸原型对照。

## 样式与交互复用规则

- `layout.css`、`typography.css` 和原型 `styles.css` 是尺寸、字体、色彩与组件状态的唯一事实源；正式页面不得复制同名像素常量。
- 旧 Renderer 组件样式必须使用 `legacy-*` 作用域，禁止覆盖原型的 `.composer`、`.context-pane`、`.delivery-card` 等公共契约。
- React Aria 的 `data-focus-visible/data-focus-within/data-disabled` 状态在正式原生控件上分别映射为 `:focus-visible/:focus-within/:disabled`，视觉反馈必须等价。
- 原型入口在 Runtime 未开放时仍可展示可点击说明、真实可用性或明确禁用原因，不允许以无反馈按钮冒充已实现能力。
