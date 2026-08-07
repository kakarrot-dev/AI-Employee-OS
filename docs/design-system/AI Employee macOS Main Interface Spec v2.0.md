# AI Employee macOS Main Interface Spec v2.0

## 1. 文档目的

本文档是 AI Employee OS macOS 主界面的页面级事实源，定义窗口结构、导航、通讯录、连续工作区、交付物、设置、Light/Dark Mode 和视觉验收要求。

界面以现有 Runtime、Task、Action、Employee、Conversation、Approval 和 Artifact 契约为边界。设计不能创建第二套业务状态，也不能用静态内容伪装尚未实现的能力。

参考产品分工如下：

- Codex 提供原生 macOS 窗口、连续任务工作区、低干扰信息层级和底部 Composer 的参考。
- Bloome 提供模块轨、上下文列表、员工目录、会话 Row、内嵌交付物和两栏设置组件的参考。
- Claude Cream 是唯一自定义视觉 Token。
- macOS 系统行为优先于网页产品的视觉模拟。

## 2. 事实源与范围

发生冲突时，按项目根目录 `AGENTS.md` 中的事实源优先级裁决。本文档只定义界面结构和交互表现，不修改持久化模型或跨进程契约。

### 2.1 包含

- 主窗口与双层导航。
- 办公室、通讯录、工作库、场景库（暂定）、知识库、技能库、工具库和设置八个一级页面。
- AI 员工目录、员工详情和员工编辑入口。
- 连续消息流、执行活动、审批、异常和交付物。
- 可折叠 Inspector 和固定底部 Composer。
- 主窗口内的设置页面与自适应设置分类导航。
- Light/Dark Mode。
- 默认、最小和宽屏窗口适配。
- Hover、键盘焦点、Reduce Motion 和辅助功能状态。

### 2.2 不包含

- 虚构员工、虚构任务或虚构交付物。
- Bloome 的真人联系人、群组和社交关系模型。
- Multi-Agent 协作、部门负责人调度或跨员工任务拆分。
- Cloud Sync、Marketplace、企业 RBAC 和实时网页抓取。
- 云端创建员工、账户计费、额度、单价和充值入口。
- 为接近参考图而复制第三方图形资产。

## 3. 设计原则

- 主界面是连续工作空间，不是 Dashboard。
- 信息层级依靠结构、留白、字重和相邻表面建立，不给所有内容添加圆角卡片。
- Material 只用于系统浮层、Popover、Command Palette 和 Composer。
- 主工作区不使用大面积玻璃、渐变或阴影。
- 原生 Sidebar、Toolbar、Settings、Menu、Alert 和键盘行为优先。
- SwiftUI 无法稳定实现的窗口或文本行为，才使用最小范围 AppKit interop。
- 所有业务状态从现有 Task、Action、Employee、Conversation 和 Artifact 事实派生。

## 4. 主窗口

### 4.1 Scene

- MVP 主窗口使用单实例 `Window("AI Employee OS", id: "main")`，避免多个窗口共享员工、会话草稿和审批状态。
- 默认尺寸为 `1280 × 820pt`。
- 最小尺寸为 `720 × 520pt`。
- 主窗口保留系统窗口控件、拖动、缩放和状态恢复。
- 不使用 borderless window，不自绘标题栏。
- 隐藏可见标题时仍保留有意义的逻辑窗口标题。

### 4.2 默认布局

```text
┌────────────────────┬─────────────────────────────────────────────┐
│ 全局 Sidebar       │ Workspace                                   │
│ 200...260pt        │ Office / Directory / Work / Skills / Tools │
│                    │ / Settings                                  │
└────────────────────┴─────────────────────────────────────────────┘
```

