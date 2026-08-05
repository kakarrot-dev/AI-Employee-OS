# macOS Office and Employee Chat Implementation Plan v1.0

## 1. 目标

依据 [AI Employee macOS Office and Employee Chat UI Spec v1.0](../design-system/AI%20Employee%20macOS%20Office%20and%20Employee%20Chat%20UI%20Spec%20v1.0.md)，把当前 Company/Alex/Task 视图演进为：

1. 全主工作区 Claude Cream 2.5D Office。
2. Codex 式 Employee Chat，包含 Toolbar 身份、连续消息流、可展开活动、右侧 Inspector 和多状态 Composer。

本计划不修改冻结 Runtime/数据库契约，不用 Mock 冒充尚不存在的 Conversation、Message、流式模型文本或多员工能力。

## 2. 当前实现事实

| 当前能力 | 代码位置 | 可复用性 |
| --- | --- | --- |
| App Shell 与 Sidebar | `ContentView.swift`、`AppSidebarView.swift` | 保留原生 `NavigationSplitView`，调整 Destination |
| Claude Cream Token | `DesignSystem/AppTheme.swift` | 继续作为唯一业务色彩来源 |
| Alex 与 Company 页面 | `AlexWorkspaceView.swift`、`CompanyWorkspaceView.swift` | 被 Office/Chat 替代，业务文案可迁移 |
| Task 输入与审批 | `InlineTaskComposer.swift`、`ComposerView.swift`、`TaskStore.swift` | Composer 交互可复用，视觉结构需要重做 |
| Task/Action/Event | `TaskRun.swift`、`TaskStore.swift` | 作为 Message/Activity/Inspector 的真实展示输入 |
| Task 详情 | `TaskDetailView.swift`、`ActionTimelineView.swift` | 内容语义可迁移到 Activity Stream 与 Inspector |
| Artifact 预览 | `MarkdownPreviewView.swift`、`ArtifactService.swift` | 直接复用 |
| Runtime 调用 | `RuntimeService.swift` | 保持不变 |

当前缺失：

- 多员工、部门、通讯录和能力库的 Runtime 读取接口。
- Conversation 与 Message 持久化接口。
- 流式模型文本事件。
- Agent 提问/用户回答协议。
- 结构化审批详情。
- 模型调用用量接口。

因此本轮视觉实施只能以 Alex 和真实 Task/Action/Event/Artifact 完成可验证闭环。缺失契约对应的 UI 必须隐藏或只呈现当前真实语义。

## 3. 技术方向

### 3.1 Office

使用 SwiftUI 原生分层视图，不引入 SceneKit、Unity、WebView 或第三方 3D 引擎：

```text
OfficeWorkspaceView
├── OfficeFloorView
├── DepartmentZoneView
├── WorkstationView
│   ├── EmployeeCharacterView
│   ├── DeskView
│   └── NamePlateView
├── OfficeControlBar
└── EmployeePopover
```

理由：

- 固定镜头不需要完整 3D 场景图。
- 每个工位保持独立 SwiftUI 交互和 Accessibility，避免 `Canvas` 自行实现命中测试。
- 家具和人物使用可缩放 Shape、Path 或 Asset Catalog Vector，不依赖模糊位图。
- 后续多员工只扩展 Presentation Model 与布局，不替换渲染技术。

Office Presentation Model 必须由现有真实 Alex/Task 数据构造，不进入数据库，不成为第二套领域状态。

### 3.2 Employee Chat

```text
EmployeeChatWorkspaceView
├── EmployeeToolbarContent
├── EmployeeMessageStream
│   ├── UserMessageBlock
│   ├── AgentResponseBlock
│   ├── ActivityDisclosureRow
│   ├── ApprovalRecordRow
│   └── ArtifactMessageBlock
├── TaskInspectorView
│   ├── CurrentWorkSection
│   ├── PlanProgressSection
│   ├── AttachmentsSection
│   ├── DeliverableSection
│   ├── UsageSection
│   └── DiagnosticsSection
└── EmployeeComposerContainer
    ├── InputComposer
    ├── WorkingStatusBar
    ├── QuestionComposer
    └── ApprovalActionBar
```

Message Stream 使用 Adapter 把当前真实数据投影为展示项：

- `TaskRun.input` → 用户消息。
- `TaskRun.events` → Activity Row。
- `TaskRun.actions` → 计划与 Action 摘要。
- `TaskRun.error` → 失败消息。
- `evaluation + artifactPath` → 交付消息。

Adapter 不生成 Agent 未真实返回的自然语言回复，不把 Event Type 伪装成模型回答。

## 4. 分阶段实施

### Phase 1：App Shell 与 Office

#### 目标

用真实 Alex 状态交付可运行的 2.5D Office，并把 Sidebar 收敛到已确认的四个入口样式。

#### 修改范围

