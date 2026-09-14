# Web 原型与 Electron 客户端对照审计

审计日期：2026-09-10。基于 `main / 7bc4621` 加当前未提交工作区，不能把结果归于该 commit 本身。

**结论：五个一级模块和八个系统分区已有页面，但交互没有全部对齐；布局、排版、组件和动效契约仅部分遵守。当前不满足“原型与客户端完整一致”的验收条件。**

本轮只新增本目录中的审计报告、隔离验收用例和结果，没有修复或改写现有产品代码。现有未提交修改保持原状。原型的演示数据与客户端真实业务数据分别核查，不以演示成功推断真实服务能力。

## 1. 范围和证据

| 验证 | 结果 | 证明范围 |
| --- | --- | --- |
| `npm run prototype:check:layout` | 通过 | 现有脚本列出的静态规则；不能证明最终 CSS 层叠值一致 |
| `npm run prototype:check:typography` | 通过 | 原型目录 CSS；漏检正式 Renderer 适配层 |
| `npx vitest run src/main/prototype-contract.test.ts src/renderer/src` | 11 个文件、124 项通过 | 现有页面、组件及状态测试，使用 Mock Bridge |
| `npm run typecheck` | 失败，3 项 TS6307 | 新增会议原型文件未纳入 Web TypeScript 项目 |
| `npx vite build prototypes/macos-client-v2` | 通过 | Web 原型可打包；存在依赖 `use client` 和 chunk 大小警告，未作为功能失败 |
| `npx electron-vite dev` | 主进程、preload 构建通过，真实窗口已运行 | 开发模式可启动，不等于 `npm run build` 通过 |
| 本轮隔离验收 | 5 项全部失败 | 草稿串会话、草稿丢失、流式输出串会话、选中态语义、方向键页签切换 |
| 实际 UI | 完成有限范围对照 | Electron 五模块、八个系统分区、创建弹窗、搜索、草稿、页签；Web 页面切换、尺寸读数及附件菜单 |

Web 使用 960×640、1280×820、1600×1000 视口抽查，并额外检查 1800×1100 上限行为。Electron 检查默认窗口；没有完成 Electron 三档尺寸、所有主题与所有异常状态的组合矩阵。深色、系统主题及减少动态效果主要依据源码，未完成全量视觉验收。

本轮没有发送真实模型请求、会议邀请或确认卡片，没有执行授权、断开连接、发布、归档或删除。流式串会话使用隔离 Mock Bridge 复现；草稿和方向键问题同时在真实客户端复现。

## 2. 页面覆盖

“已有”指页面与主要路径存在，不代表每个业务动作都完成真实服务验收。