- 全局 Sidebar 默认 `232pt`，允许在 `200...260pt` 之间调整。
- 一级入口固定为办公室、通讯录、工作库、场景库（暂定）、知识库、技能库、工具库；设置固定在 Sidebar 底部。场景库保存可复用定义，启动后的 Business Flow 实例只在工作库展示。
- 场景创建与配置在场景库主区域内完成，不使用 Sheet。编辑页固定分为「业务 SOP」「节点配置」「校验与启动」三个页签。
- 业务目标使用完整 Markdown SOP，至少承载背景与目标、输入、执行步骤、约束和验收标准。AI 只能基于 SOP 提议节点，不能替换或压缩用户确认的 SOP。
- 知识库只读展示 Runtime SQLite `knowledge_sources` / `knowledge_chunks` 的 canonical 来源、内容与索引状态；本地目录只能作为待导入来源，文件存在不等于已进入 Runtime Knowledge，也不会自动注入员工 Context。
- 页面确实需要对象列表时，在 Workspace 内使用页面级第二列或 Inspector，不在全局 Shell 叠加永久模块轨。
- Workspace 使用剩余空间。
- 窗口进入紧凑宽度时，全局 Sidebar 通过原生按钮折叠，Workspace 保持可用。
- Inspector 不占用固定第三列，只在当前任务有可检查内容时出现。

## 5. 全局 Sidebar

全局 Sidebar 只负责一级页面切换，不显示任务详情、员工元数据或执行证据。

从上到下包含：

1. AI Employee OS 标识。
2. 办公室。
3. 通讯录。
4. 工作库。
5. 技能库。
6. 工具库。
7. 底部设置入口。

规则：

- 使用原生 Sidebar List、单色 SF Symbols 和文字标签。
- 品牌头独立于导航列表，使用 `64pt` 高度承载产品标识与 Local-first 定位，不伪装成可选 Row。
- 导航 Row 高度为 `38pt`，使用 `8pt` 圆角和 Claude Cream Primary 的低对比选中背景；未选中图标使用 Muted，避免整列暖金图标争夺注意力。
- 同一时刻只显示一个一级模块选中态。
- 不显示商城、充值、额度、移动端和付费入口。
- 设置在主窗口 Workspace 内打开，不使用独立 Settings Scene、Sheet 或弹窗。

## 6. 上下文 Sidebar

页面级 Sidebar 只服务于对象选择，例如通讯录的员工列表、工作库的历史任务列表。它属于 Workspace，不与全局 Sidebar 永久并列。

### 6.1 通用结构

```text
模块标题                                  主要操作
搜索

Section
  Row
  Row
```

- 标题区高度为 `52...56pt`。
- 标题水平边距为 `16pt`。
- 搜索框高度约 `36pt`，左右边距为 `16pt`。
- 普通 Row 高度为 `40...44pt`。
- 员工或会话 Row 高度为 `52...58pt`。
- Section 之间使用 `16...24pt` 留白或 Hairline Divider。
- 删除等危险操作只出现在 Context Menu、管理入口或 Hover 状态。
- 选中背景使用 Primary 的 `8...12%` 透明度，不显示高饱和左侧选中线。

### 6.2 办公室

- 全局 Sidebar 后直接展示 Alex 的工作状态、当前目标、执行进度与最近工作。
- 单员工 MVP 不绘制空工位、虚构办公室或团队占位；这类图形会把可靠工作台误导成模拟经营界面。
- 首屏主操作固定为“交给 Alex”，进行中的真实工作是唯一高层级内容表面。
- 最近工作使用连续 Row，不使用统计卡片或员工卡片网格。

### 6.3 工作上下文

- 顶部主要操作为“新建工作”。
- 会话 Row 显示标题、一行摘要和时间或状态。
- 时间和状态不同时堆叠。
- 未读标记必须有真实状态来源。
- 点击会话恢复员工、Conversation 和关联 Task 上下文。

### 6.4 技能库与工具库

- 技能库和工具库是两个独立一级页面，不使用分段控件在同一页切换。
- 技能库展示 Skill 的名称、版本、状态和适用员工。
- 工具库展示 Tool 的连接状态、权限、风险与适用范围。
- Runtime 尚未提供目录数据时显示明确空状态，不把执行历史误称为安装目录。

## 7. 通讯录

通讯录是 AI 员工目录，不是即时通讯好友录。

