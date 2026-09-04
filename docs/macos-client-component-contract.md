# macOS 客户端组件与布局契约

本契约以 `prototypes/macos-client-v2` 为界面与交互事实源，约束正式客户端的布局职责、组件复用和业务边界。原型定义“长什么样、如何组织信息”，Runtime Bridge 定义“哪些功能真实可用”。两者不得互相伪造。

## 1. 固定壳层

正式客户端只有一套一级壳层：

1. `Toolbar`：高度使用 `--layout-toolbar-height`，承载当前上下文标题和少量全局动作；内边距使用顶栏专属 Token，不复用页面内容边距。
2. `Rail`：宽度使用 `--layout-rail-width`，只承载消息、通讯录、能力、连接与系统入口。
3. `ContextPane`：宽度使用 `--layout-context-width`，承载对象目录、搜索、筛选和创建入口。
4. `Workspace`：业务详情与工作流区域，页面不得自行复制上述三层结构。

窗口尺寸仅由 `src/shared/layout-contract.ts` 管理；视觉尺寸仅由原型 CSS Token 管理，React 组件不得重复声明像素常量。

### 1.1 顶部栏容器契约

`Toolbar` 是全局唯一的应用顶栏，固定使用 `data-layout-contract="application-toolbar"`，内部只允许四个稳定插槽：`navigation`、`workspace`、`identity`、`actions`。

- 高度固定为 `--layout-toolbar-height: 40px`，正式客户端适配层不得覆盖。
- 内容区左右安全边距固定使用 `--layout-toolbar-inline-padding: 24px`；右侧折叠按钮等页面级动作必须包含在该边距内。
- 左侧导航控件使用 `--layout-toolbar-navigation-edge-padding` 与分栏边界保持距离。
- 列表栏收起时，导航槽位使用 `--layout-toolbar-collapsed-navigation-width`，必须同时容纳 macOS 窗口控件安全区、`--layout-toolbar-window-controls-gap: 16px`、折叠按钮和边缘间距，不得回落为仅使用图标栏宽度。
- 左右折叠按钮统一使用无外框的单线方向图标，方向始终指向面板移动的目标侧。
- 顶栏及各插槽默认均为 `-webkit-app-region: drag`；只有按钮、链接和表单控件自身为 `no-drag`。
- 页面只通过 `title`、`icon`、`navigation`、`support`、`trailing` 传入内容，不得复制顶栏结构或声明页面专用高度与边距。

### 1.2 外壳分隔线契约

外壳分隔线与内容边框是两种不同语义，不能共用同一个 Token：

| Token | 稳定职责 | 允许使用区域 |
| --- | --- | --- |
| `--line-shell` | 低干扰地提示持久区域边界 | `Toolbar` 底边、`Rail` 右边、`ContextPane` 右边、可选右侧栏的左边与栏头底边 |
| `--line` | 区分内容内部结构 | 卡片、表单、弹窗、列表分组、时间线和内容区段 |
| `--line-strong` | 强调必要的内容边界 | Hover、拖拽目标、重要分组；不得用于持久外壳 |
| `--focus` | 表达键盘焦点 | 可交互控件的焦点环，不得用普通边框色代替 |

实现规则：

- 外壳边界统一为 `1px solid var(--line-shell)`；不得直接使用 `--line`、`--line-strong`、Hex、RGB 或阴影模拟分隔线。
- `--line-shell` 的亮色模式目标透明度为 5%，暗色模式目标透明度为 7%；数值只能在主题事实源中定义一次，组件不得覆盖。
- 相邻区域只由一侧绘制一条边界，禁止双重描边；区域折叠到 0 宽时必须同时隐藏对应边界。
- 优先依靠 `--surface-app`、`--surface-list`、`--surface-content` 的轻微材质差异建立层级；分隔线只负责结构提示，不能成为主要视觉层级。
- 新增持久侧栏、Inspector 或全局工具栏时，必须加入布局契约检查的外壳选择器清单；页面内部临时面板不得冒用 `--line-shell`。

## 2. 组件职责

| 组件 | 稳定职责 | 禁止承载 |
| --- | --- | --- |
| `AppShell` | 组合 Toolbar、Rail、ContextPane、Workspace | 业务查询和状态机 |
| `Rail` | 一级模块切换、当前态 | 二级业务对象 |
| `ContextPane` | 搜索、筛选、对象列表、创建入口 | 详情编辑表单 |
| `ListRow` | 标题、副标题、元信息、选中态 | 对象专属布局分支 |
| `DetailPage` | 详情页宽度、滚动和内容画布 | 模块自己的导航壳 |
| `SettingsBlock` / `SettingRow` | 系统设置右侧的单栏分组与键值动作；分区标题、说明、内容自上而下排列 | Runtime 状态伪造、左右说明栏 |
| `IconButton` / `Avatar` / `StatusLight` | 一致的原子视觉与无障碍语义 | 业务副作用 |
| `ClientModal` | 统一遮罩、尺寸、Esc/遮罩关闭与 Dialog 语义 | 创建、发布、删除等业务状态机 |

