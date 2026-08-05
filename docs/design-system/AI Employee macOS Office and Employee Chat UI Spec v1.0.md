# AI Employee macOS Office and Employee Chat UI Spec v1.0

## 1. 文档目的

本 Spec 固化 AI Employee macOS Client 的两个核心页面：

1. `Office`：以 Claude Cream 2.5D 开放办公室展示 AI 员工及其当前工作状态。
2. `Employee Chat`：以 Codex 式连续消息流承载用户与单名 AI 员工的沟通、执行可观测性、审批和交付。

本 Spec 只定义客户端样式、布局、视觉状态和交互表现，不改变 Runtime、Task、Action、Approval、Tool、Memory、Knowledge 或模型调用契约。

## 2. 范围

### 2.1 包含

- macOS 原生 App Shell 与可折叠 Sidebar。
- `办公室 / 通讯录 / 工作 / 能力库` 四个平铺一级入口。
- Light Mode Claude Cream 视觉系统。
- 固定镜头、全主工作区的 2.5D 开放办公室。
- 员工工位、人物、部门标牌、Tooltip 和 Popover。
- 员工聊天页 Toolbar、消息流、右侧 Inspector 和底部 Composer。
- 执行、停止、提问、审批、失败和交付的客户端表现。
- Reduce Motion、键盘、窗口尺寸和辅助功能要求。

### 2.2 不包含

- Dark Mode。
- 可旋转、可拖动或可缩放的 3D 场景。
- Multi-Agent 协同、部门负责人调度或跨员工任务拆分。
- 企业、部门、员工、Skill、Tool 的持久化管理实现。
- 新的 Runtime API、数据库 Schema 或模型 Provider 接入。
- 工作列表、通讯录、能力库的完整页面设计。
- Marketplace、自定义 Skill、自定义 Tool。

## 3. 事实与展示边界

- 当前仓库 MVP 只有 Alex。实现时办公室只展示真实 Alex，不用静态假员工填满场景。
- 员工状态必须由已存在的 Agent 与 Task/Action 事实派生；只允许用户显式停用员工，不建立手工“忙碌”状态。
- Swift 不推理 Task 或 Action 终态，不直接执行 Tool，也不直接读取 SQLite。
- 当前 Runtime 没有长期 Conversation、Message、流式模型文本和结构化审批详情契约。客户端不得用本地假消息伪装这些能力已完成。
- 当前可以把真实 Task 输入、Runtime Event、Action、Evaluation 和 Artifact 投影为消息流；无法展示的未来状态必须隐藏，而不是填充占位数据。

## 4. 视觉命题

**温暖、克制、有生活感的 macOS AI 办公室。**

- Claude Cream 是唯一自定义色彩系统。
- 主工作区以连续空间和信息内容建立层级，不堆叠 Dashboard Card。
- 2.5D 人物与办公场景承担产品辨识度，原生 Sidebar、Toolbar、Popover、Menu、Split View、Alert 和辅助功能保持 macOS 行为。
- Material 只用于办公室悬浮控制条、Popover 和临时浮层。
- 动效表达状态，不承担装饰。

## 5. App Shell

### 5.1 Sidebar

Sidebar 默认展开并保留 macOS 原生折叠能力。只显示四个平铺入口：

| 入口 | SF Symbol | 职责 |
| --- | --- | --- |
| 办公室 | `building.2` | 查看员工及当前工作状态 |
| 通讯录 | `person.2` | 按部门查找员工并进入聊天 |
| 工作 | `bubble.left.and.bubble.right` | 查看员工工作与会话记录 |
| 能力库 | `square.grid.2x2` | 查看内置 Skills 与 Tools |

规则：

- 不显示企业 Logo、企业名称或分组标题。
- 图标保持单色，不自绘选中背景。
- Selection 使用 macOS 系统强调色。
- Settings 使用独立 macOS Settings Scene，不进入 Sidebar。

### 5.2 窗口

- 默认窗口：`1280 × 820`。
- 最小窗口：`960 × 640`。
- Office 在 Sidebar 折叠后自动使用新增宽度。
- Employee Chat 在窄窗口下允许收起 Inspector，消息区优先保持可读。
- MVP 强制 Light Appearance，不对未设计的 Dark Mode 做自动反色。

