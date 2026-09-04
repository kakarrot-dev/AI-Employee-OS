import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contract = await readFile(`${root}/src/layout.css`, 'utf8')
const styles = await readFile(`${root}/src/styles.css`, 'utf8')
const app = await readFile(`${root}/src/App.tsx`, 'utf8')
const windowContract = await readFile(`${repositoryRoot}/src/shared/layout-contract.ts`, 'utf8')
const rendererStyles = await readFile(`${repositoryRoot}/src/renderer/src/prototype-adapter.css`, 'utf8')
const rendererComponents = await readFile(`${repositoryRoot}/src/renderer/src/components/client-ui.tsx`, 'utf8')
const rendererMessageComponents = await readFile(`${repositoryRoot}/src/renderer/src/components/message-ui.tsx`, 'utf8')
const rendererApp = await readFile(`${repositoryRoot}/src/renderer/src/App.tsx`, 'utf8')
const rendererConnections = await readFile(`${repositoryRoot}/src/renderer/src/ConnectionsCatalog.tsx`, 'utf8')
const rendererSystem = await readFile(`${repositoryRoot}/src/renderer/src/SystemModule.tsx`, 'utf8')
const iconSystem = await readFile(`${repositoryRoot}/src/renderer/src/components/client-icon-system.tsx`, 'utf8')

async function readTsxSources(directory) {
  const sources = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) sources.push(...await readTsxSources(path))
    if (entry.isFile() && entry.name.endsWith('.tsx')) sources.push({ path, source: await readFile(path, 'utf8') })
  }
  return sources
}

const clientTsxSources = [
  ...await readTsxSources(`${repositoryRoot}/src/renderer/src`),
  ...await readTsxSources(`${root}/src`)
]

const requiredTokens = [
  '--layout-window-default-width',
  '--layout-window-default-height',
  '--layout-window-min-width',
  '--layout-window-min-height',
  '--layout-toolbar-height',
  '--layout-toolbar-inline-padding',
  '--layout-toolbar-navigation-edge-padding',
  '--layout-toolbar-window-controls-gap',
  '--layout-toolbar-collapsed-navigation-width',
  '--layout-rail-width',
  '--layout-context-width',
  '--layout-workspace-min-width',
  '--layout-window-controls-safe-left',
  '--layout-window-controls-safe-top',
  '--icon-size-inline',
  '--icon-size-control',
  '--icon-size-standard',
  '--icon-size-navigation',
  '--icon-size-feature',
  '--layout-message-content-max-width',
  '--layout-message-stream-item-max-width',
  '--layout-detail-content-max-width',
  '--layout-summary-row-min-height',
  '--layout-detail-modal-inline-padding',
  '--layout-detail-modal-block-padding',
  '--layout-detail-section-block-padding',
  '--layout-detail-component-gap',
  '--layout-detail-summary-padding',
  '--layout-detail-metric-min-width',
  '--layout-message-attachment-card-width',
  '--layout-attachment-carousel-control-size',
  '--layout-attachment-open-menu-width',
  '--layout-message-collapse-lines',
  '--layout-message-process-collapse-lines',
  '--layout-composer-control-size',
  '--layout-composer-attachment-size',
  '--layout-composer-scroll-fade-height',
  '--layout-timeline-node-size',
  '--layout-timeline-inline-padding',
  '--layout-modal-small-width',
  '--layout-modal-small-height',
  '--layout-modal-medium-width',
  '--layout-modal-medium-height',
  '--layout-modal-large-width',
  '--layout-modal-large-height'
]