| 页面/区域 | 当前实现 | 对齐结果 |
| --- | --- | --- |
| 全局顶栏、导航栏、列表栏、工作区 | 客户端统一 `AppShell`；40px 顶栏与原生窗口控件 | 客户端有共享壳层，但 Web 消息页与其他页加载不同样式，切换时布局和主题值变化 |
| 消息列表、搜索、新建、未读、归档 | 存在真实 Bridge 调用；已查看历史会话 | 搜索无结果缺少提示；列表选中态没有可访问状态；Web 的“删除”和客户端“归档”不是同一行为 |
| 普通消息、Markdown、过程记录、交付 | 核心消息组件已共享 | Web 普通历史附件仍使用另一套无动作组件；流式事件未按会话隔离 |
| Composer、文本输入、附件、模型/语音入口 | 固定输入框、Enter/Shift+Enter/输入法判断、真实附件 Bridge；模型/语音有说明入口 | 草稿切会话串入、切模块丢失；未开放模型切换/语音不应算成已实现功能 |
| 事项边栏、定位、详情、变更、会议动作卡 | 组件和 Runtime 调用存在；相关现有测试通过 | 定位忽略减少动态效果；本轮未执行真实变更、外部写入与异常恢复 |
| Web 飞书会议完整流程 | 结构化表单、八阶段、会议专家团、摘要预览/下载 | 明确限定为本地演示；客户端未接入该整页及会后妙记流程，是已声明的范围差异 |
| 通讯录专家目录与详情 | 搜索、资料、能力摘要、设置与解雇入口 | 方向键切换 Tab 缺失、筛选空态缺失；资料组件存在并行实现 |
| 专家团目录与详情 | 客户端真实已招募列表；Web 示例目录 | Web 详情可“选择并进入会话”；客户端该入口位于招募目录，专家团详情主要提供资料与解雇，入口不等价 |
| 创建专家 | 三步、字段约束、模型单选、能力多选、缺依赖门禁 | 流程存在且有测试；Web 与客户端分别维护布局，非同一创建组件 |
| 专家设置 | 两端都是基本资料、提示词、模型与能力、记忆四分区 | 组件文档仍写“五分区＋测试发布”；客户端当前没有这些独立页面，不能依据旧文档称完整实现 |
| 招募专家/专家团 | 客户端候选目录、资料、定向会话入口 | 客户端扩展页面，Web 无完整对应页面，不能按像素对齐判定 |
| Skill 目录与详情 | 搜索、真实完整 `instructionsMarkdown`、步骤、依赖、绑定员工、高级信息 | 文档确实呈现；Web 把 SKILL.md 放在前部，客户端放在步骤/依赖/绑定员工之后，详情排版不是同一组件 |
| Tool 目录与详情 | 来源、权限、凭据、健康、关联 Skill、绑定员工 | 存在；不伪造 SKILL.md，符合边界；筛选空态和选中态仍有缺口 |
| 连接目录 | 12 应用、3 分组、官方图标、真实飞书/Teams 状态 | 基本结构覆盖；Web 静态、客户端真实连接属于合理数据差异；文档仍称仅飞书可用，已过时 |
| 飞书/Teams 管理弹窗 | 两套连接流程调用窄 Bridge，复用 `ClientModal` | 源码与现有测试覆盖，未在本轮执行真实授权/断开；不能据此声称外部服务全链路通过 |
| 系统八分区 | 个人资料、通用、总管、模型服务、资源与权限、记忆与存储、用量与预算、关于与诊断 | 八页实际可进入；客户端复用单栏 `SettingsBlock/SettingRow`，页面覆盖成立 |
| 记忆治理、用量、诊断子功能 | 存在真实 Bridge、错误反馈和具体内容 | 本轮只读检查，不把页面存在扩展为写入、删除、服务故障恢复已验收 |

页面映射依据：[客户端入口](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/App.tsx:978>)、[Web 入口](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:1145>)、[系统模块](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/SystemModule.tsx:233>)。

## 3. 发现与优先级

### F01 · P1 · 草稿没有按会话持有，切模块后丢失

预期：草稿属于会话；切换会话不能把 A 的输入带入 B，暂离消息模块后返回应恢复。Web 用 `conversationSessions[id]` 在顶层保存草稿；组件契约也要求页面状态由顶层模块持有。

实际：`Workbench` 内部只有一个 `draft`。会话 ID 变化时清空附件等状态，却没有切换到该会话的草稿；离开消息模块会卸载 `Workbench`，内部草稿随之丢失。

- 真实窗口复现：A 输入“界面对照草稿 A（未发送）”→点击 B，B 输入框仍有该文本→切到通讯录再返回，文本为空。没有发送。
- 两项隔离验收均失败：会话隔离、跨模块保留。
- 修复方向：顶层以 conversationId 保存文本和附件草稿；切换与卸载时保持归属和恢复逻辑一致。

证据：[局部状态与切换 effect](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/App.tsx:409>)、[条件挂载](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/App.tsx:982>)、[Web 会话状态](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:1089>)、[页面状态契约](</Users/kakarrot/Dev/AI Employee OS/docs/macos-client-component-contract.md:90>)。

### F02 · P1 · A 会话的流式回复会进入 B 会话

预期：历史消息和实时消息必须保持同一会话归属。

实际：事件协议只有 requestId，没有 conversationId；preload 将事件全量转发，当前 `Workbench` 收到任何 `output_delta` 都写入当前消息数组，没有检查请求归属。