## 6. Office Spec

### 6.1 页面目标

Office 首屏回答：

1. 企业中有哪些 AI 员工。
2. 每名员工是否空闲、工作中、等待处理、异常或已停用。
3. 工作中的员工正在处理什么。
4. 用户可以从哪里进入员工聊天、当前工作或员工详情。

### 6.2 空间与构图

- 场景占满整个主工作区，不在下方拼接列表、统计卡或 Dashboard。
- 开放式办公室，不使用封闭房间和高墙。
- 地板连续铺满窗口，不显示悬浮沙盘边缘。
- 部门通过桌组方向、地毯明度、过道、绿植、矮柜和入口标牌区分。
- 桌组自然、不完全对称，但员工工位必须清晰可定位。
- 使用固定镜头；不支持拖拽、旋转和缩放。
- 场景按窗口尺寸重排或裁切，不能只把整张办公室等比缩成中央小图。

### 6.3 光线与材质

- 固定温暖日间自然光。
- 光源方向稳定，家具、人物和铭牌阴影一致。
- 地面使用 `Canvas`，桌面与纸张使用 `Surface Soft / Surface Card`，轮廓使用 `Hairline`。
- 阴影柔和、低对比，不使用写实高光、霓虹屏幕或戏剧性聚光。
- 木质、绿植和织物只使用低饱和自然色，并受 Claude Cream Palette 约束。

### 6.4 部门区域

- MVP 视觉结构支持企业下一层部门，不展示多级递归树。
- 每个桌组入口放置矮立式部门标牌。
- 部门标牌显示部门名称；员工数量仅在真实数据可用时显示。
- Hover 部门标牌时可轻微突出该桌组，其余区域只降低少量对比度。
- 不使用大面积地面文字或整块状态染色。

### 6.5 员工人物与工位

- 使用正常人体比例的简洁等距人物，不使用 Q 版大头。
- 共享统一基础人物、动作骨架和视角，只通过少量发型、服装和配饰区分。
- 工位共享统一桌椅与设备基础件；岗位可以增加 1–2 个低饱和桌面物件。
- 姓名以桌前自然铭牌显示，不使用悬浮胶囊标签。
- 默认只显示姓名；岗位和当前工作通过 Hover Tooltip 或点击 Popover 展示。

### 6.6 状态表现

| 状态 | 人物/工位表现 | 色彩 |
| --- | --- | --- |
| 空闲 | 放松坐姿或安静查看桌面 | Success |
| 工作中 | 面向屏幕打字，屏幕低频变化 | Accent Teal |
| 等待处理 | 动作暂停，铭牌显示提示标记 | Warning |
| 异常 | 动作暂停，工位出现稳定异常标记 | Error |
| 已停用 | 人物和屏幕降低饱和度 | Muted |

- 工作中状态允许非常轻微的呼吸外圈，周期约 2–2.5 秒。
- 窗口失焦或开启 Reduce Motion 时停止循环动效。
- 十几名员工同时显示时不得全部使用高频动画。

### 6.7 顶部悬浮控制条

控制条居中叠在办公室顶部，办公室布局预留安全区。

内容：

- 员工搜索。
- `办公室 / 列表` Segmented Control。
- 创建员工 `+`。

规则：

- 使用 macOS Material、轻 Hairline 和极弱阴影。
- 搜索默认紧凑，聚焦后展开。
- `+` 只在创建员工能力真实可用时显示。
- 不显示企业名称、统计指标或第二个主要按钮。

### 6.8 Hover 与点击

Hover Tooltip：

```text
Alex · AI 产品经理
正在处理：企业知识库 PRD
```

- 最多两行，无按钮，无滚动。
- 键盘聚焦提供等价信息。

点击员工打开锚定工位的 macOS Popover：

```text
Alex
AI 产品经理 · 产品部
● 工作中

当前工作
企业知识库 PRD

[查看工作]
员工详情 〉
```

- 空闲员工主操作为“分派工作”。
- 等待处理时主操作为“处理问题”。
- 已停用员工不显示分派入口。
- Popover 点击外部或按 `Esc` 关闭；切换员工时不叠加多个 Popover。

### 6.9 Office 空状态与当前 MVP