### 2.1 图标系统契约

- 功能图标只使用 `iconoir-react`，由 `ClientIconSystem` 在应用根节点统一提供；线宽固定为 `1.5`，页面不得创建第二个 Provider 或覆盖 `strokeWidth`。
- 图标尺寸只能通过五种语义 Token 选择：`inline` 14px、`control` 16px、`standard` 18px、`navigation` 20px、`feature` 24px。React 页面不得向图标传入数字 `width` / `height`。
- 无文字图标按钮必须通过 `IconButton` 或等价控件提供可访问名称与 Tooltip；装饰图标必须设置 `aria-hidden`。
- 不允许手绘 SVG、Emoji、对勾/叉号/尖括号等文本字符冒充功能图标，也不允许并行引入第二套图标库。
- GitHub、飞书、Notion 等官方品牌 Logo 属于品牌图像资产例外，使用 `<img>` 展示，不接受 Iconoir 替代；头像、状态点和数据图表不属于功能图标。
- 新增图标先复用现有语义角色；确实缺少角色时先扩展本契约与自动检查，再在页面使用。

## 3. 页面契约

- 消息：`ContextPane` 展示真实会话；`Workspace` 永久保留 Composer，消息与业务事项共用同一条时间线。
- 通讯录：`ContextPane` 展示真实 Agent 员工；`Workspace` 展示资料、能力摘要和最近交付；三步创建与五分区设置复用 `ClientModal`，测试、发布和治理继续调用真实 Runtime 状态机。
- 能力：`ContextPane` 只按原型展示 Skill、Tool；`Workspace` 展示 SKILL.md、适用任务、依赖、绑定 Agent 与高级信息。MCP 和数据源健康归入系统的资源治理。
- 连接：`ContextPane` 只保留模块标题；`Workspace` 复用招募员工目录的摘要、分组、卡片与状态组件，按协作沟通、知识与文件、研发与云服务三类展示 12 个可连接应用。飞书状态来自窄 `ConnectionBridge`，支持自建应用凭证、系统浏览器 OAuth、按需自动续期与断开；App Secret、用户令牌和 refresh token 只保存在 macOS Keychain，Renderer 不持有持久凭证。其余 11 个应用仍为静态“未连接”，顶部已连接数只能由 Bridge 的真实状态派生。
- 系统：`ContextPane` 固定承载个人资料、通用、总管、模型服务、资源、记忆与存储、用量、关于；默认打开个人资料，`Workspace` 只显示所选设置页。右侧所有设置分区统一使用单栏阅读流，不为分区说明另建左侧标签栏。

## 4. 状态与数据边界

- 列表、详情、创建、归档、运行状态必须来自 preload 暴露的窄 Bridge。
- 飞书授权固定监听本机回环 `localhost:3000`，必须校验 OAuth `state` 与 PKCE；token 交换使用飞书官方 Node SDK 的 OAuth v3 能力。连接阶段只申请 `offline_access`，文档、消息、日历等业务权限随具体 Tool 单独申请。
- 暂未接入的上传、用量等能力明确显示不可用，不用假数据补齐原型。
- 页面状态由顶层模块持有；共享视觉组件保持无业务状态，事件通过 props 上送。
- 当前态必须同时具备视觉类名与可访问名称，不能只依赖颜色表达。
- 原型由 React Aria 提供的焦点、禁用和弹层入场状态，正式客户端必须通过原生伪类或同名 data 属性复用同一套视觉规则。
- Employee 身份字段由 Runtime 版本契约持有：`name`、`role`、`description`、`avatarDataUrl`；详情、创建和设置必须读取同一版本事实。

## 5. 验收标准

- 五个一级模块均复用同一个 `AppShell`，切换时壳层不重排。
- 目录页均复用 `SearchBox`、`ListRow` 和一致的空状态。
- 系统设置均复用单栏 `SettingsBlock`、`SettingRow`，标题、说明与控件保持同一左对齐基线。
- 组件契约测试验证壳层 landmark、一级导航事件和选中态。
- 图标契约测试验证唯一图标库、统一 Provider、线宽、五种语义尺寸，并阻止页面级像素尺寸、手绘 SVG 与文本伪图标。
- Renderer 测试、TypeScript 检查、生产构建通过，并在真实 Electron 窗口逐页完成视觉检查。
- 960×640、1280×820 和 1600×1000 三档窗口下，Toolbar、Rail、ContextPane、Workspace 与 Modal 的 Token 尺寸不得漂移。
- 外壳选择器只能使用 `--line-shell`，内容组件继续使用 `--line` / `--line-strong`；`npm run prototype:check:layout` 必须阻止语义混用。
