import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contract = await readFile(`${root}/src/layout.css`, 'utf8')
const styles = await readFile(`${root}/src/styles.css`, 'utf8')
const app = await readFile(`${root}/src/App.tsx`, 'utf8')
const windowContract = await readFile(`${repositoryRoot}/src/shared/layout-contract.ts`, 'utf8')

const requiredTokens = [
  '--layout-window-default-width',
  '--layout-window-default-height',
  '--layout-window-min-width',
  '--layout-window-min-height',
  '--layout-shell-max-width',
  '--layout-toolbar-height',
  '--layout-rail-width',
  '--layout-context-width',
  '--layout-workspace-min-width',
  '--layout-window-controls-safe-left',
  '--layout-window-controls-safe-top',
  '--layout-message-content-max-width',
  '--layout-detail-content-max-width',
  '--layout-summary-row-min-height',
  '--layout-message-attachment-card-width',
  '--layout-attachment-carousel-control-size',
  '--layout-message-collapse-lines',
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
  'width: min(100%, var(--layout-shell-max-width));',
  'grid-template-columns: calc(var(--layout-rail-width) + var(--layout-context-width)) minmax(0, 1fr);',
  'grid-template-columns: var(--layout-rail-width) var(--layout-context-width) minmax(var(--layout-workspace-min-width), 1fr);',
  'width: min(100%, var(--layout-workspace-content-max-width));',
  'width: min(100%, var(--layout-message-content-max-width));',
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

if (missingTokens.length) errors.push(`缺少尺寸 Token: ${missingTokens.join(', ')}`)
if (missingUsages.length) errors.push(`关键布局未使用尺寸契约:\n${missingUsages.join('\n')}`)

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

if (!app.includes('function Toolbar({ title, support, trailing }') || !app.includes('className="window-controls-safe-area"') || !app.includes('className="toolbar__workspace"')) {
  errors.push('顶部栏必须复用集成式 macOS 窗口栏，保留原生窗口控制安全区、当前标题和必要操作')
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

if (styles.includes('.conversation-row:focus-within .conversation-row__delete')) {
  errors.push('点击选中会话后不得因 focus-within 持续显示删除按钮')
}

for (const marker of ['.conversation-row:hover .conversation-row__delete', '.conversation-row__delete[data-focus-visible]']) {
  if (!styles.includes(marker)) errors.push(`缺少当前行 Hover 或键盘焦点删除操作: ${marker}`)
}

for (const label of ['删除会话', '在文件夹中显示']) {
  if (!app.includes(label)) errors.push(`缺少消息操作契约: ${label}`)
}

if (!app.includes('function ChatMessage') || !app.includes('message-block--${source}')) {
  errors.push('用户与总管消息必须复用左右对齐的 ChatMessage 气泡组件')
}

for (const marker of ['.message-block--user {', 'flex-direction: row-reverse', '.message-block--user .message-bubble']) {
  if (!styles.includes(marker)) errors.push(`缺少用户头像右置与气泡右对齐契约: ${marker}`)
}

if (app.includes('className="participants"') || app.includes('aria-label="新建话题"')) {
  errors.push('会话标题栏不得固定展示事项团队，事项只能由总管根据对话意图创建')
}

if (app.includes('className="topic-bar__count"') || app.includes('>任务 <')) {
  errors.push('消息页不得展示事项累计数量，也不得把顶层事项命名为任务')
}

for (const marker of ['className="topic-bar__attention"', 'className="matter-route-note"', 'className="matter-event"', 'className="matter-index-card"', 'className="matter-team-avatars"']) {
  if (!app.includes(marker)) errors.push(`缺少会话事项结构: ${marker}`)
}

if (!app.includes('{hasMatters && <div className="topic-bar"')) {
  errors.push('普通问答会话不得展示没有切换价值的单独对话页签')
}

for (const marker of ['function MarkdownMessage', '<ReactMarkdown remarkPlugins={[remarkGfm]}>', 'aria-expanded={expanded}', 'className="attachment-carousel-navigation"', 'label="查看上一份附件"', 'label="查看下一份附件"']) {
  if (!app.includes(marker)) errors.push(`缺少消息折叠或附件导航复用组件: ${marker}`)
}

for (const marker of ['function MarkdownContent', 'skillMarkdown?: string', '<h2>{capability.name}</h2>', '<p>{capability.summary}</p>', '<h3>SKILL.md</h3>', '<MarkdownContent className="skill-document__markdown">']) {
  if (!app.includes(marker)) errors.push(`缺少 Skill 名称、描述或完整 Markdown 文档详情: ${marker}`)
}

const skillCapabilityCount = [...app.matchAll(/id: '[^']+', kind: 'skill'/g)].length
const skillDocumentCount = [...app.matchAll(/skillMarkdown: createSkillMarkdown/g)].length
if (skillCapabilityCount !== skillDocumentCount) {
  errors.push(`Skill 数量 ${skillCapabilityCount} 与 SKILL.md 文档数量 ${skillDocumentCount} 不一致`)
}

for (const usage of ['max-height: calc(1em * var(--type-leading-reading) * var(--layout-message-collapse-lines));', 'min-width: var(--layout-message-attachment-card-width);', 'width: var(--layout-attachment-carousel-control-size);']) {
  if (!styles.includes(usage)) errors.push(`消息折叠或附件导航未使用尺寸契约: ${usage}`)
}

for (const label of ['需要你处理', '进行中', '已完成', '总管直接回答，不创建事项']) {
  if (!app.includes(label)) errors.push(`缺少事项意图或分组契约: ${label}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log('尺寸与自适应契约检查通过')