- 当前只有 Alex 时，使用一个真实部门桌组和一个真实员工工位。
- 不创建虚构同事、虚构任务或虚构部门填充画面。
- 通过共享桌、绿植、过道和留白保持空间完整，而不是用空员工卡占位。
- 若员工数据不可用，显示可恢复错误与重试，不显示空办公室假装企业无人。

## 7. Employee Chat Spec

### 7.1 页面目标

Employee Chat 是用户与单名 AI 员工沟通和观察工作的主要页面。页面同时回答：

1. 当前正在和哪名员工沟通。
2. 用户和员工刚刚说了什么。
3. 员工正在执行什么、进行到哪一步。
4. 是否需要用户回答、审批或处理异常。
5. 当前工作产生了什么交付物。

### 7.2 总体布局

```text
Sidebar | Message Stream | Inspector
                          |
                        可折叠
```

- Message Stream 是主视觉区域。
- Inspector 默认展开，默认宽度 `320pt`，允许拖动，范围 `280–420pt`。
- Inspector 宽度变化时内部 Section 自适应；不得无限挤压消息区。
- Composer 悬浮在 Message Stream 底部，不横跨 Inspector。

### 7.3 Toolbar 员工身份

使用 macOS 原生 Toolbar 显示：

```text
● Alex · AI 产品经理     ···
```

- `Alex` 使用中等字重，岗位使用次级文字色。
- 名称和岗位整体可点击，进入员工详情。
- 不显示头像和部门。
- 状态点映射真实员工状态；工作中使用轻微呼吸外圈。
- 窄窗口优先保留姓名，岗位可收起。

### 7.4 Message Stream

- 使用 Codex 式连续文档布局，不使用左右聊天气泡。
- 用户消息使用 `Surface Soft` 背景块，无气泡尖角，圆角 `10–12pt`。
- Agent 回复无背景，直接铺在 Canvas 上。
- 消息区设置舒适的最大阅读宽度，不横跨全部可用空间。
- 不显示消息头像，不在每条 Agent 回复前重复员工姓名。
- Agent 文本自然流式出现，不显示闪烁光标或“正在输入”。
- 用户向上阅读时不强制滚回底部。
- Agent 回复完成后，仅 Hover 显示轻量“复制”；不显示点赞、点踩、分享或重试。

### 7.5 Activity Row

Tool 调用和执行活动使用紧凑 Disclosure Row：

```text
› 读取 3 个附件                    已完成
› 使用 Requirement Analysis Skill 已完成
› 调用 Document Tool              正在执行
```

- 无独立 Card，使用 SF Symbol、标题、状态和 Chevron。
- 默认保持收起，当前活动也不自动展开。
- 展开后显示参数摘要、阶段输出、耗时和可复制技术字段。
- 失败、等待审批和 `result_unknown` 可以自动展开关键说明。
- Secret 和未脱敏内容不得显示。

### 7.6 Composer 状态机

#### 可输入

- 悬浮圆角 Composer，左右内缩 `24–32pt`，底部间距 `16–20pt`。
- 使用 `Surface Card`、轻 Hairline 和柔和阴影，圆角 `16–18pt`。
- 输入区从约 `52–60pt` 开始，最多增长到 6–8 行，之后内部滚动。
- 左下角 `+` 使用原生 Menu 添加文件。
- 附件以紧凑 Chip 显示文件名、类型、大小、错误和移除操作。
- 发送按钮为 Claude Cream Primary 暖金色圆形按钮，使用深色向上箭头。

#### 执行中

Composer 整体替换为状态栏：

```text
● Alex 正在工作
  正在分析用户访谈                         [停止]
```

- 当前活动摘要限制一行。
- “停止”使用低强调文字按钮，Hover 时增强 Error 色。
- 正在停止时替换为“正在停止…”，不允许重复触发。

#### Agent 提问

- 恢复输入 Composer。
- 顶部明确显示 Agent 的问题和需要用户回答的范围。
- 用户提交回答后重新进入执行状态栏。

#### 审批

底部切换为审批操作栏：

```text
Alex 请求写入文件                     展开详情 〉
仅限本次工作 · outputs/PRD.md    [拒绝] [允许一次]
```