- 隔离复现：在 A 发起 Mock 请求→切到 B→发出 A 的 `output_delta`，B DOM 出现该回复的 `streaming-response` 和完整无障碍标签。
- 影响：会话显示被污染；取消与完成状态也使用同一组局部请求状态，需要随修复一起验证。
- 修复方向：从主进程到 Renderer 保留 conversationId/requestId 归属，按会话存储和订阅流式状态；覆盖切换、返回、后台完成及取消。
- 本轮证明的是 Renderer 错误投影，没有验证持久化数据库串写，不应把两者混淆。

证据：[事件协议](</Users/kakarrot/Dev/AI Employee OS/src/shared/runtime-contract.ts:172>)、[preload 转发](</Users/kakarrot/Dev/AI Employee OS/src/preload/index.ts:31>)、[无过滤的接收逻辑](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/App.tsx:470>)。

### F03 · P1 · 当前 TypeScript 构建门禁失败

`npm run typecheck` 返回 3 项 TS6307，涉及 `FeishuMeetingPage.tsx`、`feishu-meeting-demo.ts`、`useFeishuMeetingSessions.ts`。Renderer 测试引用这些文件，但 `composite` 项目的 `include` 没覆盖它们。

`npm run build` 包含 `typecheck`，所以当前不能宣称生产构建验收通过。开发服务器和 Vite 原型打包成功不覆盖这一失败。

修复方向：明确原型共享代码和测试的 TypeScript 项目归属，补齐 include 或独立项目引用，保持类型检查开启。

证据：[TypeScript 配置](</Users/kakarrot/Dev/AI Employee OS/tsconfig.web.json:13>)、[原型测试引用](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/FeishuMeetingPage.test.tsx:3>)、[构建命令](</Users/kakarrot/Dev/AI Employee OS/package.json:18>)。

### F04 · P2 · 布局和主题有两套有效值，字号绕过 Token

客户端先加载原型 CSS，再全局加载 `prototype-adapter.css`。适配层重新定义主题、栏宽、页面间距和字号。Web 只在消息页挂载整个适配层，离开就卸载。当前消息页局部复用规则确实这样规定，但它与全局“视觉 Token 只定义一次、切模块壳层不重排”的契约冲突。

1280×820 下 Web 的实际计算样式：

| 项目 | 消息页（加载客户端适配层） | 通讯录页（不加载适配层） |
| --- | --- | --- |
| Rail | 56px | 52px |
| ContextPane | 276px | 264px |
| Workspace 起点 | x=332px | x=316px |
| 顶栏标题字号 | 13px | 14px |
| 列表栏标题字号 | 17px | 18px |
| Rail 背景 | `#f5f4f0` | `#edeae4` |
| 内容背景 | `#faf9f6` | `#fbfaf7` |

字体族两端使用相同的系统字体栈（包含 SF Pro Text、PingFang SC），没有发现另引字体族；问题集中在字号、字距和语义值。适配层有 **16 条未直接使用语义 Token 的排版声明**，其中包括 13px、17px、18px、10px 字号及多处字距/行高，另含 1 条头像比例计算。旧 CSS 还有原始数值，但没有逐一证明它们当前可见，故不把其全部计为有效页面缺陷。

最大工作表面也未按现行文档约束：1800×1100 Web 视口下 `.prototype` 为 1800×1100；`--layout-shell-max-height:1000px` 没有起限制作用，而文档要求 1600×1000 后居中留白。此处也需先确定文档是否应更新。

修复方向：确定一套全局视觉基线，将最终值归回共享 Token；消息专属适配只包含消息局部规则。布局数值变更同步契约和验收，不能继续叠加页面覆盖。

证据：[加载顺序](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/main.tsx:4>)、[适配层 Token](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/prototype-adapter.css:1>)、[原始字号](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/prototype-adapter.css:145>)、[Web 条件挂载](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:1148>)、[窗口契约](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/LAYOUT_CONTRACT.md:5>)。

### F05 · P2 · 组件复用不完整，已出现行为分叉

已经直接共享：`ClientIconSystem`、消息页 `Toolbar`、`ChatMessage`、`MarkdownMessage`、`ChatContentBlock`；会议原型还直接共享动作卡、附件与状态组件。这部分复用真实存在。