const requiredUsages = [
  'min-width: var(--layout-window-min-width);',
  'min-height: var(--layout-window-min-height);',
  'padding: 0 var(--layout-toolbar-inline-padding);',
  'padding-right: var(--layout-toolbar-navigation-edge-padding);',
  'grid-template-columns: calc(var(--layout-rail-width) + var(--layout-context-width)) minmax(0, 1fr);',
  'grid-template-columns: var(--layout-rail-width) var(--layout-context-width) minmax(var(--layout-workspace-min-width), 1fr);',
  'width: min(100%, var(--layout-message-content-max-width));',
  'width: min(100%, var(--layout-message-stream-item-max-width));',
  'padding: var(--layout-detail-summary-padding);',
  'gap: var(--layout-detail-component-gap);',
  'min-width: var(--layout-detail-metric-min-width);',
  'grid-template-columns: var(--layout-modal-navigation-width) minmax(0, 1fr);',
  'width: min(var(--layout-modal-large-width), calc(100dvw - max(var(--layout-modal-overlay-gutter), var(--layout-window-controls-safe-left)) - var(--layout-modal-overlay-gutter)));',
  'height: min(var(--layout-modal-large-height), calc(100dvh - max(var(--layout-modal-overlay-gutter), var(--layout-window-controls-safe-top)) - var(--layout-modal-overlay-gutter)));',
  '--timeline-inline-padding: var(--layout-timeline-inline-padding);',
  'width: var(--layout-timeline-node-size);',
  'width: var(--layout-composer-attachment-size);',
  'margin-top: calc(-1 * var(--layout-composer-scroll-fade-height));',
  'scrollbar-width: none;'
]

const scrollSurfaces = [
  '.context-scroll',
  '.message-scroll',
  '.detail-canvas',
  '.modal-content__main',
  '.matter-detail-content',
  '.detail-browser-content',
  '.model-config-content',
  '.composer-attachment-tray',
  '.message-attachments--user.message-attachments--multiple .message-attachments__rows'
]

function cssPixels(token) {
  const match = contract.match(new RegExp(`${token}:\\s*(\\d+)px`))
  return match ? Number(match[1]) : null
}

function tsNumber(property) {
  const match = windowContract.match(new RegExp(`${property}:\\s*(\\d+)`))
  return match ? Number(match[1]) : null
}

const errors = []
const missingTokens = requiredTokens.filter((token) => !contract.includes(`${token}:`))
const missingUsages = requiredUsages.filter((usage) => !styles.includes(usage))
const shellLineDefinitionCount = [...styles.matchAll(/--line-shell\s*:/g)].length
const darkShellLineDefinitionCount = [...styles.matchAll(/--line-shell:\s*rgb\([^;]+\/\s*7%\);/g)].length

if (missingTokens.length) errors.push(`缺少尺寸 Token: ${missingTokens.join(', ')}`)
if (missingUsages.length) errors.push(`关键布局未使用尺寸契约:\n${missingUsages.join('\n')}`)
if (shellLineDefinitionCount !== 3) errors.push('外壳分隔线只能通过 --line-shell 分别定义亮色、显式暗色和系统暗色主题，不得重复声明')
if (!/--line-shell:\s*rgb\([^;]+\/\s*5%\);/.test(styles) || darkShellLineDefinitionCount !== 2) errors.push('--line-shell 必须遵守亮色 5%、暗色 7% 的低干扰对比契约')
if (styles.includes('--shell-divider:') || rendererStyles.includes('--shell-divider:')) errors.push('不得创建 --line-shell 的页面级别名，外壳必须直接复用统一语义 Token')

if (!iconSystem.includes("library: 'iconoir-react'") || !iconSystem.includes('strokeWidth: 1.5')) {
  errors.push('客户端图标系统必须由 ClientIconSystem 固定 Iconoir 与 1.5 线宽')
}
if (!app.includes('<ClientIconSystem>') || !rendererApp.includes('<ClientIconSystem>')) {
  errors.push('原型与正式客户端必须复用同一个 ClientIconSystem Provider')
}
for (const { path, source } of clientTsxSources) {
  if (path.endsWith('/client-icon-system.tsx')) continue
  if (source.includes('IconoirProvider')) errors.push(`页面不得绕过 ClientIconSystem 创建 Provider: ${path}`)
  if (/<svg(?:\s|>)/.test(source)) errors.push(`页面不得手绘 SVG 图标: ${path}`)
  if (/\bwidth=\{\d+\}\s+height=\{\d+\}/.test(source)) errors.push(`页面不得声明图标像素尺寸: ${path}`)
  if (/[✓×›]/.test(source)) errors.push(`页面不得用文本字符模拟图标: ${path}`)
  if (/from\s+['"](?:lucide-react|react-icons|@heroicons|@mui\/icons|phosphor-react)/.test(source)) errors.push(`客户端只允许使用 Iconoir 图标库: ${path}`)
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
}

function selectorsUsing(source, token) {
  const selectors = []
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!match[2].includes(`var(${token})`)) continue
    selectors.push(...match[1].split(',').map((selector) => selector.trim()))
  }
  return selectors
}