- `允许一次` 使用 Primary，`拒绝` 使用普通次级按钮。
- 可展开详情显示 Tool、完整路径、风险、授权范围、预计副作用和网络访问。
- 详情与操作栏保持同一表面，不弹第二个自绘窗口。
- 处理结果以精简记录进入消息流。

### 7.7 Inspector

使用连续 macOS Inspector Section、Divider 和 Disclosure Group，不使用独立 Card。

顺序：

1. 当前工作。
2. 执行计划。
3. 附件。
4. 交付物。
5. 模型用量。
6. 运行诊断。

执行计划默认只显示当前步骤和离散步骤圆点：

```text
●━━●━━◉━━○   3 / 4
正在分析用户访谈
```

- 点击后展开完整计划与步骤摘要。
- 已完成使用 Success，当前使用 Accent Teal，未开始使用 Hairline，失败使用 Error，等待处理使用 Warning。
- 模型用量和运行诊断默认收起。
- 没有附件、交付物或用量事实时隐藏对应 Section，不显示空壳。

## 8. Claude Cream Token 使用

- `Canvas`：Office 地面与 Chat 主背景。
- `Surface Soft`：用户消息、Inspector 次级区域。
- `Surface Card`：Composer、Popover 的主要内容表面。
- `Primary`：发送、允许一次、关键焦点。
- `Accent Teal`：工作中、当前步骤。
- `Success`：空闲、已完成。
- `Warning`：等待回答、等待审批。
- `Error`：失败、结果未知、停止 Hover。
- `Hairline / Hairline Soft`：Inspector 分隔、Activity Row 和轻边界。

Feature View 禁止直接使用 `.blue / .green / .orange / .red` 表达业务语义。

## 9. 动效

- Hover、Popover、Disclosure 和 Composer 状态切换使用 `120–220ms`。
- 工作中状态点外圈呼吸周期 `2–2.5s`。
- Office 人物动作低频循环，窗口失焦时停止。
- 禁止页面进入时的整体弹跳、缩放或连续装饰动画。
- Reduce Motion 下：状态点静态、人物静态、所有布局切换使用无位移动画或即时切换。

## 10. 可访问性与键盘

- Sidebar 可通过系统快捷键折叠。
- Office 每个员工工位是独立可聚焦元素，Accessibility Label 包含姓名、岗位、状态和当前工作摘要。
- Tooltip 信息必须通过 VoiceOver Label 或 Help 等价提供。
- Popover 支持 `Esc` 关闭。
- Composer 支持键盘输入、附件菜单和发送。
- 审批按钮具备明确名称和焦点顺序，不允许默认回车误触高风险操作。
- 状态不只依赖颜色，必须同时具备文字、图标或动作差异。

## 11. 验收场景

### 11.1 Office

- 默认 `1280 × 820`、最小 `960 × 640` 均无工位遮挡、部门标牌冲突或控制条覆盖。
- Sidebar 展开与折叠后办公室构图均完整。
- Alex 空闲、工作中、等待处理、异常、停用五种视觉状态可区分。
- Hover Tooltip、点击 Popover、键盘聚焦和 `Esc` 关闭可用。
- 当前只有 Alex 时不出现虚构员工或虚构任务。
- Reduce Motion 下无循环人物动画和呼吸动画。

### 11.2 Employee Chat

- Toolbar 正确显示员工、岗位和状态。
- 用户消息有背景，Agent 回复无背景，长 Markdown 可读。
- Activity Row 默认收起，展开后不破坏消息滚动。
- Inspector 默认展开，可在 `280–420pt` 调整并可收起。
- Composer 可输入、增长、添加附件、发送；空输入不可提交。
- 执行中替换为状态栏，并能请求停止。
- Agent 提问时恢复输入；审批时切换到结构化操作栏。
- 成功、失败、取消、`blocked`、`result_unknown` 和 Artifact 均有明确表现。
- 用户向上滚动时，流式更新不强制跳到底部。

## 12. 视觉验收输出

每次实现迭代至少提供：

- Office：`1280 × 820` 与 `960 × 640` 截图。
- Employee Chat：空闲、执行中、审批、成功、失败五个状态截图。
- Sidebar 展开与折叠截图。
- Inspector 默认、最窄、最宽和收起截图。
- Reduce Motion 手动检查记录。
