# macOS 客户端组件与布局契约

本契约以 `prototypes/macos-client-v2` 为界面与交互事实源，约束正式客户端的布局职责、组件复用和业务边界。原型定义“长什么样、如何组织信息”，Runtime Bridge 定义“哪些功能真实可用”。两者不得互相伪造。

## 1. 固定壳层

正式客户端只有一套一级壳层：

1. `Toolbar`：44px 高的窗口拖拽区，承载当前上下文标题和少量全局动作。
2. `Rail`：56px 宽的一级导航，只承载消息、通讯录、能力与系统入口。
3. `ContextPane`：280px 宽的对象目录、搜索、筛选和创建入口。
4. `Workspace`：业务详情与工作流区域，页面不得自行复制上述三层结构。

窗口尺寸仅由 `src/shared/layout-contract.ts` 管理；视觉尺寸仅由原型 CSS Token 管理，React 组件不得重复声明像素常量。

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

## 3. 页面契约

- 消息：`ContextPane` 展示真实会话；`Workspace` 永久保留 Composer，消息与业务事项共用同一条时间线。
- 通讯录：`ContextPane` 展示真实 Agent 员工；`Workspace` 展示资料、能力摘要和最近交付；三步创建与五分区设置复用 `ClientModal`，测试、发布和治理继续调用真实 Runtime 状态机。
- 能力：`ContextPane` 只按原型展示 Skill、Tool；`Workspace` 展示 SKILL.md、适用任务、依赖、绑定 Agent 与高级信息。MCP 和数据源健康归入系统的资源治理。
- 系统：`ContextPane` 固定承载个人资料、通用、总管、模型服务、资源、记忆与存储、用量、关于；默认打开个人资料，`Workspace` 只显示所选设置页。右侧所有设置分区统一使用单栏阅读流，不为分区说明另建左侧标签栏。

## 4. 状态与数据边界

- 列表、详情、创建、归档、运行状态必须来自 preload 暴露的窄 Bridge。
- 暂未接入的上传、用量等能力明确显示不可用，不用假数据补齐原型。
- 页面状态由顶层模块持有；共享视觉组件保持无业务状态，事件通过 props 上送。
- 当前态必须同时具备视觉类名与可访问名称，不能只依赖颜色表达。
- 原型由 React Aria 提供的焦点、禁用和弹层入场状态，正式客户端必须通过原生伪类或同名 data 属性复用同一套视觉规则。
- Employee 身份字段由 Runtime 版本契约持有：`name`、`role`、`description`、`avatarDataUrl`；详情、创建和设置必须读取同一版本事实。

## 5. 验收标准

- 四个一级模块均复用同一个 `AppShell`，切换时壳层不重排。
- 目录页均复用 `SearchBox`、`ListRow` 和一致的空状态。
- 系统设置均复用单栏 `SettingsBlock`、`SettingRow`，标题、说明与控件保持同一左对齐基线。
- 组件契约测试验证壳层 landmark、一级导航事件和选中态。
- Renderer 测试、TypeScript 检查、生产构建通过，并在真实 Electron 窗口逐页完成视觉检查。
- 960×640、1280×820 和 1600×1000 三档窗口下，Toolbar、Rail、ContextPane、Workspace 与 Modal 的 Token 尺寸不得漂移。