### 7.1 Sidebar

```text
通讯录                                    新建员工
搜索员工

产品部
  Alex · AI 产品经理
```

- 员工按一层部门分组，部门支持折叠。
- 员工 Row 使用 `32...36pt` 稳定标识。
- 第一行显示姓名和岗位。
- 第二行显示派生状态或当前工作摘要。
- 状态颜色来自 `AppTheme`，颜色不是唯一状态表达。
- 当前只有 Alex 时只显示 Alex，不添加虚构同事。

### 7.2 未选择员工

Workspace 显示轻量引导：

```text
AI 员工通讯录

从左侧选择一名员工，查看职责、能力和工作边界。

[新建 AI 员工]
```

- 不显示云端创建选项。
- 不显示没有契约支持的联系人邀请和群组入口。

### 7.3 员工详情

员工详情按以下顺序展示：

1. 姓名、岗位、部门和启用状态。
2. 使命。
3. 职责。
4. 工作边界。
5. Soul 与 Persona 摘要。
6. Skills 与 Tools。
7. 默认折叠的 Effective Prompt。

主要操作为“开始对话”，次要操作为“编辑员工”。详情使用连续页面，不给每个字段组添加卡片。

### 7.4 员工标识

- 列表尺寸为 `32...36pt`。
- 详情尺寸为 `56...64pt`。
- 选择器尺寸为 `72...80pt`。
- 使用 Claude Cream 约束下的低饱和背景和高对比图形或字母。
- 每个标识具有稳定 identity，不能只靠颜色区分。
- 不复制 Bloome 的头像资产。

## 8. 连续工作区

工作区使用 Codex 式连续文档布局，不使用传统左右气泡聊天。

信息顺序固定为：

1. 当前员工和运行状态。
2. 用户目标或消息。
3. Agent 响应。
4. Action 执行活动。
5. Approval、blocked、failed 或 result_unknown。
6. Artifact。
7. 默认折叠的运行诊断。

### 8.1 Toolbar

左侧显示：

```text
● Alex · AI 产品经理
```

- 状态点为 `7pt`。
- 员工名使用 semibold，岗位使用 secondary。
- 窄窗口只保留状态点和员工名。
- 右侧只保留 Inspector 开关和必要的任务操作菜单。
- 不放装饰性 Share、Grid 或 More 按钮。

### 8.2 用户内容

- 最大宽度为 `680pt`。
- 使用 Surface Soft 背景块。
- 圆角为 `10...12pt`。
- 内边距为 `14...16pt`。
- 不显示气泡尖角和头像。

### 8.3 Agent 内容

- 无背景，直接显示在 Canvas 上。
- 不在每条消息前重复 Alex 头像和姓名。
- Markdown、列表、引用和代码复用现有解析能力。
- 消息块垂直间距为 `20...24pt`。
- Agent 完成回复后，Hover 状态可以显示复制操作。

### 8.4 执行活动

Action 和 Tool 调用使用紧凑 Disclosure Row：

```text
› 分析需求                              已完成
› 生成 PRD                              执行中
› 写入交付物                            等待授权
```

- 行高为 `38...44pt`。
- 行与行之间使用 Divider，不包进独立卡片。
- `failed`、`blocked` 和 `result_unknown` 默认展开。
- 原始 Runtime Event 收纳到诊断区。

## 9. Artifact

Artifact 是完成状态的视觉主锚点，直接嵌入连续工作区。

```text
PRD · 已通过质量门禁                         打开

AI Employee 主界面设计规格
产品需求文档 · Alex · 刚刚完成

[Markdown Preview]

保存位置：...
```

- 宽度为 `520...680pt`，不超过正文宽度。
- 使用一个 Surface Card 表面。
- 圆角为 `12pt`，边框为 `1px` Hairline。
- 默认无阴影；需要与 Canvas 分离时只允许轻量阴影。
- 标题、摘要和元信息依靠间距与 Divider 建立层级。
- 文件路径作为次要证据显示。
- `deliveryAllowed == false` 时不能显示为已交付。
- `result_unknown` 显示人工核验入口，禁止自动重放。
- 不显示没有真实来源的价格、指标和状态。