const allowedShellLineSelectors = new Set([
  '.toolbar',
  '.rail',
  '.context-pane',
  '.window-controls-safe-area',
  '.matter-sidebar',
  '.matter-sidebar__header'
])
const invalidShellLineSelectors = [...selectorsUsing(styles, '--line-shell'), ...selectorsUsing(rendererStyles, '--line-shell')]
  .filter((selector) => !allowedShellLineSelectors.has(selector))
if (invalidShellLineSelectors.length) errors.push(`--line-shell 只能用于持久外壳边界: ${[...new Set(invalidShellLineSelectors)].join(', ')}`)

for (const [source, selector, property] of [
  [styles, '.toolbar', 'border-bottom'],
  [styles, '.rail', 'border-right'],
  [styles, '.context-pane', 'border-right'],
  [rendererStyles, '.window-controls-safe-area', 'border-right'],
  [rendererStyles, '.matter-sidebar', 'border-left'],
  [rendererStyles, '.matter-sidebar__header', 'border-bottom']
]) {
  const rule = cssRule(source, selector)
  if (!new RegExp(`${property}:\\s*1px solid var\\(--line-shell\\)`).test(rule)) {
    errors.push(`${selector} 必须以 1px solid var(--line-shell) 复用低干扰外壳分隔线`)
  }
  if (/var\(--line(?:-strong)?\)/.test(rule)) {
    errors.push(`${selector} 不得把内容边框 Token 用作持久外壳分隔线`)
  }
}

for (const [selector, property] of [
  ['.prototype.is-context-collapsed .context-pane', 'border-right'],
  ['.matter-sidebar.is-collapsed', 'border-left']
]) {
  if (!new RegExp(`${property}:\\s*0`).test(cssRule(rendererStyles, selector))) {
    errors.push(`${selector} 折叠到 0 宽时必须同时移除外壳分隔线`)
  }
}

if (cssPixels('--layout-message-content-max-width') !== cssPixels('--layout-detail-content-max-width')) {
  errors.push('对话流与详情内容必须共享同一内容宽度边界，避免主工作区左右留白失衡')
}

if ((cssPixels('--layout-message-stream-item-max-width') ?? Infinity) > (cssPixels('--layout-message-content-max-width') ?? 0)) {
  errors.push('信息流组件最大宽度不得超过对话内容容器')
}