但 Web `App.tsx` 仍自行定义 `IconButton/Avatar/StatusLight/SearchBox/ListRow/Toolbar/SettingsBlock/SettingRow` 等组件以及普通消息附件组件；与客户端共享组件存在 24 个同名视觉组件定义（不表示每个实现都逐字相同）。创建/设置/详情页也分别维护。

已确认的行为分叉：

- Web 普通历史消息的 `AttachmentOpenMenu` 展示“使用系统默认应用打开”“在 Finder 中定位”，却没有 `onAction`；用户附件的打开按钮也没有回调。实际点击菜单只关闭，没有预览、下载或不可用解释。
- 客户端共享附件组件只按调用方提供的回调展示动作；会议 Web 原型也已使用可执行的预览/下载模式。普通消息没有同步迁移。
- Skill 详情分别维护内容顺序与 Markdown 包装；当前展示全量文档，但不存在单一详情组件。

修复方向：优先迁移公共壳层、目录组件和普通消息附件到已有共享组件；差异通过 props/adapter 表达，示例附件若无文件应给出明确不可用状态。组件共名、CSS 共名不足以构成复用契约。

证据：[Web 并行组件](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:392>)、[无动作附件菜单](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:507>)、[共享附件实现](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/components/message-ui.tsx:157>)、[客户端 Skill 详情](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/ResourceModule.tsx:63>)。

### F06 · P2 · Tab 只复制语义外壳，没有复制键盘行为；列表缺少选中状态

通讯录原型使用 React Aria `Tabs/Tab`，客户端换成 `role="tab"` 的普通按钮，只有 onClick，没有方向键处理及 roving tabindex。

- 真实 UI 对照：聚焦“专家”按右方向键，Web 切到“专家团”，客户端仍停在“专家”。
- 共享 `ListRow` 选中时只增加 `is-selected`，没有 `aria-current` 或等价选中状态；无障碍树无法读出哪一行是当前对象。
- 两项隔离验收均失败。现有 ListRow 测试只断言 class，未检查状态语义。

修复方向：两端复用同一 Tab 行为组件；为共享目录行选择合适的可访问状态，并覆盖键盘切换与选中状态验收。

证据：[原型 Tab](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:687>)、[客户端 Tab](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/App.tsx:957>)、[ListRow](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/components/client-ui.tsx:52>)、[原有选中态测试](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/components/client-ui.test.tsx:43>)。

### F07 · P2 · 目录未覆盖统一 filtered-empty 状态

客户端专家目录输入不存在的关键词后，只剩空白列表，右侧仍是先前详情。Web 通讯录则明确显示“没有匹配的专家/专家团”。客户端专家团只在原始数组为空时提示，没有处理过滤后为空；消息、Skill/Tool 目录也缺少过滤无结果提示。

修复方向：先计算过滤结果，再区分 loading、error、初始 empty、filtered-empty；复用统一目录空态。是否保留先前详情可按产品契约处理，但必须明确列表筛选结果。

证据：[客户端目录分支](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/App.tsx:948>)、[原型空态](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:693>)、[一致空态要求](</Users/kakarrot/Dev/AI Employee OS/docs/macos-client-component-contract.md:98>)。

### F08 · P2 · 弹窗退场和减少动态效果没有完整复用

共享 CSS 定义了 overlay/modal 的 entering 与 exiting 动画。客户端 `ClientModal` 把 `data-entering` 固定留在 DOM，关闭时直接 `return null`，没有 `data-exiting` 和延迟卸载，因而只复用了入场样式，退场动画不会运行。

事项定位另有分叉：Web 根据 `prefers-reduced-motion` 选择 auto/smooth；客户端 `locateMatter` 固定传入 `behavior:'smooth'`。CSS 中的 `scroll-behavior:auto!important` 不能替代 JS 调用参数的判断。

已符合的部分：共享 hover/pressed 规则、焦点/禁用映射、CSS reduced-motion 降级存在；真实客户端创建弹窗 Esc 关闭及焦点返回正常，原有嵌套弹窗测试通过。不能把局部缺口扩大为所有动效失效。

修复方向：两端使用相同弹层生命周期组件或进入/退出状态机；所有程序化滚动统一调用带 reduced-motion 判断的方法。验证进入、退出、中途关闭和系统减少动态效果。