- `Models/AppDestination.swift`
- `Views/AppSidebarView.swift`
- `Views/ContentView.swift`
- 新增 `Views/Office/` 下的 Office 组件。
- `DesignSystem/AppTheme.swift`
- Asset Catalog 或等价的仓库内矢量资产目录。
- Client Model/Presentation 测试。

#### 实施步骤

1. 将 Office 设为默认 Destination，Sidebar 平铺四项并保留系统 Selection/折叠行为。
2. 建立只读 Office Presentation Model，从当前 Alex 与 active `TaskRun` 派生员工状态、当前工作和 Popover 操作。
3. 实现连续地面、开放桌组、矮部门标牌、Alex 工位、简洁人物和岗位桌面物件。
4. 实现 Office 顶部居中 Material Control Bar；暂不显示没有真实能力支持的创建员工操作。
5. 实现员工 Hover Tooltip、键盘焦点和 macOS Popover。
6. 实现空闲、工作中、等待处理、异常、停用的展示映射；当前无法从事实得到的状态只通过 Preview/Test Fixture 验证，不在 live 数据中伪造。
7. 增加 Reduce Motion 和窗口失焦时的动效降级。

#### 完成标准

- 当前 Alex 在 Office 中可见且状态由真实 Task 派生。
- 点击 Alex 可进入 Chat 或当前工作；员工详情入口在真实页面可用前隐藏或指向现有 Alex 详情。
- `1280 × 820`、`960 × 640`、Sidebar 展开/折叠四种组合截图通过视觉验收。
- Swift 编译、Client presentation checks 和项目门禁通过。

### Phase 2：Employee Chat 静态结构与真实状态投影

#### 目标

把现有 Task 详情重组为 Employee Chat，不改变 Runtime 契约。

#### 修改范围

- 新增 `Views/EmployeeChat/` 组件。
- `Views/TaskDetailView.swift`
- `Views/ActionTimelineView.swift`
- `Views/InlineTaskComposer.swift`
- `Stores/TaskStore.swift` 的只读展示适配与 UI 状态，不改 Runtime 状态机。
- `Support/TaskPresentation.swift`
- Client presentation tests。

#### 实施步骤

1. 实现 Toolbar 的 `状态点 + Alex · AI 产品经理`，点击进入现有员工详情。
2. 建立 `EmployeeChatItem` 展示模型，把 Task Input、Event、Action、Error、Evaluation 和 Artifact 映射为消息流项。
3. 实现用户背景块、Agent 无背景区域、Activity Disclosure Row 和 Artifact Block。
4. 把现有 Task 状态、Action 和 Artifact 重组到右侧 Inspector；默认 `320pt`，支持 `280–420pt` 拖动和收起。
5. 实现离散步骤圆点与可展开完整计划。
6. 重做 Composer 容器，支持输入态、执行状态栏和停止操作；继续调用现有 `TaskStore`。
7. 把当前一次性写入审批从全局 Alert 迁移为底部 Approval Action Bar；只展示当前真实可证明的写入范围，不虚构 Tool 风险详情。
8. 保留失败、取消、`blocked`、`result_unknown`、Artifact 和运行诊断语义。

#### 完成标准

- 用户输入、Task 执行状态、真实 Event/Action、失败和 Artifact 都能在同一 Chat 页面呈现。
- 执行中 Composer 切换为状态栏，并能请求停止。
- Inspector 默认、最窄、最宽、收起四种状态布局稳定。
- Activity 默认收起，失败与人工处理状态可见。
- 没有 Conversation/Message 契约时，不声称已实现长期员工聊天或模型流式回复。

### Phase 3：视觉收敛与状态矩阵

#### 目标

在不扩大产品功能的前提下完成全状态视觉和交互验收。

#### 修改范围

- Phase 1–2 组件。
- `DesignSystem/AppTheme.swift` 与必要的可复用样式。
- `docs/design-system/Claude Cream macOS UI.md`，仅在实现验证后同步已落地规则。

#### 实施步骤

1. 统一 Office、Popover、Tooltip、Message、Inspector、Composer、Approval 的间距、圆角和材料。
2. 扫描所有状态下的文字换行、截断、空状态和错误状态。
3. 验证窗口失焦、Reduce Motion、键盘导航和 VoiceOver Label。
4. 运行 Office 与 Chat 截图矩阵，逐页修正层级、密度和对比度。
5. 删除被替代且无调用方的旧 Company/Alex/Task UI；不清理无关模块。

#### 完成标准

- Spec 第 11–12 节全部有当前环境证据或明确未验证项。
- 页面不依赖虚构员工、虚构消息或虚构 Runtime 状态。
- 旧视图删除后无死 Destination、重复 Composer 或重复 Task 详情路径。

## 5. 后续契约依赖，不属于本 UI 实施