const modalContentRule = styles.match(/\.modal-content\s*\{([^}]*)\}/s)?.[1] ?? ''
const modalMainRule = styles.match(/\.modal-content__main\s*\{([^}]*)\}/s)?.[1] ?? ''
const prototypeRule = styles.match(/\.prototype\s*\{([^}]*)\}/s)?.[1] ?? ''
const toolbarContentRule = cssRule(styles, '.toolbar__content')
const workspaceCenterRule = cssRule(styles, '.workspace-center')
const messageCanvasRule = cssRule(styles, '.message-canvas')
const wideDetailCanvasRule = cssRule(styles, '.detail-page--wide .detail-canvas')
if (!/width:\s*100%/.test(prototypeRule) || /width:\s*min\(100%,\s*var\(--layout-shell-max-width\)\)/.test(prototypeRule)) {
  errors.push('应用主壳层必须跟随窗口完整宽度，不得再受固定最大宽度截断')
}
for (const [selector, rule] of [['.toolbar__content', toolbarContentRule], ['.workspace-center', workspaceCenterRule]]) {
  if (!/width:\s*100%/.test(rule) || rule.includes('var(--layout-workspace-content-max-width)')) {
    errors.push(`${selector} 必须填满语义工作区；最大宽度只能约束内部正文，不得截断窗口骨架`)
  }
}
if (!messageCanvasRule.includes('var(--layout-message-content-max-width)')) {
  errors.push('对话正文必须保留独立最大宽度，避免宽屏阅读行长失控')
}
if (!wideDetailCanvasRule.includes('var(--layout-workspace-content-max-width)')) {
  errors.push('宽版详情内容必须保留独立最大宽度，避免卡片和表单无限拉伸')
}
if (!/height:\s*100%/.test(prototypeRule) || /height:\s*min\(100%,\s*var\(--layout-shell-max-height\)\)/.test(prototypeRule)) {
  errors.push('应用主壳层必须跟随窗口完整高度，不得再受固定最大高度截断')
}
if (!/display:\s*flex/.test(modalContentRule) || !/flex-direction:\s*column/.test(modalContentRule)) {
  errors.push('弹窗内容区必须使用纵向 Flex 布局，为共享滚动区域提供受限高度')
}
if (!/min-height:\s*0/.test(modalMainRule) || !/flex:\s*1/.test(modalMainRule) || !/overflow-y:\s*auto/.test(modalMainRule)) {
  errors.push('弹窗主内容必须以 min-height: 0、flex: 1 和 overflow-y: auto 形成独立滚动区域')
}

for (const [cssToken, tsProperty] of [
  ['--layout-window-default-width', 'defaultWidth'],
  ['--layout-window-default-height', 'defaultHeight'],
  ['--layout-window-min-width', 'minWidth'],
  ['--layout-window-min-height', 'minHeight']
]) {
  if (cssPixels(cssToken) !== tsNumber(tsProperty)) {
    errors.push(`${cssToken} 与 CLIENT_WINDOW_LAYOUT.${tsProperty} 不一致`)
  }
}