## 10. Composer

- Composer 固定在 Message Stream 底部，不横跨 Inspector。
- 内容最大宽度为 `780...820pt`。
- 空输入高度为 `64pt`，多行最大高度约 `180pt`。
- 默认水平边距为 `24pt`，最小窗口下降为 `16pt`。
- 底部边距为 `16...20pt`。
- 圆角为 `16...18pt`。
- 可以使用 `.regularMaterial` 和低对比阴影。
- 默认 Composer 只发送日常聊天消息，调用 Conversation，不创建 Task，也不触发 Tool 审批。
- “交给员工工作”是用户明确触发的独立入口；在意图识别或 Skill 转换能力完成前，普通消息不得自动转为 Task。
- 运行状态、停止和审批作为 Composer 上方的独立状态条展示，不替换聊天输入；执行中和等待审批时仍允许继续聊天。
- 聊天主操作始终为发送；工作模式使用独立草稿和明确的提交工作操作。
- 支持 `⌘↩` 提交。
- 不显示没有真实接入的实时模型、多人 @、语音或成本功能。

## 11. Inspector

- 默认宽度为 `320pt`，范围为 `280...420pt`。
- 用户选择按窗口保存。
- 最小窗口默认收起 Inspector。
- 内容顺序为当前任务、执行计划、Approval/异常、Artifact 和诊断。
- Section 使用 Divider、标题字重和间距建立层级，不添加独立卡片。
- Message Stream 的可读宽度优先于 Inspector 常驻。

## 12. Settings

Settings 使用独立 macOS `Settings` Scene，通过 `⌘,` 打开。Bloome 的两栏信息结构可以复用，灰色遮罩和网页模态行为不采用。

### 12.1 窗口

- 默认尺寸约为 `820 × 620pt`。
- 最小尺寸约为 `720 × 520pt`。
- 左侧设置导航为 `220...240pt`。
- 右侧表单区域自适应，内容最大宽度约为 `620pt`。
- 使用系统自适应窗口背景，不硬编码白色。

### 12.2 分类

- 通用。
- 模型。
- Runtime/连接。
- 权限与审批。
- 外观。
- 关于。

账户、额度和单价只有在存在真实账户与计费契约后才能加入。

### 12.3 表单

- 左侧选中项使用低对比胶囊背景。
- Section 垂直间距为 `24...32pt`。
- 单行字段高度为 `36...44pt`。
- 多行输入按内容决定高度。
- 保存操作位于 Toolbar 或内容末端，不能悬浮在被裁切的位置。
- 使用系统 TextField、Picker、Toggle、SecureField 和 Button。

## 13. 颜色、材质与层级

- Claude Cream 是唯一自定义 Palette。
- Feature View 禁止直接读取固定 `.light` Palette。
- Feature View 禁止使用 `.blue`、`.green`、`.orange`、`.red` 表达业务状态。
- Canvas、Sidebar、Inspector 和 Artifact 必须使用对应语义 Token。
- Primary 只用于主要操作、焦点、Selection 和关键状态。
- 图标 tint 只表达语义，不用于装饰。
- 主工作区不使用整页 Material、渐变或玻璃控制岛。
- 圆角只用于输入、Selection、Artifact 和确实需要独立边界的表面。

## 14. Light/Dark Mode

应用跟随系统外观，不强制 `.preferredColorScheme(.light)`。

### 14.1 Light

- Canvas 使用暖白 Claude Cream。
- Sidebar 比 Canvas 略深或使用系统 Sidebar 材质。
- Artifact 比 Canvas 略亮。
- Hairline 在不增加阴影的前提下分隔相邻区域。

### 14.2 Dark

- 不使用纯黑背景。
- Canvas 使用 `#2D2E2D`。
- Sidebar 和 Inspector 与 Canvas 保持低对比但可见的表面差。
- Artifact 使用 `#303030` 附近表面。
- 暖金 Primary 只用于焦点、Selection 和主要操作。
- disabled、Hover、Focus 和 Selection 状态都必须可辨认。