以下能力需要独立 Spec、ADR、canonical 数据模型、Contract 和 Runtime 实现后，才能接入已预留的 UI 插槽：

1. 企业、部门、多员工和员工停用。
2. 长期 Employee Conversation 与 Message History。
3. 模型文字流式 Event。
4. Agent Question 与 User Answer。
5. 结构化 Approval Detail。
6. 模型调用用量与成本。
7. 附件持久化和安全读取。

这些依赖不阻塞 Phase 1 的 Office 视觉交付，也不阻塞 Phase 2 使用现有 Task 事实完成 Chat 结构；但它们阻塞“多员工真实办公室”和“微信式长期员工聊天”的产品完成声明。

## 6. 文件与变更控制

预计涉及超过 8 个 Swift 文件和多个新组件目录，属于跨页面 UI 改造。实施时：

- 每个 Phase 独立提交、独立可运行、独立可回滚。
- 不修改已发布 Migration。
- 不改变 Task/Action 枚举。
- 不引入第三方 UI 或 3D 依赖。
- 不使用 `git add .`。
- 不在 Phase 1–3 顺带实现通讯录、能力库、模型设置或 Multi-Agent。

## 7. 验证

每个 Phase 至少运行：

```bash
./scripts/check.sh
swift build --package-path apps/macos/AIEmployee
./script/build_and_run.sh --verify
./script/validate_distribution.sh
```

手动验证：

- Office：默认/最小窗口，Sidebar 展开/折叠，空闲/运行/异常，Tooltip、Popover、键盘和 Reduce Motion。
- Chat：空输入、长输入、执行状态栏、停止、审批、失败、取消、Artifact、Inspector 调整与收起。
- 不把自动化通过等同于真实 macOS 视觉验收；每个 Phase 必须回读截图。

## 8. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 2.5D 资产与 SwiftUI 布局成本被低估 | Office 延期或视觉粗糙 | 先交付一个真实 Alex 工位和完整交互，再扩展家具变体 |
| 当前单员工数据与目标多员工视觉不一致 | 容易用 Mock 冒充产品能力 | Live 仅显示 Alex；多状态使用 Preview/Test Fixture，不进入发行数据 |
| Chat 目标依赖尚不存在的 Message/Streaming 契约 | UI 看似完成但行为虚假 | 只投影真实 Task/Event；缺失区块隐藏并列为后续契约依赖 |
| Inspector + Sidebar 挤压消息区 | 最小窗口不可用 | Inspector 可收起，宽度限制 `280–420pt`，逐尺寸截图验收 |
| 循环人物动画造成噪声和耗电 | 降低专业感与性能 | 低频动画、失焦停止、Reduce Motion 静态化 |

## 9. 回滚

- Phase 1 可通过恢复原 Destination 与 Company Workspace 回滚，不涉及数据迁移。
- Phase 2 可通过恢复原 Task Detail 与 Composer 路由回滚，不改变 Task 数据。
- 新 Presentation Model 和 UI 组件无持久化副作用，可按 Phase 删除。
- 后续契约能力必须独立迁移，不能夹带进 UI 回滚路径。

## 10. 执行记录（2026-08-05）

已完成：

- App Shell 收敛为 `办公室 / 通讯录 / 工作 / 能力库` 四项平铺导航。
- Office 成为默认首页，使用真实 Alex 与 Task/Action 事实派生员工状态。
- 完成固定镜头的 SwiftUI 2.5D 开放办公室、部门标牌、人物、工位、Tooltip、Popover、Material 控制条和列表切换。
- 完成 Codex 式 Employee Chat：Toolbar 员工身份、用户消息表面、紧凑 Activity Row、右侧 Inspector、离散步骤圆点、悬浮 Composer、执行状态栏与底部审批栏。
- Command Palette、菜单栏与快捷键统一进入员工工作页，旧 Company/Alex/Task Detail 与重复 Composer 已删除。
- MVP 固定为 Claude Cream Light Mode。
- 增加员工状态投影检查，覆盖空闲与 Action 等待处理状态。

当前诚实边界：

- Live Office 只展示真实 Alex，没有使用假员工填充场景。
- 通讯录仅提供 Alex 的真实入口，能力库保留明确未开放状态，本轮没有扩展其功能。
- Employee Chat 只投影现有 Task、Action、Event、Evaluation 和 Artifact；没有伪造长期 Conversation、模型文本流、附件、Agent Question、模型用量或多员工协同。
- 审批详情只展示当前 Golden Path 可证明的一次性 `outputs/PRD.md` 写入范围。

验证：

- `./scripts/check.sh` 通过。
- `swift build --package-path apps/macos/AIEmployee` 通过。
- `./script/build_and_run.sh --verify` 通过并启动真实 `.app`。
- `./script/validate_distribution.sh` 通过。
- Computer Use 回读 Office、Employee Chat 与审批状态；审批选择拒绝，没有产生文件写入。