证据：[弹窗实现](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/components/client-ui.tsx:168>)、[动画规则](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/styles.css:3426>)、[客户端定位](</Users/kakarrot/Dev/AI Employee OS/src/renderer/src/App.tsx:647>)、[Web 定位](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/src/App.tsx:750>)。

### F09 · P2 · 契约文档和自动检查不足以支持完成声明

| 项目 | 现行文档 | 当前源码/运行结果 |
| --- | --- | --- |
| 标准 Rail / 列表栏 | 56 / 280px | 基础 Token 52 / 264px；适配后 56 / 276px |
| Body / Heading / Title | 13 / 15 / 20px | Token 12 / 14 / 18px，另有适配层原始值 |
| 大弹窗 | 960×720 | Token 与实际原型为 900×680 |
| 专家设置 | 五分区、测试发布和生命周期页面 | 两端当前均四分区；测试发布不在设置中操作 |
| 上传和用量 | 尚未接入 | 客户端已有附件 Bridge 与真实用量聚合 |
| 连接 | 飞书真实，其余 11 项静态 | 飞书和 Teams 均已有真实连接入口；同文档末尾又追加 Teams 内容 |

排版检查的扫描根只有 `prototypes/macos-client-v2/src`，不扫描 `src/renderer/src/prototype-adapter.css`；布局检查虽然读取适配层，但没有阻止本轮实际存在的栏宽覆盖。现有 contract 测试验证源码片段和旧 class 是否改名，没有对两端最终计算样式或跨页面稳定性作断言。

修复方向：按最终产品决策重写契约与对齐矩阵，移除过时完成口径；检查覆盖所有实际加载的 CSS/TSX 和最终计算值。对确定为 Web 演示或客户端扩展的页面明确豁免，不能同时保留相互冲突的规则。

证据：[排版扫描范围](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/scripts/check-typography-contract.mjs:39>)、[原型源码契约测试](</Users/kakarrot/Dev/AI Employee OS/src/main/prototype-contract.test.ts:9>)、[对齐矩阵中的过时边界](</Users/kakarrot/Dev/AI Employee OS/docs/macos-client-prototype-parity-matrix.md:33>)、[排版文档](</Users/kakarrot/Dev/AI Employee OS/prototypes/macos-client-v2/TYPOGRAPHY_CONTRACT.md:7>)。

## 4. 建议修复顺序与验收

1. **先修消息归属与构建**：F01–F03。五条隔离用例转绿，新增附件草稿和后台完成/取消回归，TypeScript 通过。
2. **统一全局视觉事实源**：F04、F09。确定最终 Token，三档窗口下切五模块不再重排；文档、原型、客户端、检查结果一致。
3. **完成组件与交互迁移**：F05–F08。复用目录 Tab/空态/选中态、附件菜单和弹窗生命周期；功能入口必须有动作或明确边界。
4. **补齐最终验收证据**：在真实 Electron 逐页验证三档尺寸、浅深色/系统主题、键盘/鼠标、减少动态效果；对连接/会议的外部副作用单独使用已授权测试场景。

不要为了对齐旧文档重新加入已经退出当前 UI 的测试发布页、历史治理入口或假会议能力；应先确定当前产品边界，再让文档与实现一致。

## 5. 复现材料

- [隔离验收用例](</Users/kakarrot/Dev/AI Employee OS/docs/audits/2026-09-10-prototype-parity/reproduce.test.tsx>)
- [独立 Vitest 配置](</Users/kakarrot/Dev/AI Employee OS/docs/audits/2026-09-10-prototype-parity/vitest.config.ts>)
- [本次结果 JSON](</Users/kakarrot/Dev/AI Employee OS/docs/audits/2026-09-10-prototype-parity/reproduction-results.json>)

在仓库根目录执行：

```bash
npx vitest run --config docs/audits/2026-09-10-prototype-parity/vitest.config.ts
```

这些是故意保留的失败验收，全部使用 Mock Bridge，不调用真实模型或外部系统。它们位于 docs 审计目录，不进入现有 `src/**/*.test.*` 默认套件；修复后应迁移或合并到正式测试，并消除重复 fixture。