## 15. 窗口缩放

### 15.1 默认 `1280 × 820pt`

- 全局 Sidebar 展开。
- Workspace 使用剩余空间。
- Inspector 只在内容需要时展开。

### 15.2 最小 `720 × 520pt`

- 全局 Sidebar 默认折叠，通过原生 Sidebar 按钮打开。
- 页面内双栏切换为选择驱动的单栏或收起次级列。
- Inspector 默认收起。
- Composer 水平边距降为 `16pt`。
- Toolbar 隐藏岗位和次要按钮。
- 主内容可用宽度不得低于约 `480pt`。

### 15.3 宽屏

- Message Stream 最大宽度为 `820pt`，不随窗口无限拉宽。
- 多余空间留白或分配给 Inspector。
- 不用新增 Dashboard Card 填满空间。

## 16. 交互状态

每个核心控件至少验证 Default、Hover、Pressed、Keyboard Focus、Selected、Disabled、Loading 和 Error。

业务状态必须覆盖：

- Task：`pending | running | succeeded | failed | cancelled`。
- Action：`pending | running | succeeded | failed | blocked | result_unknown | cancelled`。
- Composer：聊天空输入、聊天发送中、聊天错误、显式工作模式、运行中仍可聊天、等待审批仍可聊天。
- Sidebar：展开、折叠、键盘选择和 Context Menu。
- Inspector：展开、收起、最小宽度和最大宽度。
- Window：前台、后台、默认尺寸、最小尺寸、宽屏、Light 和 Dark。
- Reduce Motion：停止非必要循环动效。

## 17. SwiftUI 与 AppKit 边界

优先使用 `WindowGroup`、`NavigationSplitView`、`inspector`、Toolbar、Settings、Menu、Popover、`@SceneStorage` 和系统控件。

只有以下情况可以增加 AppKit interop：

- SwiftUI 无法稳定读取或约束主窗口行为。
- 系统 API 无法满足窗口焦点、拖动或恢复要求。
- 必须使用 AppKit 文本系统能力。
- SwiftUI Split View 无法稳定满足 Inspector 宽度和折叠要求。

AppKit bridge 必须集中在单独文件中，不得把 `NSWindow` 修改散布到 Feature View。

## 18. 文件边界

目标结构：

```text
Views/AppShell/
  AppShellView.swift
  ModuleRailView.swift
  ContextSidebarView.swift

Views/Directory/
  EmployeeDirectoryView.swift
  EmployeeDirectorySidebar.swift
  EmployeeDetailView.swift

Views/Conversation/
  ConversationWorkspaceView.swift
  MessageStreamView.swift
  ActivityRow.swift
  ArtifactPreviewView.swift
  ComposerView.swift
  TaskInspectorView.swift

Views/Settings/
  SettingsView.swift
  SettingsSidebarView.swift
  Settings sections...
```

`ContentView` 只负责根组合和模块路由，不承载具体 Sidebar Row、消息、Artifact、Composer 或设置表单。

实现时优先合并现有 `ConversationWorkspaceView` 与 `EmployeeChatWorkspaceView` 的职责，不创建第三套工作页面。

## 19. 验收门禁

每完成一个界面，必须运行：

```bash
./script/build_and_run.sh --verify
./scripts/check.sh
```

随后真实启动应用并采集：

- 默认尺寸 Light。
- 默认尺寸 Dark。
- 最小尺寸 Light。
- 最小尺寸 Dark。
- 宽屏尺寸。
- 上下文 Sidebar 展开与折叠。
- Inspector 展开与收起。
- 空状态。
- 运行中。
- 审批或 `blocked`。
- `failed`。
- `result_unknown`。
- `succeeded + Artifact`。

对照报告必须包含参考图、实现截图、结构差异、尺寸和间距差异、色彩和材质差异、交互状态差异、接受项、待修项和无法验证项。

编译通过不代表界面验收通过。没有真实截图和状态验证时，不得声称主界面完成。