if (/\.(?:rail|context-pane)[^{]*\{[^}]*display:\s*none/s.test(styles)) {
  errors.push('图标栏或列表栏被隐藏，违反固定三栏契约')
}

if (!app.includes('function Toolbar({ title, support, trailing }') || !app.includes('className="window-controls-safe-area"') || !app.includes('className="toolbar__workspace"') || !app.includes('data-layout-contract="application-toolbar"')) {
  errors.push('顶部栏必须复用集成式 macOS 窗口栏，保留原生窗口控制安全区、当前标题和必要操作')
}

if (!rendererComponents.includes('data-layout-contract="application-toolbar"') || !rendererComponents.includes('data-toolbar-zone="navigation"') || !rendererComponents.includes('data-toolbar-zone="actions"')) {
  errors.push('客户端顶部栏缺少统一容器与插槽契约')
}

for (const [selector, source] of [['.toolbar', styles], ['.window-controls-safe-area', styles], ['.toolbar__workspace', styles], ['.toolbar__content', styles], ['.toolbar__identity', styles], ['.toolbar__trailing', styles]]) {
  if (!/-webkit-app-region:\s*drag/.test(cssRule(source, selector))) errors.push(`${selector} 必须属于全宽窗口拖拽区域`)
}

if (!/-webkit-app-region:\s*no-drag/.test(cssRule(styles, '.toolbar :is(button, a, input, textarea, select, [role="button"])'))) {
  errors.push('顶部栏交互控件必须显式退出窗口拖拽区域')
}

if (rendererStyles.includes('--layout-toolbar-height:')) {
  errors.push('正式客户端不得覆盖顶部栏高度事实源')
}

if (!cssRule(rendererStyles, '.prototype.is-context-collapsed .toolbar').includes('var(--layout-toolbar-collapsed-navigation-width)')) {
  errors.push('左侧栏收起后的顶部导航槽位必须保留 macOS 窗口控件安全区')
}

if (/-webkit-app-region:\s*no-drag/.test(cssRule(rendererStyles, '.window-controls-safe-area'))) {
  errors.push('窗口控制安全区不得整体退出拖拽区域，只允许其中的交互控件 no-drag')
}

if (app.includes('className="traffic-lights"') || styles.includes('.traffic-lights span')) {
  errors.push('Renderer 不得重复绘制 macOS 原生三色窗口按钮')
}

if (/toolbar-(?:history|more)/.test(app)) {
  errors.push('集成顶部栏不得恢复前进、后退或更多按钮')
}

for (const selector of ['.workspace-center', '.toolbar__content', '.topic-bar']) {
  const rule = styles.match(new RegExp(`${selector.replace('.', '\\.') }\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  if (/border-(?:left|right|bottom)\s*:/.test(rule)) errors.push(`${selector} 不得使用容器结构分割线`)
}

const visibleScrollbarSurfaces = scrollSurfaces.filter(
  (selector) => !styles.includes(`${selector}::-webkit-scrollbar`)
)

if (visibleScrollbarSurfaces.length || styles.includes('scrollbar-width: thin') || styles.includes('scrollbar-color:')) {
  errors.push(`滚动容器未完整复用隐藏滚动条契约: ${visibleScrollbarSurfaces.join(', ') || '存在可见滚动条样式'}`)
}

if (styles.includes('.composer__box:focus-within')) {
  errors.push('Composer 输入区聚焦时不得改变外框样式')
}

if (app.includes('archive-row') || app.includes('<Archive')) {
  errors.push('消息列表不得保留归档入口，应直接提供删除会话操作')
}

if (app.includes('aria-label="消息筛选"') || rendererApp.includes('aria-label="消息筛选"')) {
  errors.push('消息列表必须直接展示全部会话，不得保留全部、待处理或未读分类入口')
}

for (const [name, source] of [['原型', app], ['客户端', `${rendererApp}\n${rendererConnections}`]]) {
  for (const marker of ['connections', 'GitHub', '飞书', 'Microsoft Teams', 'Notion', '钉钉', '企业微信', '微信', '语雀', 'WPS Office', '百度网盘', 'Gitee', '阿里云', '协作沟通', '知识与文件', '研发与云服务', '应用总数', '应用类型']) {
    if (!source.includes(marker)) errors.push(`${name}连接目录缺少展示契约: ${marker}`)
  }
}
if (!app.includes('data-source="static"') || !app.includes('>未连接<')) errors.push('原型连接目录必须保留静态未连接参考状态')
for (const marker of ['data-source="bridge"', 'connectFeishu', 'disconnectFeishu', '打开飞书授权']) {
  if (!rendererConnections.includes(marker)) errors.push(`客户端飞书连接缺少真实 Bridge 契约: ${marker}`)
}
if (!rendererConnections.includes("label: '未连接'")) errors.push('客户端连接目录必须保留非飞书应用的未连接状态')

if (styles.includes('.conversation-row:focus-within .conversation-row__delete')) {
  errors.push('点击选中会话后不得因 focus-within 持续显示删除按钮')
}

for (const marker of ['.conversation-row:hover .conversation-row__delete', '.conversation-row__delete[data-focus-visible]']) {
  if (!styles.includes(marker)) errors.push(`缺少当前行 Hover 或键盘焦点删除操作: ${marker}`)
}

for (const label of ['删除会话', '打开所在文件夹']) {
  if (!app.includes(label)) errors.push(`缺少消息操作契约: ${label}`)
}

if (!app.includes('function ChatMessage') || !app.includes('message-block--${source}')) {
  errors.push('用户与总管消息必须复用左右对齐的 ChatMessage 气泡组件')
}

if (app.includes('name="你"') || rendererApp.includes("isUser ? '你'")) {
  errors.push('聊天时间线必须展示个人资料名称，不得把用户身份硬编码为“你”')
}

if (app.includes('className="settings-intro"') || rendererSystem.includes('className="settings-intro"') || styles.includes('.settings-intro')) {
  errors.push('系统设置正文必须直接展示设置模块，不得保留重复标题、图标或分割线')
}

if (!styles.includes('.system-page .detail-canvas > .settings-block:first-child') || !styles.includes('border-top: 0')) {
  errors.push('系统设置首个内容模块不得显示顶部边线')
}

for (const copy of ['平台权限与安全规则始终优先。', '文本 · Responses API', '图像 · Chat Completions API', '视频 · Chat Completions API']) {
  if (app.includes(copy) || rendererSystem.includes(copy)) errors.push(`系统设置仍包含无操作价值或面向实现者的文案: ${copy}`)
}

for (const marker of ['SettingsBlock title="身份"', 'className="employee-identity-editor"', 'aria-label="个人名称"']) {
  if (!app.includes(marker) || !rendererSystem.includes(marker)) errors.push(`个人资料未复用精简身份布局: ${marker}`)
}

for (const marker of ['aria-label="身份说明"', 'aria-label="个人简介"']) {
  if (app.includes(marker) || rendererSystem.includes(marker)) errors.push(`个人资料只保留头像和名称: ${marker}`)
}

for (const marker of ['.message-block--user {', 'flex-direction: row-reverse', '.message-block--user .message-bubble']) {
  if (!styles.includes(marker)) errors.push(`缺少用户头像右置与气泡右对齐契约: ${marker}`)
}

if (app.includes('className="participants"') || app.includes('aria-label="新建话题"')) {
  errors.push('会话标题栏不得固定展示事项团队，事项只能由总管根据对话意图创建')
}

if (app.includes('>任务 <')) {
  errors.push('消息页不得把顶层事项命名为任务')
}

for (const marker of ['className="topic-bar__count"', 'className="matter-route-note message-stream-item"', 'className="matter-event message-stream-item"', 'className="matter-index-card"', 'className="matter-team-avatars"']) {
  if (!app.includes(marker)) errors.push(`缺少会话事项结构: ${marker}`)
}

for (const marker of ['<MatterSidebar tasks={conversationTasks}', '<small>{tasks.length}</small>', 'employeeAvatarSrc({ employeeId: assignment.employeeId, avatarDataUrl: assignment.avatarDataUrl })']) {
  if (!rendererApp.includes(marker)) errors.push(`客户端事项数量或头像未复用当前会话事实: ${marker}`)
}

if (!app.includes('{hasMatters && <div className="topic-bar"')) {
  errors.push('普通问答会话不得展示没有切换价值的单独对话页签')
}

for (const marker of ['function MarkdownMessage', '<ReactMarkdown remarkPlugins={[remarkGfm]}>', 'aria-expanded={expanded}', 'className="attachment-carousel-navigation"', 'label="查看上一份附件"', 'label="查看下一份附件"']) {
  if (!app.includes(marker)) errors.push(`缺少消息折叠或附件导航复用组件: ${marker}`)
}

for (const marker of ['variant="timeline"', '<MarkdownMessage compact>', 'className="message-delivery__eyebrow">结果', 'className="message-delivery__verification"', 'className="matter-event__body"><strong>{task.goal}</strong><span>{summary.description}</span>']) {
  if (!rendererApp.includes(marker)) errors.push(`客户端信息流缺少目标、过程或结果分层契约: ${marker}`)
}

for (const marker of ['matter-route-note message-stream-item', 'matter-event message-stream-item', 'approval-card message-stream-item', 'message-block--timeline message-stream-item', 'runtime-route-note message-stream-item', 'change-card message-stream-item', 'boundary-note message-stream-item']) {
  if (!rendererApp.includes(marker) && !rendererMessageComponents.includes(marker)) errors.push(`客户端信息流组件未复用最大宽度与自适应契约: ${marker}`)
}

if (/\.(?:matter-event|approval-card|delivery-card)\s*\{[^}]*width:\s*calc\(100%\s*-\s*38px\)/s.test(styles)) {
  errors.push('事项、审批和交付组件不得继续使用固定左缩进计算宽度')
}

for (const marker of ['message-block--timeline', '--layout-message-process-collapse-lines', '.message-delivery__verification']) {
  if (!styles.includes(marker)) errors.push(`信息流视觉层级未复用共享样式契约: ${marker}`)
}

if (!/border:\s*1px solid var\(--line\)/.test(cssRule(rendererStyles, '.matter-event'))) {
  errors.push('时间线事项卡片属于内容区域，必须使用 --line 而不是外壳分隔线 Token')
}

if (app.includes('className="delivery-card delivery-card--complete message-stream-item"') || rendererApp.includes('className={`delivery-card delivery-card--')) {
  errors.push('时间线交付结果必须复用 ChatMessage 契约，不得继续维护独立描边卡片')
}

for (const marker of ['function AttachmentOpenMenu', '<MenuTrigger>', 'className="attachment-open-trigger"', '使用系统默认应用打开', '打开所在文件夹']) {
  if (!app.includes(marker) || !rendererMessageComponents.includes(marker)) errors.push(`原型与客户端缺少共享附件打开方式契约: ${marker}`)
}

if (rendererMessageComponents.includes('label={`打开 ${attachment.name}`} icon={OpenNewWindow}')) {
  errors.push('客户端附件不得恢复两个无文字图标，文件操作必须收敛到“打开方式”菜单')
}

for (const marker of ['function MarkdownContent', 'skillMarkdown?: string', '<h2>{capability.name}</h2>', '<p>{capability.summary}</p>', '<h3>SKILL.md</h3>', '<MarkdownContent className="skill-document__markdown">']) {
  if (!app.includes(marker)) errors.push(`缺少 Skill 名称、描述或完整 Markdown 文档详情: ${marker}`)
}

const skillCapabilityCount = [...app.matchAll(/id: '[^']+', kind: 'skill'/g)].length
const skillDocumentCount = [...app.matchAll(/skillMarkdown: createSkillMarkdown/g)].length
if (skillCapabilityCount !== skillDocumentCount) {
  errors.push(`Skill 数量 ${skillCapabilityCount} 与 SKILL.md 文档数量 ${skillDocumentCount} 不一致`)
}

for (const usage of ['max-height: calc(1em * var(--type-leading-reading) * var(--layout-message-collapse-lines));', 'max-height: calc(1em * var(--type-leading-reading) * var(--layout-message-process-collapse-lines));', 'min-width: var(--layout-message-attachment-card-width);', 'width: var(--layout-attachment-carousel-control-size);', 'width: var(--layout-attachment-open-menu-width);']) {
  if (!styles.includes(usage)) errors.push(`消息折叠或附件导航未使用尺寸契约: ${usage}`)
}

for (const label of ['需要你处理', '进行中', '已完成', '总管直接回答，不创建事项']) {
  if (!app.includes(label)) errors.push(`缺少事项意图或分组契约: ${label}`)
}

for (const marker of ['function DetailSummaryPanel', 'function DetailSectionHeader', 'function DetailListMark', 'function DetailState', 'function DetailNote']) {
  if (!rendererComponents.includes(marker)) errors.push(`事项详情缺少共享组件契约: ${marker}`)
}

for (const marker of ['<DetailSummaryPanel', '<DetailSectionHeader', '<SummaryList', '<DetailNote']) {
  if (!rendererApp.includes(marker)) errors.push(`事项详情未实际复用共享组件: ${marker}`)
}

for (const legacySelector of ['.matter-summary', '.matter-section-heading', '.matter-check-list', '.matter-team-list', '.matter-artifact-list', '.matter-evidence-note']) {
  if (rendererStyles.includes(legacySelector)) errors.push(`事项详情不得继续使用页面专用组件样式: ${legacySelector}`)
  if (rendererApp.includes(legacySelector.slice(1))) errors.push(`事项详情不得继续渲染页面专用组件类名: ${legacySelector.slice(1)}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log('尺寸与自适应契约检查通过')
