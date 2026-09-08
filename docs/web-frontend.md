# Web 前端与客户端还原契约

## 基线与方案

基于本地 `main` 的 `7bc4621`（2026-09-08 创建分支时的 HEAD），分支为 `codex/web-frontend`。

Web 入口直接加载 `src/renderer/src/main.tsx`，因此所有页面、组件、头像、品牌资产、图标、文案、布局、排版及亮暗主题都使用客户端原始文件。没有复制或重写页面，没有修改 Electron Renderer、preload、Runtime 或已有共享契约。

Web 与 Electron 的差异只在宿主：Electron 由 preload 安装 `window.aiEmployeeOS`；Web 由 `src/web/preview-bridge.ts` 安装相同类型的演示适配器。Web 顶部另有 28px 演示说明条，不属于客户端画布。保留原生窗口按钮的安全区，但浏览器不提供 macOS 原生红黄绿窗口按钮。

## 运行

```bash
npm ci
npm run web:dev
```

访问 `http://127.0.0.1:5174/`。只绑定本机回环地址。

```bash
npm run web:test
npm run web:build
npm run web:preview
```

生产产物位于 `dist/web`，预览地址为 `http://127.0.0.1:4174/`。产物可由静态 HTTP 服务器提供，使用相对资产路径；不需要运行 Electron、Python Worker 或 Keychain Helper。沿用项目现有 Node/npm 版本和依赖，没有新增依赖。

## 页面、组件与契约覆盖

| 范围 | 原始实现 / 事实源 | Web 覆盖 |
| --- | --- | --- |
| 应用壳 | `App.tsx`、`components/client-ui.tsx` | Toolbar、Rail、ContextPane、Workspace、左右折叠 |
| 消息 | `App.tsx`、`components/message-ui.tsx`、`MeetingActions.tsx` | 会话列表、搜索、新建、归档、消息、Composer、事项卡片、协作时间线、交付、验收详情、会议动作组件 |
| 通讯录 | `TeamModule.tsx`、`ExpertProfiles.tsx` | 5 位内置专家、身份资料、能力摘要、三步创建、设置、解雇弹窗 |
| 专家团 | `ExpertGroupModule.tsx`、`ExpertGroupDirectory.tsx` | 内置专家团、成员顺序、详情与归档 |
| 招募 | `RecruitmentCatalog.tsx` | 专家及专家团候选目录、资料弹窗、原有状态和动作 |
| 能力 | `ResourceModule.tsx` | 8 个 Skill、15 个 Tool、完整 SKILL.md、依赖、绑定专家、高级信息 |
| 连接 | `ConnectionsCatalog.tsx` | 12 个应用、3 类目录、官方图标、已连接列表空态、飞书配置弹窗 |
| 系统 | `SystemModule.tsx`、`MemoryModule.tsx` | 个人资料、通用、总管、模型服务、资源与权限、记忆与存储、用量与预算、关于与诊断 |
| 通用组件 | `components/client-ui.tsx`、`message-ui.tsx`、`client-icon-system.tsx` | 全部直接复用，包含表单、搜索、列表、状态、卡片、选择目录、弹窗、Markdown、附件、提示 |
| 视觉 | `prototypes/macos-client-v2/src/{layout,typography,styles}.css`、Renderer CSS | 与 Electron 完全相同的加载顺序；宿主 CSS 仅管理说明条和画布 |
| 契约 | `src/shared/*-contract.ts`、`docs/macos-client-component-contract.md` | Bridge、数据模型、字段验证、消息投影、布局、组件契约保持原文件 |

表中的会议动作、异常状态、测试与版本 UI 随同客户端源码保留，不等于演示适配器能执行全部后端动作。既有 Renderer/组件测试覆盖其可见状态；当前浏览器默认示例是已完成事项，不穷举每种后端状态。

## 数据与行为

- `catalog.json` 来自当前源码的 `EmployeeService`、`ResourceService`、`ExpertGroupService` 初始化定义。使用全新的内存数据库导出，不读取本机用户数据库、账号、Token 或历史任务。
- `npm run web:catalog` 可以重新导出目录。导出器只执行 seed/list/detail，不执行 probe、模型调用或 Worker。生成结果应随源码变化一同复核。
- 对话、示例事项、记忆为显式演示数据；内置目录的可用/已发布等状态表示初始化样例，不代表浏览器取得执行权限。模型凭证始终缺失、模型未验证、飞书未连接。
- 会话新建、输入、固定演示回复、取消、归档；专家草稿创建/编辑、禁用/恢复/归档、受约束删除；总管设置和记忆编辑在当前页面内生效，刷新恢复。档案字段继续使用原契约校验。
- 桌面页面原有的个人资料、主题等偏好继续使用当前浏览器 origin 的 localStorage；它们可能跨刷新保留，不与桌面存储共享。
- 模型测试/发布/回滚、任务执行/审批、实际文件操作、飞书 OAuth、资源探测与记忆模型操作明确拒绝，不返回伪造的执行成功或验收证据。
- 浏览器服务只提供前端，不包含 HTTP 后端。以后接入真实 Web 服务时，需以相同 Bridge 契约实现鉴权、传输和事件订阅；不可把桌面 IPC 直接开放到公网。

## 验收证据

- `git diff main -- src/renderer src/shared prototypes docs/macos-client-component-contract.md` 为空，证明客户端页面、通用组件、样式和原契约没有漂移。
- Web 类型检查、现有排版与布局契约检查、Vite 生产构建通过。
- 新增 Web 测试覆盖目录隔离、草稿字段验证与治理、会话回复/取消/退订、拒绝真实副作用、五个模块及八个系统设置页。结合既有 Renderer、Shared 和组件契约测试执行 `npm run web:test`，17 个测试文件、122 项测试全部通过。
- 浏览器已检查消息、专家资料/设置/创建、Skill/Tool 详情、连接目录与全部系统设置页；开发页与生产产物预览均正常加载，未出现控制台错误。
- 画布 960×640、1280×820、1600×1000：顶栏均为 40px、Rail 均为 56px、无页面级横向溢出。浏览器视口额外包含 28px 演示说明条；小于客户端最小尺寸时允许滚动，不擅自改成移动端布局。
- 保留 main 原始头像和完整页面资源，构建会提示主页面 JS chunk 大于 500kB；这不影响构建通过，尚未另做资源压缩或页面拆包。
- 本轮没有接入真实后端，也未将同一真实数据库状态下的 Electron 与浏览器截图做逐像素差分；不能把源码复用与页面检查表述为真实执行已完成。
