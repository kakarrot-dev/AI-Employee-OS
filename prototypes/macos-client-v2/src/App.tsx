import React, { useEffect, useRef, useState } from 'react'
import type { ComponentType, FormEvent, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUp,
  Brain,
  ChatBubble,
  Check,
  Clock,
  Coins,
  Community,
  Database,
  EditPencil,
  Eye,
  Folder,
  Group,
  HalfMoon,
  HardDrive,
  InfoCircle,
  Key,
  Microphone,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  OpenNewWindow,
  Page,
  Plus,
  Refresh,
  Search,
  Settings,
  ShieldCheck,
  Sparks,
  SunLight,
  Tools,
  Trash,
  WarningTriangle,
  Xmark,
  IconoirProvider
} from 'iconoir-react'
import {
  Button,
  Dialog,
  Heading,
  Input,
  Label,
  Menu,
  MenuItem,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Popover,
  TextArea,
  TextField,
  Tooltip,
  TooltipTrigger
} from 'react-aria-components'
import networkIntelligenceAvatar from '../../../src/renderer/src/assets/employee-avatars/network-intelligence.png'
import documentWriterAvatar from '../../../src/renderer/src/assets/employee-avatars/document-writer.png'
import supervisorAvatar from '../../../src/renderer/src/assets/employee-avatars/supervisor.png'
import { EMPLOYEE_FIELD_LIMITS } from '../../../src/shared/employee-contract'

type PageId = 'messages' | 'contacts' | 'capabilities' | 'system'
type ThemeMode = 'system' | 'light' | 'dark'
type MessageView = 'conversation' | 'matter'
type ConversationMatterId = 'market-entry' | 'publication-pack'
type MatterGroup = 'attention' | 'active' | 'completed'
type TimelineState = 'done' | 'active' | 'pending'
type IconComponent = ComponentType<{ width?: number | string; height?: number | string; strokeWidth?: number; 'aria-hidden'?: boolean }>
type StatusTone = 'active' | 'waiting' | 'success' | 'danger' | 'muted'
type ModalState = 'create-agent' | 'agent-settings' | 'matter-detail' | 'delete-agent' | null
type DetailView = 'memory-governance' | 'capability-info' | 'approval-detail' | 'delivery-evidence' | 'about-advanced' | 'runtime-advanced' | null

interface Conversation {
  id: string
  title: string
  preview: string
  time: string
  unread?: number
  attention?: boolean
  avatar: string
  color: string
}

function employeeAvatarForName(name: string): string | undefined {
  if (name.includes('网络') || name.includes('情报')) return networkIntelligenceAvatar
  if (name.includes('文档') || name.includes('编辑')) return documentWriterAvatar
  return undefined
}

interface Agent {
  id: string
  name: string
  initials: string
  role: string
  status: string
  tone: StatusTone
  description: string
  color: string
  avatarUrl?: string | null
  prompt?: string
  model?: string
  joinedAt?: string
  capabilities: string[]
  deliveries: Array<{ title: string; meta: string; state: string }>
}

interface UserProfile {
  name: string
  role: string
  description: string
  avatarUrl: string | null
}

interface Capability {
  id: string
  kind: 'skill' | 'tool'
  category: string
  name: string
  summary: string
  status: string
  tone: StatusTone
  agents: string[]
  version: string
  useCases: string[]
  skills: string[]
  tools: string[]
  permissions: string[]
  skillMarkdown?: string
}

interface MessageAttachment {
  id: string
  name: string
  detail: string
}

interface LocalMessage {
  text: string
  attachments: MessageAttachment[]
}

interface MatterParticipant {
  name: string
  initials: string
  color: string
}

interface ConversationMatter {
  id: ConversationMatterId
  title: string
  description: string
  status: string
  tone: StatusTone
  updatedAt: string
  progress: string
  nextStep: string
  output: string
  group: MatterGroup
  team: MatterParticipant[]
  timeline: Array<{ state: TimelineState; title: string; meta: string }>
}

const conversations: Conversation[] = [
  { id: 'sea-saas', title: '东南亚市场研究', preview: '总管：等待你确认发布物料方向', time: '15:18', attention: true, avatar: '东', color: '#b8c982' },
  { id: 'plain-qa', title: 'Agent 产品讨论', preview: '总管：这类问题我可以直接回答', time: '12:26', avatar: '问', color: '#d7b36a' },
  { id: 'chapter', title: 'Agent 书籍第二章', preview: '总管：等待你确认新的验收标准', time: '11:08', unread: 2, avatar: '书', color: '#c5b8e3' },
  { id: 'weekly', title: '本周内容计划', preview: '已完成 4 项内容排期', time: '昨天', avatar: '周', color: '#dfb58e' },
  { id: 'website', title: '个人网站文章发布', preview: '交付物已写入工作目录', time: '周六', avatar: '站', color: '#8ebdc1' }
]

const exampleUserAttachments: MessageAttachment[] = [
  { id: 'brief', name: 'SEA-SaaS-研究需求.pdf', detail: 'PDF · 1.8 MB' },
  { id: 'markets', name: '目标市场清单.xlsx', detail: 'XLSX · 128 KB' },
  { id: 'notes', name: '补充说明.md', detail: 'Markdown · 24 KB' }
]

const generatedAttachments: MessageAttachment[] = [
  { id: 'report', name: 'SEA-SaaS-Market-Entry.md', detail: 'Markdown · 286 KB' },
  { id: 'evidence', name: 'Evidence-Index.csv', detail: 'CSV · 94 KB' },
  { id: 'sources', name: 'Verified-Sources.pdf', detail: 'PDF · 2.4 MB' }
]

const conversationMatters: ConversationMatter[] = [
  {
    id: 'market-entry',
    title: '东南亚 SaaS 市场进入研究',
    description: '覆盖六个主要市场，形成有来源支撑的竞争格局、进入风险和评审报告。',
    status: '已完成',
    tone: 'success',
    updatedAt: '14:32',
    progress: '5 / 5',
    nextStep: '已交付并通过验收',
    output: '3 个交付文件',
    group: 'completed',
    team: [
      { name: '网络情报员', initials: '网', color: '#b8c982' },
      { name: '文档编写员', initials: '文', color: '#d7b36a' }
    ],
    timeline: [
      { state: 'done', title: '目标与验收标准已确认', meta: '13:42' },
      { state: 'done', title: '网络情报员完成公开来源收集', meta: '14:02' },
      { state: 'done', title: '文档编写员完成交叉核验与成稿', meta: '14:18' },
      { state: 'done', title: '总管完成最终验收', meta: '14:32' }
    ]
  },
  {
    id: 'publication-pack',
    title: '市场报告发布包',
    description: '基于已验收报告，整理官网发布稿和管理层摘要。',
    status: '需要你处理',
    tone: 'waiting',
    updatedAt: '15:18',
    progress: '2 / 4',
    nextStep: '确认发布范围后继续整理',
    output: '等待确认发布范围',
    group: 'attention',
    team: [
      { name: '文档编写员', initials: '文', color: '#d7b36a' },
      { name: '网络情报员', initials: '网', color: '#b8c982' }
    ],
    timeline: [
      { state: 'done', title: '发布目标与渠道约束已确认', meta: '15:08' },
      { state: 'done', title: '文档编写员完成发布稿结构', meta: '15:14' },
      { state: 'active', title: '等待你确认发布范围', meta: '现在' },
      { state: 'pending', title: '总管统一验收发布包', meta: '下一步' }
    ]
  }
]

const initialAgents: Agent[] = [
  {
    id: 'employee.network-intelligence', name: '网络情报员', initials: '网', role: '公开信息检索与核验', status: '待命', tone: 'success', color: '#b8c982', avatarUrl: networkIntelligenceAvatar,
    description: '从经过授权的公开来源收集资料，形成可追溯的 ResearchBundle。',
    capabilities: ['多源网络调研', '来源核验'],
    deliveries: [
      { title: '东南亚 SaaS 市场资料包', meta: '今天 14:18', state: '验收通过' },
      { title: 'Agent 框架近 30 天动态', meta: '8 月 29 日', state: '验收通过' },
      { title: '高校数字员工案例清单', meta: '8 月 26 日', state: '存在 1 项缺口' }
    ]
  },
  {
    id: 'employee.document-writer', name: '文档编写员', initials: '文', role: '结构化文档撰写', status: '工作中', tone: 'active', color: '#d7b36a', avatarUrl: documentWriterAvatar,
    description: '只读取经过确认的任务资料，保留来源、冲突和信息缺口，输出可验收文档。',
    capabilities: ['调研分析报告', '内容编辑', '格式检查'],
    deliveries: [
      { title: '东南亚市场进入建议', meta: '今天 14:32', state: '验收通过' },
      { title: '多智能体产品竞品分析', meta: '8 月 30 日', state: '验收通过' },
      { title: '内容渠道数据复盘', meta: '8 月 25 日', state: '验收通过' }
    ]
  }
]

function createSkillMarkdown({ name, description, version, useCases, steps, tools, permissions, output, acceptance }: { name: string; description: string; version: string; useCases: string[]; steps: string[]; tools: string[]; permissions: string[]; output: string; acceptance: string[] }): string {
  return `# ${name}

> ${description}

## 元数据

| 字段 | 内容 |
| --- | --- |
| 名称 | ${name} |
| 版本 | ${version} |
| 状态 | 可用于正式事项 |

## 适用范围

${useCases.map((item) => `- ${item}`).join('\n')}

## 执行流程

${steps.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## Tools

${tools.map((item) => `- \`${item}\``).join('\n')}

## 权限边界

${permissions.map((item) => `- ${item}`).join('\n')}

> 只使用当前事项明确授予的最小权限。不得把一次授权延续到其他事项。

## 交付物

${output}

## 验收标准

${acceptance.map((item) => `- [ ] ${item}`).join('\n')}

## 禁止事项

- 不得伪造来源、执行结果或已通过验收的状态。
- 不得绕过总管直接向用户承诺最终结果。
- 不得把未验证信息写成确定结论。
`
}

const capabilities: Capability[] = [
  {
    id: 'research', kind: 'skill', category: 'Research Skill', name: '多源网络调研', summary: '从许可来源收集、核验并结构化外部资料。', status: '可用', tone: 'success', agents: ['网络情报员'], version: '2.1',
    useCases: ['竞品调研', '市场研究', '公开资料核验'], skills: ['来源规划', '交叉核验', '信息缺口识别'], tools: ['GitHub Repository Search', 'RSS Reader'], permissions: ['公开网络读取', 'ResearchBundle 写入'],
    skillMarkdown: createSkillMarkdown({ name: '多源网络调研', description: '从许可来源收集、核验并结构化外部资料。', version: '2.1', useCases: ['需要外部公开资料支撑的市场、竞品与趋势研究', '需要保留来源定位与检索时间的事实核验', '需要显式标注信息冲突和缺口的研究事项'], steps: ['确认研究目标、范围、时效与验收标准', '建立来源计划并检查当前事项的访问授权', '使用获准 Tool 收集资料，记录来源 URL 与时间', '对关键事实进行交叉核验，标记冲突与缺口', '生成 ResearchBundle 并交由总管验收'], tools: ['GitHub Repository Search', 'RSS Reader'], permissions: ['只读访问公开网络来源', '向当前事项的 ResearchBundle 写入结构化资料'], output: '`ResearchBundle`：包含来源、事实、冲突、信息缺口和检索时间。', acceptance: ['每项关键事实至少有一个可定位来源', '结论与来源可以双向追溯', '冲突信息和未知项没有被隐藏'] })
  },
  {
    id: 'analysis', kind: 'skill', category: 'Analysis Skill', name: '调研分析报告', summary: '依据已验证来源形成分析结论与可交付文档。', status: '可用', tone: 'success', agents: ['文档编写员'], version: '1.4',
    useCases: ['研究报告', '决策建议', '证据综合'], skills: ['Claim 综合', '冲突处理', '报告结构化'], tools: ['Document Export'], permissions: ['任务资料读取', '交付目录写入'],
    skillMarkdown: createSkillMarkdown({ name: '调研分析报告', description: '依据已验证来源形成分析结论与可交付文档。', version: '1.4', useCases: ['把 ResearchBundle 转化为可评审的分析报告', '识别事实、推断、建议之间的证据边界', '输出带有风险和信息缺口的决策材料'], steps: ['读取冻结的研究资料与验收标准', '拆分事实、推断、假设和建议', '处理来源冲突并评估证据强度', '形成报告结构与关键结论', '导出版本化文档并提交总管验收'], tools: ['Document Export'], permissions: ['读取当前事项资料', '写入当前事项交付目录'], output: '版本化分析报告、证据索引和待确认问题清单。', acceptance: ['结论均能定位到证据或明确标注为推断', '报告覆盖用户确认的验收标准', '剩余风险和信息缺口完整披露'] })
  },
  {
    id: 'editing', kind: 'skill', category: 'Content Skill', name: '内容编辑', summary: '将确认内容编辑为符合渠道规范的发布稿。', status: '可用', tone: 'success', agents: ['文档编写员'], version: '1.2',
    useCases: ['长文编辑', '渠道改写', '格式检查'], skills: ['内容结构优化', '发布前检查'], tools: ['Markdown Export'], permissions: ['任务资料读取', '交付目录写入'],
    skillMarkdown: createSkillMarkdown({ name: '内容编辑', description: '将确认内容编辑为符合渠道规范的发布稿。', version: '1.2', useCases: ['长文结构与表达优化', '基于同一事实源生成渠道版本', '发布前格式、链接和措辞检查'], steps: ['读取已确认事实、受众与渠道约束', '保持事实边界并重组内容结构', '按渠道生成对应版本', '执行格式、链接与禁用表达检查', '导出发布稿并交由总管确认'], tools: ['Markdown Export'], permissions: ['读取当前事项已确认内容', '写入当前事项交付目录'], output: 'Markdown 发布稿、渠道版本和发布前检查结果。', acceptance: ['没有新增未经确认的事实', '结构和语气符合目标渠道', '链接、格式和禁用表达检查通过'] })
  },
  {
    id: 'visual', kind: 'skill', category: 'Creative Skill', name: '视觉方案', summary: '从内容目标生成视觉方向、提示词和版本化资产。', status: '可用', tone: 'success', agents: [], version: '1.0',
    useCases: ['文章封面', '产品配图', '视觉提案'], skills: ['视觉方向', '提示词编排'], tools: ['Image Generation'], permissions: ['图像模型调用', '交付目录写入'],
    skillMarkdown: createSkillMarkdown({ name: '视觉方案', description: '从内容目标生成视觉方向、提示词和版本化资产。', version: '1.0', useCases: ['文章封面与社交媒体配图', '产品概念和视觉方向提案', '基于既有资产进行受控图像编辑'], steps: ['确认内容目标、品牌约束与使用场景', '提出可比较的视觉方向', '获得方向确认后编排生成提示词', '调用图像 Tool 并记录模型与版本', '整理预览和源文件交由总管验收'], tools: ['Image Generation'], permissions: ['调用已配置的图像模型', '写入当前事项交付目录'], output: '视觉方向说明、生成提示词、预览图和版本化资产。', acceptance: ['视觉结果符合已确认方向', '提示词、模型和版本记录完整', '交付尺寸和格式满足使用场景'] })
  },
  {
    id: 'github-search', kind: 'tool', category: 'MCP Tool', name: 'GitHub Repository Search', summary: '通过 MCP 搜索公开仓库、代码与发布信息。', status: '可用', tone: 'success', agents: ['网络情报员'], version: '1.3',
    useCases: ['仓库检索', '代码证据定位', 'Release 核验'], skills: ['多源网络调研', '来源核验'], tools: ['MCP Server: github', 'Transport: stdio'], permissions: ['公开仓库读取', '搜索结果写入任务上下文']
  },
  {
    id: 'rss-reader', kind: 'tool', category: 'MCP Tool', name: 'RSS Reader', summary: '通过 MCP 获取、解析并去重订阅源内容。', status: '可用', tone: 'success', agents: ['网络情报员'], version: '1.1',
    useCases: ['行业动态监控', '来源订阅', '增量内容读取'], skills: ['多源网络调研'], tools: ['MCP Server: rss', 'Transport: stdio'], permissions: ['公开订阅源读取']
  },
  {
    id: 'document-export', kind: 'tool', category: '内置 Tool', name: 'Document Export', summary: '把验收通过的内容写入版本化交付目录。', status: '可用', tone: 'success', agents: ['文档编写员'], version: '2.0',
    useCases: ['Markdown 导出', '交付物固化', '版本记录'], skills: ['调研分析报告', '内容编辑'], tools: ['Runtime: local', 'Mode: built-in'], permissions: ['交付目录写入']
  },
  {
    id: 'image-generation', kind: 'tool', category: '模型 Tool', name: 'Image Generation', summary: '调用已配置的图像模型生成和编辑视觉资产。', status: '可用', tone: 'success', agents: [], version: '1.0',
    useCases: ['图像生成', '局部编辑', '版本化视觉资产'], skills: ['视觉方案'], tools: ['Provider: Poe', 'Model: gpt-image-2'], permissions: ['图像模型调用', '交付目录写入']
  }
]

const navItems: Array<{ id: PageId; label: string; icon: IconComponent }> = [
  { id: 'messages', label: '消息', icon: ChatBubble },
  { id: 'contacts', label: '通讯录', icon: Group },
  { id: 'capabilities', label: '能力', icon: Sparks }
]

const systemSections = [
  { id: 'profile', label: '个人资料', icon: Group },
  { id: 'general', label: '通用', icon: Settings },
  { id: 'supervisor', label: '总管', icon: Community },
  { id: 'models', label: '模型服务', icon: Brain },
  { id: 'resources', label: '资源与权限', icon: ShieldCheck },
  { id: 'memory', label: '记忆与存储', icon: Database },
  { id: 'usage', label: '用量与预算', icon: Coins },
  { id: 'about', label: '关于与诊断', icon: InfoCircle }
] as const

function IconButton({ label, icon: Icon, onPress, isDisabled, className = '' }: { label: string; icon: IconComponent; onPress?: () => void; isDisabled?: boolean; className?: string }): React.JSX.Element {
  return (
    <TooltipTrigger delay={450}>
      <Button aria-label={label} className={`icon-button ${className}`} onPress={onPress} isDisabled={isDisabled}><Icon aria-hidden width={19} height={19} /></Button>
      <Tooltip className="app-tooltip" placement="bottom">{label}</Tooltip>
    </TooltipTrigger>
  )
}

function StatusLight({ tone, label, breathing = false }: { tone: StatusTone; label: string; breathing?: boolean }): React.JSX.Element {
  return <span className="status-light"><span className={`status-light__dot status-light__dot--${tone}${breathing ? ' is-breathing' : ''}`} aria-hidden="true" /><span>{label}</span></span>
}

function Avatar({ label, initials, color, size = 'medium', src }: { label: string; initials: string; color: string; size?: 'small' | 'medium' | 'large'; src?: string | null }): React.JSX.Element {
  return <span className={`avatar avatar--${size}`} style={{ '--avatar-color': color } as React.CSSProperties} aria-label={label}>{src ? <img src={src} alt="" /> : initials}</span>
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }): React.JSX.Element {
  return <div className="section-header"><h2>{title}</h2>{action}</div>
}

function SearchBox({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  return (
    <TextField aria-label={placeholder} value={value} onChange={onChange} className="search-box">
      <Search aria-hidden width={17} height={17} />
      <Input placeholder={placeholder} />
    </TextField>
  )
}

const prototypeModelOptions = [
  { id: 'deepseek-v4-pro', provider: 'DeepSeek', description: '适合中文理解、推理与结构化输出。', status: 'Credential 已配置', tone: 'success' as const },
  { id: 'claude-sonnet-4.6', provider: 'Poe', description: '适合长文本理解、复杂指令执行与内容生成。', status: 'Credential 待配置', tone: 'waiting' as const }
]

function selectionIncludes(values: string[], query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return !normalized || values.some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized))
}

function SelectionCatalog({ label, placeholder, query, result, empty, onQuery, children }: { label: string; placeholder: string; query: string; result: string; empty: string; onQuery: (value: string) => void; children: ReactNode }): React.JSX.Element {
  const items = React.Children.toArray(children)
  return <div className="selection-catalog"><div className="selection-catalog__toolbar"><SearchBox placeholder={placeholder} value={query} onChange={onQuery} /><span aria-label={label}>{result}</span></div><div className="selection-catalog__grid">{items.length ? items : <p className="selection-catalog__empty">{empty}</p>}</div></div>
}

function SelectionOption({ title, description, meta, status, tone, selected, leading, onSelect }: { title: string; description: string; meta: string; status: string; tone: StatusTone; selected: boolean; leading: ReactNode; onSelect: () => void }): React.JSX.Element {
  return <Button className={`selection-option${selected ? ' is-selected' : ''}`} aria-pressed={selected} onPress={onSelect}><span className="selection-option__leading">{leading}</span><span className="selection-option__body"><span className="selection-option__title"><strong>{title}</strong><em>{meta}</em></span><small>{description}</small><span className="selection-option__status"><StatusLight tone={tone} label={status} /></span></span><span className="selection-option__indicator" aria-hidden="true">{selected && <Check width={17} height={17} />}</span></Button>
}

function ModelCapabilityPicker({ model, assignedCapabilities, onModel, onCapabilities }: { model: string; assignedCapabilities: string[]; onModel: (value: string) => void; onCapabilities: (value: string[]) => void }): React.JSX.Element {
  const [modelQuery, setModelQuery] = useState('')
  const [capabilityQuery, setCapabilityQuery] = useState('')
  const models = prototypeModelOptions.filter((item) => selectionIncludes([item.id, item.provider, item.description], modelQuery))
  const skillCapabilities = capabilities
    .filter((item) => item.kind === 'skill' && selectionIncludes([item.name, item.summary, item.category, ...item.permissions], capabilityQuery))
    .sort((left, right) => Number(assignedCapabilities.includes(right.name)) - Number(assignedCapabilities.includes(left.name)) || left.name.localeCompare(right.name, 'zh-CN'))

  return <div className="model-capability-selection">
    <section className="selection-config-section"><div className="selection-config-section__heading"><div><h3>运行模型</h3><p>从候选模型中选择一个作为当前员工的主模型。</p></div><span>单选 · 当前 {model}</span></div><SelectionCatalog label="模型搜索结果" placeholder="搜索模型或 Provider" query={modelQuery} result={`${models.length} 个模型`} empty="没有匹配的模型。" onQuery={setModelQuery}>{models.map((item) => <SelectionOption key={item.id} title={item.id} description={item.description} meta={`${item.provider} · 文本模型`} status={item.status} tone={item.tone} selected={model === item.id} leading={<Brain aria-hidden width={19} height={19} />} onSelect={() => onModel(item.id)} />)}</SelectionCatalog></section>
    <section className="selection-config-section"><div className="selection-config-section__heading"><div><h3>Agent 能力</h3><p>可多选。已选能力优先显示，相关 Tool 与权限会随能力配置派生。</p></div><span>多选 · 已选 {assignedCapabilities.length} 项</span></div><SelectionCatalog label="能力搜索结果" placeholder="搜索能力、说明或权限" query={capabilityQuery} result={`${skillCapabilities.length} / ${capabilities.filter((item) => item.kind === 'skill').length} 项`} empty="没有匹配的能力。" onQuery={setCapabilityQuery}>{skillCapabilities.map((item) => { const selected = assignedCapabilities.includes(item.name); return <SelectionOption key={item.id} title={item.name} description={item.summary} meta={`v${item.version} · ${item.category}`} status={item.status} tone={item.tone} selected={selected} leading={<Sparks aria-hidden width={19} height={19} />} onSelect={() => onCapabilities(selected ? assignedCapabilities.filter((name) => name !== item.name) : [...assignedCapabilities, item.name])} /> })}</SelectionCatalog></section>
  </div>
}

function ListRow({ selected, avatar, title, subtitle, meta, marker, onPress }: { selected?: boolean; avatar?: ReactNode; title: string; subtitle: string; meta?: string; marker?: ReactNode; onPress: () => void }): React.JSX.Element {
  return (
    <Button className={`list-row${selected ? ' is-selected' : ''}`} onPress={onPress}>
      {avatar}
      <span className="list-row__body"><span className="list-row__title">{title}</span><span className="list-row__subtitle">{subtitle}</span></span>
      <span className="list-row__meta">{meta}{marker}</span>
    </Button>
  )
}

function ProfileSummary({ agent }: { agent: Agent }): React.JSX.Element {
  return <section className="profile-summary"><div className="profile-summary__identity"><Avatar label={agent.name} initials={agent.initials} color={agent.color} size="large" src={agent.avatarUrl} /><div className="profile-summary__copy"><span>{agent.name}</span><h2>{agent.role}</h2><p>{agent.description}</p></div></div></section>
}

function ProfileFacts({ items }: { items: Array<{ label: string; value: ReactNode }> }): React.JSX.Element {
  return <section className="profile-facts"><h3>基本资料</h3><dl>{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></section>
}

function ProfileValueTags({ items }: { items: Array<{ label: string; value: ReactNode; accessibleValue: string }> }): React.JSX.Element {
  return <ul className="profile-value-tags" aria-label="基本资料">{items.map((item) => <li key={item.label} aria-label={`${item.label}：${item.accessibleValue}`}>{item.value}</li>)}</ul>
}

function SummaryCardGrid({ children, emptyMessage }: { children: ReactNode; emptyMessage: string }): React.JSX.Element {
  const items = React.Children.toArray(children)
  return <div className="summary-card-grid">{items.length ? items : <p className="summary-card-grid__empty">{emptyMessage}</p>}</div>
}

function SummaryCard({ title, description, leading }: { title: ReactNode; description?: ReactNode; leading?: ReactNode }): React.JSX.Element {
  return <article className="summary-card">{leading && <span className="summary-card__leading">{leading}</span>}<span className="summary-card__body"><strong>{title}</strong>{description && <small>{description}</small>}</span></article>
}

function ConversationRow({ conversation, selected, onPress, onDelete }: { conversation: Conversation; selected: boolean; onPress: () => void; onDelete: () => void }): React.JSX.Element {
  return (
    <div className="conversation-row">
      <ListRow selected={selected} title={conversation.title} subtitle={conversation.preview} meta={conversation.time} marker={conversation.unread ? <span className="unread-count">{conversation.unread}</span> : conversation.attention ? <span className="attention-dot" aria-label="待处理" /> : undefined} onPress={onPress} />
      <IconButton className="conversation-row__delete" label={`删除会话 ${conversation.title}`} icon={Trash} onPress={onDelete} />
    </div>
  )
}

function AttachmentOpenMenu({ attachment }: { attachment: MessageAttachment }): React.JSX.Element {
  return <MenuTrigger>
    <Button className="attachment-open-trigger" aria-label={`打开方式 ${attachment.name}`}>
      <OpenNewWindow aria-hidden width={16} height={16} />
      <span>打开方式</span>
      <NavArrowDown aria-hidden width={14} height={14} className="attachment-open-trigger__chevron" />
    </Button>
    <Popover className="attachment-open-popover" placement="bottom end" offset={6}>
      <Menu className="attachment-open-menu" aria-label={`${attachment.name} 的打开方式`}>
        <MenuItem id="open" className="attachment-open-menu__item">
          <span className="attachment-open-menu__icon"><OpenNewWindow aria-hidden width={17} height={17} /></span>
          <span className="attachment-open-menu__copy"><strong>使用系统默认应用打开</strong><small>使用 macOS 关联的应用</small></span>
        </MenuItem>
        <MenuItem id="reveal" className="attachment-open-menu__item">
          <span className="attachment-open-menu__icon"><Folder aria-hidden width={17} height={17} /></span>
          <span className="attachment-open-menu__copy"><strong>打开所在文件夹</strong><small>在 Finder 中定位此文件</small></span>
        </MenuItem>
      </Menu>
    </Popover>
  </MenuTrigger>
}

function MessageAttachmentGroup({ attachments, source, embedded = false, onRemove }: { attachments: MessageAttachment[]; source: 'user' | 'agent'; embedded?: boolean; onRemove?: (id: string) => void }): React.JSX.Element | null {
  const rowsRef = useRef<HTMLDivElement>(null)
  const [carouselState, setCarouselState] = useState({ current: 1, canPrevious: false, canNext: false })
  const isTimelineCarousel = source === 'user' && attachments.length > 1 && !onRemove
  const updateCarouselState = (): void => {
    const rows = rowsRef.current
    if (!rows || !isTimelineCarousel) return
    const firstCard = rows.firstElementChild as HTMLElement | null
    const step = firstCard ? firstCard.offsetWidth + 7 : rows.clientWidth
    const maxScroll = Math.max(0, rows.scrollWidth - rows.clientWidth)
    const isAtEnd = maxScroll > 0 && rows.scrollLeft >= maxScroll - 2
    setCarouselState({ current: isAtEnd ? attachments.length : Math.min(attachments.length, Math.round(rows.scrollLeft / Math.max(step, 1)) + 1), canPrevious: rows.scrollLeft > 2, canNext: rows.scrollLeft < maxScroll - 2 })
  }
  const moveCarousel = (direction: -1 | 1): void => {
    const rows = rowsRef.current
    const firstCard = rows?.firstElementChild as HTMLElement | null
    if (!rows) return
    rows.scrollBy({ left: direction * ((firstCard?.offsetWidth ?? rows.clientWidth) + 7), behavior: 'smooth' })
  }

  useEffect(() => {
    const rows = rowsRef.current
    if (!rows || !isTimelineCarousel) return
    const observer = new ResizeObserver(updateCarouselState)
    observer.observe(rows)
    const frame = requestAnimationFrame(updateCarouselState)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [attachments.length, isTimelineCarousel])

  if (!attachments.length) return null
  const multiple = attachments.length > 1

  return (
    <div className={`message-attachments message-attachments--${source} message-attachments--${multiple ? 'multiple' : 'single'}${embedded ? ' message-attachments--embedded' : ''}${isTimelineCarousel ? ' message-attachments--carousel' : ''}`}>
      {multiple && <div className="message-attachments__header"><span>{source === 'agent' ? <Sparks aria-hidden width={16} height={16} /> : <Page aria-hidden width={16} height={16} />}{attachments.length} 个附件</span>{isTimelineCarousel && (carouselState.canPrevious || carouselState.canNext) && <span className="attachment-carousel-navigation"><small>{carouselState.current} / {attachments.length}</small><IconButton label="查看上一份附件" icon={NavArrowLeft} onPress={() => moveCarousel(-1)} isDisabled={!carouselState.canPrevious} /><IconButton label="查看下一份附件" icon={NavArrowRight} onPress={() => moveCarousel(1)} isDisabled={!carouselState.canNext} /></span>}</div>}
      <div className="message-attachments__rows" ref={rowsRef} onScroll={isTimelineCarousel ? updateCarouselState : undefined}>
        {attachments.map((attachment) => <div className="message-attachment-row" key={attachment.id}><span className="message-attachment-row__icon"><Page aria-hidden width={18} height={18} /></span><span className="message-attachment-row__body"><strong title={attachment.name}>{attachment.name}</strong><small>{attachment.detail}</small></span>{onRemove ? <IconButton label={`移除 ${attachment.name}`} icon={Xmark} onPress={() => onRemove(attachment.id)} /> : source === 'agent' ? <span className="message-attachment-row__actions"><AttachmentOpenMenu attachment={attachment} /></span> : <IconButton label={`打开 ${attachment.name}`} icon={NavArrowRight} />}</div>)}
      </div>
    </div>
  )
}

function MarkdownContent({ children, className = '' }: { children: string; className?: string }): React.JSX.Element {
  return <div className={`markdown-rendered${className ? ` ${className}` : ''}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown></div>
}

function MarkdownMessage({ children }: { children: string }): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [collapsible, setCollapsible] = useState(false)

  useEffect(() => {
    const content = contentRef.current
    if (!content || expanded) return
    const measure = (): void => setCollapsible(content.scrollHeight > content.clientHeight + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    const frame = requestAnimationFrame(measure)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [children, expanded])

  return <div className="markdown-message"><div ref={contentRef} className={`markdown-message__content${collapsible ? ' is-collapsible' : ''}${expanded ? ' is-expanded' : ''}`}><MarkdownContent>{children}</MarkdownContent></div>{(collapsible || expanded) && <Button className="message-expand-button" aria-expanded={expanded} onPress={() => setExpanded((value) => !value)}>{expanded ? '收起' : '展开全文'}<NavArrowDown aria-hidden width={14} height={14} className={expanded ? 'is-expanded' : ''} /></Button>}</div>
}

function MatterTeamAvatars({ team }: { team: MatterParticipant[] }): React.JSX.Element {
  return <span className="matter-team-avatars" aria-label={`当前临时团队：${team.map((item) => item.name).join('、')}`}>{team.map((item) => <Avatar key={item.name} label={item.name} initials={item.initials} color={item.color} size="small" src={employeeAvatarForName(item.name)} />)}<small>{team.map((item) => item.name).join('、')}</small></span>
}

function MatterRouteNote({ title, mode }: { title: string; mode: 'created' | 'linked' }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [route, setRoute] = useState(mode === 'created' ? '已创建事项' : '已归入已有事项')
  const choose = (nextRoute: string): void => { setRoute(nextRoute); setEditing(false) }
  return (
    <div className="matter-route-note message-stream-item">
      <span title={title}><Sparks aria-hidden width={14} height={14} />{route}</span>
      <Button className="matter-route-note__change" onPress={() => setEditing((value) => !value)}>更改</Button>
      {editing && <div className="matter-route-note__options" role="group" aria-label="更改消息归类"><Button onPress={() => choose('已归入已有事项')}>归入当前事项</Button><Button onPress={() => choose('已创建事项')}>创建新事项</Button><Button onPress={() => choose('总管直接回答，不创建事项')}>直接回答</Button></div>}
    </div>
  )
}

function MatterEvent({ matter, title, description, time, onOpen }: { matter: ConversationMatter; title: string; description: string; time: string; onOpen: () => void }): React.JSX.Element {
  return <Button className="matter-event message-stream-item" aria-label={`查看事项：${matter.title}`} onPress={onOpen}><span className="matter-event__body"><small>目标</small><strong>{matter.title}</strong><span>{description}</span></span><span className="matter-event__meta"><span>{title}</span><time>{time}</time><NavArrowRight aria-hidden width={15} height={15} /></span></Button>
}

function ChatMessage({ source, name, initials, color, time, avatarSrc, children }: { source: 'user' | 'agent'; name: string; initials: string; color: string; time: string; avatarSrc?: string | null; children: ReactNode }): React.JSX.Element {
  return <article className={`message-block message-block--${source}`}><Avatar label={name} initials={initials} color={color} size="small" src={avatarSrc} /><div className="message-block__stack"><div className="message-author"><strong>{name}</strong><time>{time}</time></div><div className="message-bubble">{children}</div></div></article>
}

function AttachmentUploadButton({ onFiles }: { onFiles: (files: File[]) => void }): React.JSX.Element {
  return <label className="attachment-upload-button" title="添加附件"><input type="file" multiple aria-label="添加附件" onChange={(event) => { onFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} /><span className="icon-button" aria-hidden="true"><Plus width={19} height={19} /></span></label>
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileDetail(file: File): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : undefined
  return `${extension || '文件'} · ${fileSizeLabel(file.size)}`
}

function Toolbar({ title, support, trailing }: { title: string; support?: ReactNode; trailing?: ReactNode }): React.JSX.Element {
  return (
    <header className="toolbar" aria-label="窗口拖拽区">
      <div className="window-controls-safe-area" aria-hidden="true" />
      <div className="toolbar__workspace"><div className="toolbar__content"><div className="toolbar__identity"><h1>{title}</h1>{support}</div>{trailing && <div className="toolbar__trailing">{trailing}</div>}</div></div>
    </header>
  )
}

function Rail({ active, userProfile, onNavigate, onProfile }: { active: PageId; userProfile: UserProfile; onNavigate: (id: PageId) => void; onProfile: () => void }): React.JSX.Element {
  return (
    <nav className="rail" aria-label="一级导航">
      <div className="rail__main">
        {navItems.map((item) => <RailButton key={item.id} active={active === item.id} {...item} onPress={() => onNavigate(item.id)} marker={item.id === 'messages' ? '3' : undefined} />)}
      </div>
      <div className="rail__footer">
        <TooltipTrigger delay={350}>
          <Button className="rail-profile-button" aria-label={`${userProfile.name} 个人信息`} onPress={onProfile}><Avatar label={userProfile.name} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="small" src={userProfile.avatarUrl} /></Button>
          <Tooltip className="app-tooltip" placement="right">个人信息</Tooltip>
        </TooltipTrigger>
        <RailButton id="system" label="系统" icon={Settings} active={active === 'system'} onPress={() => onNavigate('system')} />
      </div>
    </nav>
  )
}

function RailButton({ label, icon: Icon, active, onPress, marker }: { id: PageId; label: string; icon: IconComponent; active: boolean; onPress: () => void; marker?: string }): React.JSX.Element {
  return (
    <TooltipTrigger delay={350}>
      <Button aria-label={label} className={`rail-button${active ? ' is-active' : ''}`} onPress={onPress}><Icon aria-hidden width={22} height={22} />{marker && <span className="rail-button__marker">{marker}</span>}</Button>
      <Tooltip className="app-tooltip" placement="right">{label}</Tooltip>
    </TooltipTrigger>
  )
}

function ContextPane({ page, agentItems, selectedConversation, onConversation, selectedAgent, onAgent, onCreateAgent, selectedCapability, onCapability, onOpenDetail, systemSection, onSystemSection }: {
  page: PageId
  agentItems: Agent[]
  selectedConversation: string
  onConversation: (id: string) => void
  selectedAgent: string
  onAgent: (id: string) => void
  onCreateAgent: () => void
  selectedCapability: string
  onCapability: (id: string) => void
  onOpenDetail: (view: DetailView) => void
  systemSection: string
  onSystemSection: (id: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [capabilityFilter, setCapabilityFilter] = useState<'skill' | 'tool'>('skill')
  const [deletedConversationIds, setDeletedConversationIds] = useState<string[]>([])
  const pageTitle = { messages: '消息', contacts: '通讯录', capabilities: '能力', system: '系统' }[page]
  const filteredConversations = conversations.filter((item) => !deletedConversationIds.includes(item.id) && (item.title.includes(query) || item.preview.includes(query)))
  const filteredAgents = agentItems.filter((item) => item.name.includes(query) || item.role.includes(query))
  const filteredCapabilities = capabilities.filter((item) => item.name.includes(query) || item.summary.includes(query))
  const visibleCapabilities = filteredCapabilities.filter((item) => item.kind === capabilityFilter)

  useEffect(() => {
    setQuery('')
  }, [page])

  const deleteConversation = (id: string): void => {
    const nextConversation = conversations.find((item) => item.id !== id && !deletedConversationIds.includes(item.id))
    setDeletedConversationIds((items) => [...items, id])
    if (selectedConversation === id && nextConversation) onConversation(nextConversation.id)
  }

  return (
    <aside className="context-pane">
      <SectionHeader title={pageTitle} action={page !== 'system' ? <IconButton label={page === 'messages' ? '新建会话' : page === 'contacts' ? '新建 Agent' : '能力目录信息'} icon={page === 'capabilities' ? InfoCircle : Plus} onPress={page === 'contacts' ? onCreateAgent : page === 'capabilities' ? () => onOpenDetail('capability-info') : undefined} /> : undefined} />
      {page !== 'system' && <SearchBox placeholder={page === 'messages' ? '搜索会话' : page === 'contacts' ? '搜索 Agent' : '搜索能力'} value={query} onChange={setQuery} />}
      {page === 'messages' && <>
        <div className="filter-row" aria-label="消息筛选">{[['all', '全部'], ['attention', '待处理'], ['unread', '未读']].map(([id, label]) => <Button key={id} className={filter === id ? 'is-active' : ''} onPress={() => setFilter(id)}>{label}</Button>)}</div>
        <div className="context-scroll">{filteredConversations.filter((item) => filter === 'all' || (filter === 'attention' ? item.attention : item.unread)).map((item) => <ConversationRow key={item.id} conversation={item} selected={selectedConversation === item.id} onPress={() => onConversation(item.id)} onDelete={() => deleteConversation(item.id)} />)}</div>
      </>}
      {page === 'contacts' && <div className="context-scroll context-scroll--flush">{filteredAgents.map((item) => <ListRow key={item.id} selected={selectedAgent === item.id} avatar={<Avatar label={item.name} initials={item.initials} color={item.color} size="small" src={item.avatarUrl ?? employeeAvatarForName(item.name)} />} title={item.name} subtitle={item.role} meta="" marker={<StatusLight tone={item.tone} label={item.status} breathing={item.tone === 'active' || item.tone === 'waiting'} />} onPress={() => onAgent(item.id)} />)}</div>}
      {page === 'capabilities' && <>
        <div className="filter-row capability-kind-switch">{([['skill', 'Skills'], ['tool', 'Tools']] as const).map(([id, label]) => <Button key={id} className={capabilityFilter === id ? 'is-active' : ''} onPress={() => { setCapabilityFilter(id); onCapability(capabilities.find((item) => item.kind === id)?.id ?? selectedCapability) }}>{label}</Button>)}</div>
        <div className="context-scroll context-scroll--flush">{visibleCapabilities.map((item) => <ListRow key={item.id} selected={selectedCapability === item.id} title={item.name} subtitle={item.category} marker={<StatusLight tone={item.tone} label={item.status} />} onPress={() => onCapability(item.id)} />)}</div>
      </>}
      {page === 'system' && <div className="system-navigation">{systemSections.map((item) => { const Icon = item.icon; return <Button key={item.id} className={systemSection === item.id ? 'is-active' : ''} onPress={() => onSystemSection(item.id)}><Icon aria-hidden width={18} height={18} /><span>{item.label}</span><NavArrowRight aria-hidden width={15} height={15} /></Button> })}</div>}
    </aside>
  )
}

function MatterIndexView({ onOpenMatter }: { onOpenMatter: (matterId: ConversationMatterId) => void }): React.JSX.Element {
  const groups: Array<{ id: MatterGroup; label: string; description: string }> = [
    { id: 'attention', label: '需要你处理', description: '等待确认、补充材料或处理异常' },
    { id: 'active', label: '进行中', description: '总管或临时团队正在执行' },
    { id: 'completed', label: '已完成', description: '已交付或已关闭的历史事项' }
  ]
  return (
    <div className="message-scroll" role="tabpanel" aria-label="事项">
      <div className="matter-index-canvas">
        <section className="matter-index-intro">
          <div><span className="matter-index-eyebrow">当前会话</span><h2>事项</h2><p>事项由总管根据对话意图创建。每项事项独立保存当前状态、临时团队、进度和交付物。</p></div>
        </section>
        {groups.map((group) => {
          const matters = conversationMatters.filter((matter) => matter.group === group.id)
          if (!matters.length) return null
          return <section className="matter-index-section" key={group.id}><div className="matter-index-section__heading"><h3>{group.label}</h3><span>{group.description}</span></div><div className="matter-index-list">{[...matters].reverse().map((matter) => <Button className="matter-index-card" key={matter.id} onPress={() => onOpenMatter(matter.id)}>
            <div className="card-heading"><StatusLight tone={matter.tone} label={matter.status} breathing={matter.group === 'attention' || matter.group === 'active'} /><span>{matter.updatedAt}</span></div>
            <div className="matter-index-card__body"><span><strong>{matter.title}</strong><small>{matter.description}</small></span><NavArrowRight aria-hidden width={17} height={17} /></div>
            <div className="matter-index-card__footer"><MatterTeamAvatars team={matter.team} /><span>{matter.progress}</span><span>{matter.output}</span></div>
          </Button>)}</div></section>
        })}
      </div>
    </div>
  )
}

function MessagesPage({ conversationId, userProfile, onOpenMatter, onOpenDetail }: { conversationId: string; userProfile: UserProfile; onOpenMatter: (matterId: ConversationMatterId) => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const [activeView, setActiveView] = useState<MessageView>('conversation')
  const [draft, setDraft] = useState('')
  const [draftAttachments, setDraftAttachments] = useState<MessageAttachment[]>([])
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([])
  const conversation = conversations.find((item) => item.id === conversationId) ?? conversations[0]
  const hasMatters = conversationId === 'sea-saas'
  const hasAttention = hasMatters && conversationMatters.some((matter) => matter.group === 'attention')
  const addAttachments = (files: File[]): void => setDraftAttachments((items) => [...items, ...files.map((file, index) => ({ id: `${file.name}-${file.lastModified}-${index}`, name: file.name, detail: fileDetail(file) }))])
  const removeAttachment = (id: string): void => setDraftAttachments((items) => items.filter((item) => item.id !== id))
  const submit = (event: FormEvent): void => { event.preventDefault(); if (!draft.trim() && !draftAttachments.length) return; setLocalMessages((items) => [...items, { text: draft.trim(), attachments: draftAttachments }]); setDraft(''); setDraftAttachments([]) }

  useEffect(() => { setActiveView('conversation') }, [conversationId])

  return (
    <div className="workspace-page message-page">
      {hasMatters && <div className="topic-bar" role="tablist" aria-label="会话内容视图">
        <button type="button" role="tab" aria-selected={activeView === 'conversation'} className={activeView === 'conversation' ? 'is-active' : ''} onClick={() => setActiveView('conversation')}><ChatBubble aria-hidden width={16} height={16} />对话</button>
        <button type="button" role="tab" aria-selected={activeView === 'matter'} className={activeView === 'matter' ? 'is-active' : ''} onClick={() => setActiveView('matter')}><Page aria-hidden width={16} height={16} />事项 {hasAttention && <span className="topic-bar__attention" aria-label="存在需要你处理的事项" />}</button>
      </div>}
      {activeView === 'conversation' ? <>
      <div className="message-scroll" role="tabpanel" aria-label="对话">
        <div className="message-canvas">
          <div className="date-divider"><span>今天</span></div>
          {!hasMatters && <><ChatMessage source="user" name="你" initials={userProfile.name.slice(0, 1) || '你'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl} time="12:24"><MarkdownMessage>{`我在规划 **Agent 产品的消息机制**，希望先明确什么时候由总管直接回答，什么时候需要创建事项并组织多个 Agent。

请覆盖这些判断条件：

- 目标是否清晰，是否需要多轮确认
- 是否存在外部工具调用或较长执行时间
- 是否包含多个阶段、交付文件与交叉校验
- 连续提出多个目标时，如何区分普通追问、事项补充与新事项

> 还需要避免用户把一次约束调整误解成重复创建事项。`}</MarkdownMessage></ChatMessage><ChatMessage source="agent" name="总管" initials="总" color="#aebd83" avatarSrc={supervisorAvatar} time="12:26"><MarkdownMessage>{`### 判断原则

首先判断用户期待的是**即时答案**还是**持续结果**。

- 可以在当前上下文直接完成、没有外部副作用且不产生独立交付物的问题，由总管直接回答。
- 需要多步骤执行、长时间运行、外部工具、用户确认或可验收交付物时，才创建事项。
- 后续消息只补充当前目标的约束或材料时，归入已有事项。
- 改变最终交付目标、验收标准或需要独立团队时，创建关联的新事项。

归类不确定时，总管先向用户确认，并显示 \`已归入事项\` 或 \`已创建事项\` 的轻量提示。`}</MarkdownMessage></ChatMessage></>}
          {hasMatters && <>
          <ChatMessage source="user" name="你" initials={userProfile.name.slice(0, 1) || '你'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl} time="13:40"><MarkdownMessage>整理东南亚 **SaaS 市场进入机会**，重点看六个主要市场、竞争格局和进入风险。最终给我一份能直接评审的报告。</MarkdownMessage><MessageAttachmentGroup attachments={exampleUserAttachments} source="user" /></ChatMessage>
          <MatterRouteNote title="东南亚 SaaS 市场进入研究" mode="created" />
          <ChatMessage source="agent" name="总管" initials="总" color="#aebd83" avatarSrc={supervisorAvatar} time="13:41"><MarkdownMessage>已明确**目标和验收标准**。我会组织网络情报员收集并核验来源，再由文档编写员整理成可评审报告。</MarkdownMessage></ChatMessage>
          <MatterEvent matter={conversationMatters[0]} title="临时团队已组建" description="网络情报员、文档编写员开始执行" time="13:42" onOpen={() => onOpenMatter('market-entry')} />
          <article className="approval-card is-resolved message-stream-item"><div><Key aria-hidden width={19} height={19} /><p>你已批准网络情报员在当前事项中只读访问 GitHub 公开仓库。</p><IconButton label="查看审批详情" icon={Eye} onPress={() => onOpenDetail('approval-detail')} /></div></article>
          <article className="delivery-card delivery-card--complete message-stream-item"><header className="delivery-card__header"><span className="delivery-card__state"><Check aria-hidden width={18} height={18} /><span>已交付</span></span><time>14:32</time></header><div className="delivery-card__body"><span className="delivery-card__eyebrow">结果</span><h3>东南亚 SaaS 市场进入研究报告</h3><p className="delivery-card__summary">六个主要市场已覆盖，竞争格局和进入风险均有来源支持。</p><div className="delivery-card__verification" aria-label="交付概况"><span><strong>2/2</strong><small>完成要求</small></span><span><strong>20</strong><small>来源证据</small></span><span><strong>2</strong><small>交付文件</small></span></div><MessageAttachmentGroup attachments={generatedAttachments} source="agent" embedded /><Button className="text-action" onPress={() => onOpenDetail('delivery-evidence')}>查看完整验收记录 <NavArrowRight aria-hidden width={14} height={14} /></Button></div></article>
          <ChatMessage source="user" name="你" initials={userProfile.name.slice(0, 1) || '你'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl} time="15:05"><MarkdownMessage>基于刚才通过验收的报告，再整理一套**官网发布稿、管理层摘要和视觉方案**。</MarkdownMessage></ChatMessage>
          <MatterRouteNote title="市场报告发布包" mode="created" />
          <ChatMessage source="agent" name="总管" initials="总" color="#aebd83" avatarSrc={supervisorAvatar} time="15:06"><MarkdownMessage>这是新的交付目标。我已创建关联事项，由**文档编写员**负责整理，**网络情报员**补充来源核验；上一事项的团队不会自动延续。</MarkdownMessage></ChatMessage>
          <MatterEvent matter={conversationMatters[1]} title="临时团队已组建" description="文档编写员、网络情报员开始执行" time="15:08" onOpen={() => onOpenMatter('publication-pack')} />
          <article className="approval-card message-stream-item"><div><Key aria-hidden width={19} height={19} /><p>总管需要你确认发布物料的视觉方向，确认后临时团队将继续制作。</p><IconButton label="查看事项详情" icon={Eye} onPress={() => onOpenMatter('publication-pack')} /></div><div className="approval-actions"><Button className="button button--quiet">提出修改</Button><Button className="button button--primary">确认方向</Button></div></article>
          </>}
          {localMessages.map((message, index) => <ChatMessage source="user" name="你" initials={userProfile.name.slice(0, 1) || '你'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl} time="刚刚" key={`${message.text}-${index}`}><MarkdownMessage>{message.text || '已添加附件'}</MarkdownMessage><MessageAttachmentGroup attachments={message.attachments} source="user" /></ChatMessage>)}
        </div>
      </div>
      <form className="composer" onSubmit={submit}>
        <div className="composer__box">
          {draftAttachments.length > 0 && <div className="composer-attachment-tray"><MessageAttachmentGroup attachments={draftAttachments} source="user" embedded onRemove={removeAttachment} /></div>}
          <textarea aria-label="发送消息" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="发送给总管，补充问题或事项信息" />
          <div className="composer__toolbar">
            <div className="composer__group"><AttachmentUploadButton onFiles={addAttachments} /><Button className="composer__control"><ShieldCheck aria-hidden width={17} height={17} /><span>受控访问</span></Button></div>
            <div className="composer__group"><Button className="composer__control"><Sparks aria-hidden width={17} height={17} /><span>deepseek-v4-pro</span><NavArrowDown aria-hidden width={15} height={15} /></Button><IconButton label="语音输入" icon={Microphone} /><Button type="submit" aria-label="发送" className="composer__send" isDisabled={!draft.trim() && !draftAttachments.length}><ArrowUp aria-hidden width={19} height={19} /></Button></div>
          </div>
        </div>
      </form>
      </> : <MatterIndexView onOpenMatter={onOpenMatter} />}
    </div>
  )
}

function ContactPage({ agent }: { agent: Agent }): React.JSX.Element {
  const assignedSkills = capabilities.filter((capability) => capability.kind === 'skill' && agent.capabilities.includes(capability.name))
  return (
    <div className="workspace-page detail-page employee-detail-page">
      <div className="detail-canvas">
        <ProfileSummary agent={agent} />
        <ProfileValueTags items={[{ label: '工作状态', accessibleValue: agent.status, value: <StatusLight tone={agent.tone} label={agent.status} breathing={agent.tone === 'active' || agent.tone === 'waiting'} /> }, { label: '加入时间', accessibleValue: agent.joinedAt ?? '2026 年 8 月 14 日', value: agent.joinedAt ?? '2026 年 8 月 14 日' }, { label: '运行模型', accessibleValue: agent.model ?? 'deepseek-v4-pro', value: agent.model ?? 'deepseek-v4-pro' }, { label: '配置版本', accessibleValue: 'v1', value: 'v1' }]} />
        <section className="plain-section"><div className="content-section-title"><h3>能力摘要</h3><span>{assignedSkills.length} 项 Skill</span></div><SummaryCardGrid emptyMessage="尚未绑定 Skill。">{assignedSkills.map((skill) => <SummaryCard key={skill.id} leading={<Sparks aria-hidden width={18} height={18} />} title={skill.name} description={skill.summary} />)}</SummaryCardGrid></section>
      </div>
    </div>
  )
}

function CapabilityPage({ capability, onAgent, onOpenDetail }: { capability: Capability; onAgent: () => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const isSkill = capability.kind === 'skill'
  const MarkIcon = isSkill ? Sparks : Tools
  return (
    <div className="workspace-page detail-page">
      <div className="detail-canvas">
        <section className="capability-intro"><div className="capability-mark"><MarkIcon aria-hidden width={29} height={29} /></div><div><span className="capability-category">{capability.category} · v{capability.version}</span><h2>{capability.name}</h2><p>{capability.summary}</p></div></section>
        {isSkill && capability.skillMarkdown && <section className="plain-section skill-document"><div className="content-section-title"><h3>SKILL.md</h3><span>完整文档 · v{capability.version}</span></div><MarkdownContent className="skill-document__markdown">{capability.skillMarkdown}</MarkdownContent></section>}
        <section className="plain-section"><h3>{isSkill ? '适用任务' : '可用于'}</h3><div className="use-case-list">{capability.useCases.map((item) => <span key={item}>{item}</span>)}</div></section>
        <section className="plain-section"><h3>{isSkill ? '执行与依赖' : '调用关系'}</h3><div className="dependency-groups">{isSkill ? <><DependencyGroup icon={Brain} title="执行步骤" items={capability.skills} /><DependencyGroup icon={Tools} title="Tools" items={capability.tools} /></> : <><DependencyGroup icon={Sparks} title="关联 Skills" items={capability.skills} /><DependencyGroup icon={Database} title="连接与运行" items={capability.tools} /></>}<DependencyGroup icon={ShieldCheck} title="权限" items={capability.permissions} /></div></section>
        <section className="plain-section"><div className="content-section-title"><h3>已绑定 Agent</h3><span>{capability.agents.length} 位</span></div>{capability.agents.map((name) => <Button className="linked-agent" key={name} onPress={onAgent}><Avatar label={name} initials={name.slice(0, 1)} color="#b8c982" size="small" src={employeeAvatarForName(name)} /><span><strong>{name}</strong><small>查看员工资料</small></span><NavArrowRight aria-hidden width={16} height={16} /></Button>)}</section>
        <Button className="advanced-disclosure" onPress={() => onOpenDetail('capability-info')}>高级信息 <NavArrowRight aria-hidden width={14} height={14} /></Button>
      </div>
    </div>
  )
}

function DependencyGroup({ icon: Icon, title, items }: { icon: IconComponent; title: string; items: string[] }): React.JSX.Element {
  return <div><div className="dependency-groups__title"><Icon aria-hidden width={18} height={18} /><span>{title}</span></div>{items.map((item) => <p key={item}><Check aria-hidden width={15} height={15} />{item}</p>)}</div>
}

function SystemPage({ section, theme, onTheme, userProfile, onUserProfile, supervisorPrompt, onSupervisorPrompt, onOpenDetail }: { section: string; theme: ThemeMode; onTheme: (theme: ThemeMode) => void; userProfile: UserProfile; onUserProfile: (profile: UserProfile) => void; supervisorPrompt: string; onSupervisorPrompt: (prompt: string) => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const definition = systemSections.find((item) => item.id === section) ?? systemSections[0]
  const Icon = definition.icon
  return (
    <div className="workspace-page detail-page system-page">
      <div className="detail-canvas">
        <section className="settings-intro"><span>{section === 'supervisor' ? <Avatar label="总管" initials="总" color="#aebd83" size="medium" src={supervisorAvatar} /> : <Icon aria-hidden width={24} height={24} />}</span><div><h2>{definition.label}</h2><p>{systemDescription(section)}</p></div></section>
        {section === 'profile' && <ProfileSettings profile={userProfile} onProfile={onUserProfile} />}
        {section === 'general' && <GeneralSettings theme={theme} onTheme={onTheme} />}
        {section === 'supervisor' && <SupervisorSettings prompt={supervisorPrompt} onPrompt={onSupervisorPrompt} />}
        {section === 'models' && <ModelSettings />}
        {section === 'resources' && <ResourceSettings />}
        {section === 'memory' && <MemorySettings onOpenDetail={onOpenDetail} />}
        {section === 'usage' && <UsageSettings />}
        {section === 'about' && <AboutSettings onOpenDetail={onOpenDetail} />}
      </div>
    </div>
  )
}

function systemDescription(section: string): string {
  return {
    profile: '管理个人用户在客户端中的头像与身份信息。', general: '设置外观、启动行为与本地通知。', supervisor: '定义总管如何理解目标、组织临时团队并验收交付。', models: '管理模型连接和验证状态，Credential 明文不会回显。', resources: '查看 Tool、MCP 和数据源状态，并设置默认授权策略。', memory: '查看系统记住的内容，管理索引、本地存储与删除。', usage: '了解本周期用量、预算和成本来源。', about: '查看版本、Runtime 健康状态并导出诊断信息。'
  }[section] ?? ''
}

function SettingsBlock({ title, description, children }: { title: string; description?: string; children: ReactNode }): React.JSX.Element {
  return <section className="settings-block"><div className="settings-block__heading"><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="settings-block__content">{children}</div></section>
}

function ProfileSettings({ profile, onProfile }: { profile: UserProfile; onProfile: (profile: UserProfile) => void }): React.JSX.Element {
  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]): void => onProfile({ ...profile, [key]: value })
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update('avatarUrl', typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }
  return <><SettingsBlock title="个人身份" description="这是个人用户资料，不属于总管或任何 Agent 员工。"><div><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传个人头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={profile.name} initials={profile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="large" src={profile.avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label></div><TextField value={profile.name} onChange={(value) => update('name', value)} className="form-field"><Label>显示名称</Label><Input /></TextField><TextField value={profile.role} onChange={(value) => update('role', value)} className="form-field"><Label>身份说明</Label><Input placeholder="例如：产品经理" /></TextField><TextField value={profile.description} onChange={(value) => update('description', value)} className="form-field"><Label>个人简介</Label><TextArea rows={4} placeholder="补充你的工作方向与协作偏好。" /></TextField></div></SettingsBlock><SettingsBlock title="资料范围"><SettingRow title="本地个人资料" description="只用于当前客户端的身份展示，不会创建 Agent 员工"><StatusLight tone="success" label="本机" /></SettingRow></SettingsBlock></>
}

function GeneralSettings({ theme, onTheme }: { theme: ThemeMode; onTheme: (theme: ThemeMode) => void }): React.JSX.Element {
  return <><SettingsBlock title="外观" description="主题变化会立即应用到整个客户端。"><div className="theme-choice">{([['system', Settings, '跟随系统'], ['light', SunLight, '浅色'], ['dark', HalfMoon, '深色']] as const).map(([id, Icon, label]) => <Button key={id} className={theme === id ? 'is-active' : ''} onPress={() => onTheme(id)}><Icon aria-hidden width={20} height={20} /><span>{label}</span>{theme === id && <Check aria-hidden width={17} height={17} />}</Button>)}</div></SettingsBlock><SettingsBlock title="启动"><SettingRow title="启动时恢复上次会话" description="保留会话选择、滚动位置和未发送草稿"><input type="checkbox" defaultChecked aria-label="启动时恢复上次会话" /></SettingRow><SettingRow title="允许 macOS 通知" description="通知只是提醒，业务记录仍保存在原会话"><input type="checkbox" defaultChecked aria-label="允许 macOS 通知" /></SettingRow></SettingsBlock></>
}

function SupervisorSettings({ prompt, onPrompt }: { prompt: string; onPrompt: (prompt: string) => void }): React.JSX.Element {
  return <SettingsBlock title="总管定义" description="这是系统级配置，不属于任何 Agent 员工。"><TextField value={prompt} onChange={onPrompt} className="form-field"><Label>System Prompt</Label><TextArea rows={13} /></TextField></SettingsBlock>
}

function ModelSettings(): React.JSX.Element {
  const [credential, setCredential] = useState('')
  const [configured, setConfigured] = useState(false)
  const [verifiedModels, setVerifiedModels] = useState<string[]>([])
  const models = [
    { id: 'claude-sonnet-4.6', detail: '文本 · Responses API' },
    { id: 'gpt-image-2', detail: '图像 · Chat Completions API' },
    { id: 'seedance-2.0', detail: '视频 · Chat Completions API' }
  ]
  return <><SettingsBlock title="DeepSeek"><ProviderRow name="deepseek-v4-pro" status="已验证" tone="success" detail="文本 · Responses API" /></SettingsBlock><SettingsBlock title="Poe" description="一个 API Key 连接文本、图像和视频模型；模型验证互相独立。"><div className="provider-credential-panel"><TextField value={credential} onChange={setCredential} className="form-field provider-credential-field"><Label>Poe API Key</Label><div className="provider-credential-control"><Input type="password" placeholder={configured ? '输入新 Key 可替换当前连接' : '输入 Poe API Key'} /><Button className="button button--primary" isDisabled={credential.trim().length < 8} onPress={() => { setConfigured(true); setCredential(''); setVerifiedModels([]) }}>保存连接</Button></div></TextField><p>验证会向对应模型发起一次真实请求；图像和视频请求可能消耗较多 Poe Points。</p></div>{models.map((model) => <ProviderRow key={model.id} name={model.id} status={verifiedModels.includes(model.id) ? '已验证' : configured ? '待验证' : '待配置'} tone={verifiedModels.includes(model.id) ? 'success' : 'waiting'} detail={model.detail} actionLabel="验证" onConfigure={configured ? () => setVerifiedModels((items) => items.includes(model.id) ? items : [...items, model.id]) : undefined} />)}</SettingsBlock></>
}

function ProviderRow({ name, status, tone, detail, actionLabel = '配置', onConfigure }: { name: string; status: string; tone: StatusTone; detail: string; actionLabel?: string; onConfigure?: () => void }): React.JSX.Element {
  return <div className="provider-row"><span><strong>{name}</strong><small>{detail}</small></span><StatusLight tone={tone} label={status} breathing={tone === 'waiting'} />{onConfigure && <Button className="button button--quiet" onPress={onConfigure}>{actionLabel}</Button>}</div>
}

function ResourceSettings(): React.JSX.Element {
  return <><SettingsBlock title="默认授权策略" description="运行中不能静默扩大已冻结的权限范围。"><div className="permission-choice"><Button className="is-active"><Check aria-hidden width={17} height={17} /><span><strong>平衡</strong><small>只读动作自动执行，有副作用动作需要审批</small></span></Button><Button><span><strong>每次询问</strong><small>包括只读动作在内，所有 Tool 都需要审批</small></span></Button></div></SettingsBlock><SettingsBlock title="资源健康"><ProviderRow name="GitHub Repository Search" status="可用" tone="success" detail="最近检查 38ms" /><ProviderRow name="RSS Reader" status="可用" tone="success" detail="最近检查 84ms" /><ProviderRow name="Image Generation" status="不可用" tone="danger" detail="缺少 Poe Credential" /></SettingsBlock></>
}

function MemorySettings({ onOpenDetail }: { onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const rows = [
    { title: '内容输出优先使用简体中文', meta: '全局偏好，来源：用户确认', tone: 'success' as const, status: '有效' },
    { title: '任务交付需要保留来源与验收证据', meta: '全局规则，来源：任务复盘', tone: 'success' as const, status: '有效' },
    { title: '旧版页面结构与当前导航存在冲突', meta: '任务经验，等待用户处理', tone: 'waiting' as const, status: '冲突' }
  ].filter((item) => item.title.includes(query) || item.meta.includes(query))
  return <><SettingsBlock title="本地记忆"><div className="memory-summary"><div><strong>38</strong><span>有效记忆</span></div><div><strong>6</strong><span>等待处理</span></div><div><strong>24.8 MB</strong><span>本地占用</span></div></div><SearchBox placeholder="搜索记忆内容" value={query} onChange={setQuery} /></SettingsBlock><SettingsBlock title="最近记忆"><div className="memory-rows">{rows.map((item) => <Button key={item.title}><span><strong>{item.title}</strong><small>{item.meta}</small></span><StatusLight tone={item.tone} label={item.status} breathing={item.tone === 'waiting'} /></Button>)}</div></SettingsBlock><Button className="text-action" onPress={() => onOpenDetail('memory-governance')}>查看和治理全部记忆 <NavArrowRight aria-hidden width={14} height={14} /></Button></>
}

function UsageSettings(): React.JSX.Element {
  return <><div className="usage-summary"><div><span>本周期用量</span><strong>¥ 86.42</strong><small>价格来源更新于今天 08:00</small></div><div><span>预算余额</span><strong>¥ 413.58</strong><small>月度预算 ¥ 500</small></div></div><SettingsBlock title="用量来源"><div className="usage-rows"><p><span>deepseek-v4-pro</span><strong>4.82M tokens</strong><em>¥ 61.30</em></p><p><span>gpt-image-2</span><strong>12 张图像</strong><em>价格待验证</em></p><p><span>seedance-2.0</span><strong>0 分钟</strong><em>尚未使用</em></p></div></SettingsBlock><SettingsBlock title="预算"><SettingRow title="月度预算" description="达到 80% 时在消息页提醒"><Button className="button button--quiet">¥ 500</Button></SettingRow></SettingsBlock></>
}

function AboutSettings({ onOpenDetail }: { onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  return <><SettingsBlock title="应用"><SettingRow title="AI Employee OS" description="本地开发版本"><span>0.1.0</span></SettingRow><SettingRow title="Runtime" description="Local Control Runtime"><StatusLight tone="success" label="已连接" /></SettingRow><SettingRow title="数据库" description="本地版本化存储"><StatusLight tone="success" label="正常" /></SettingRow></SettingsBlock><SettingsBlock title="诊断"><SettingRow title="重新检查系统状态" description="不会修改业务数据"><Button className="button button--quiet"><Refresh aria-hidden width={16} height={16} />检查</Button></SettingRow><SettingRow title="导出诊断信息" description="默认排除 Credential 与记忆正文"><Button className="button button--quiet">导出</Button></SettingRow></SettingsBlock><Button className="advanced-disclosure" onPress={() => onOpenDetail('about-advanced')}>查看高级信息 <NavArrowRight aria-hidden width={14} height={14} /></Button></>
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }): React.JSX.Element {
  return <div className="setting-row"><span><strong>{title}</strong><small>{description}</small></span>{children}</div>
}

function CreateAgentModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (agent: Agent) => void }): React.JSX.Element {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('deepseek-v4-pro')
  const [assignedCapabilities, setAssignedCapabilities] = useState<string[]>(['多源网络调研'])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!isOpen) return
    setStep(0); setName(''); setRole(''); setDescription(''); setPrompt(''); setModel('deepseek-v4-pro'); setAssignedCapabilities(['多源网络调研']); setAvatarUrl(null)
  }, [isOpen])
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setAvatarUrl(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }
  const steps = [['basic', UserIcon, '基本资料'], ['prompt', EditPencil, '提示词'], ['ability', Brain, '模型与能力']] as const
  const validLength = (value: string, limits: { min: number; max: number }): boolean => [...value.trim()].length >= limits.min && [...value.trim()].length <= limits.max
  const canContinue = step === 0 ? validLength(name, EMPLOYEE_FIELD_LIMITS.name) && validLength(role, EMPLOYEE_FIELD_LIMITS.role) && validLength(description, EMPLOYEE_FIELD_LIMITS.description) : step === 1 ? validLength(prompt, EMPLOYEE_FIELD_LIMITS.systemPrompt) : Boolean(model && assignedCapabilities.length)
  const advance = (): void => {
    if (!canContinue) return
    if (step < 2) { setStep((step + 1) as 1 | 2); return }
    onCreate({ id: `agent-${Date.now()}`, name: name.trim(), initials: name.trim().slice(0, 1), role: role.trim(), status: '待测试', tone: 'waiting', description: description.trim(), color: '#c5b8e3', avatarUrl, prompt: prompt.trim(), model, joinedAt: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date()), capabilities: assignedCapabilities, deliveries: [] })
  }

  return <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay"><Modal className="app-modal app-modal--large"><Dialog className="modal-dialog" aria-label="新建 Agent 员工">
    <div className="modal-header"><div><Heading slot="title">新建 Agent 员工</Heading><span className="quiet-meta">第 {step + 1} / 3 步</span></div><IconButton label="关闭" icon={Xmark} onPress={onClose} /></div>
    <div className="modal-layout"><nav className="modal-navigation create-agent-navigation">{steps.map(([id, Icon, label], index) => <Button key={id} className={step === index ? 'is-active' : ''} onPress={() => index <= step && setStep(index as 0 | 1 | 2)}><Icon aria-hidden width={17} height={17} /><span>{label}</span>{index < step && <Check aria-hidden width={15} height={15} />}</Button>)}</nav>
      <div className="modal-content modal-content--with-footer"><div className="modal-content__main">
        {step === 0 && <div className="form-section"><Heading>基本资料</Heading><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传新员工头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={name || '新员工'} initials={name.trim().slice(0, 1) || '新'} color="#c5b8e3" size="large" src={avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label></div><TextField value={name} onChange={setName} className="form-field"><Label>名称</Label><Input maxLength={EMPLOYEE_FIELD_LIMITS.name.max} placeholder="例如：用户研究员" /></TextField><TextField value={role} onChange={setRole} className="form-field"><Label>职责</Label><Input maxLength={EMPLOYEE_FIELD_LIMITS.role.max} placeholder="例如：用户访谈与洞察分析" /></TextField><TextField value={description} onChange={setDescription} className="form-field"><Label>职责说明</Label><TextArea rows={4} maxLength={EMPLOYEE_FIELD_LIMITS.description.max} placeholder="说明这个 Agent 负责什么，以及不负责什么。" /></TextField></div>}
        {step === 1 && <div className="form-section"><Heading>提示词</Heading><TextField value={prompt} onChange={setPrompt} className="form-field form-field--prompt"><Label>System Prompt</Label><TextArea rows={14} maxLength={EMPLOYEE_FIELD_LIMITS.systemPrompt.max} placeholder="定义角色、工作方法、输出要求和边界。" /></TextField><div className="prompt-layers"><p><ShieldCheck aria-hidden width={17} height={17} /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden width={17} height={17} /><span><strong>运行上下文层</strong><small>任务开始时按最小范围注入</small></span></p></div></div>}
        {step === 2 && <div className="form-section"><Heading>模型与能力</Heading><ModelCapabilityPicker model={model} assignedCapabilities={assignedCapabilities} onModel={setModel} onCapabilities={setAssignedCapabilities} /></div>}
      </div><div className="create-agent-actions"><div><Button className="button button--quiet" onPress={step === 0 ? onClose : () => setStep((step - 1) as 0 | 1)}>{step === 0 ? '取消' : '上一步'}</Button><Button className="button button--primary" isDisabled={!canContinue} onPress={advance}>{step === 2 ? '创建员工' : '继续'}</Button></div></div></div>
    </div>
  </Dialog></Modal></ModalOverlay>
}

function AgentSettingsModal({ agent, isOpen, onClose, onDelete }: { agent: Agent; isOpen: boolean; onClose: () => void; onDelete: () => void }): React.JSX.Element {
  const [section, setSection] = useState('basic')
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [prompt, setPrompt] = useState(agent.prompt ?? `你是${agent.name}。${agent.description}`)
  const [model, setModel] = useState(agent.model ?? 'deepseek-v4-pro')
  const [assignedCapabilities, setAssignedCapabilities] = useState(agent.capabilities)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(agent.avatarUrl ?? null)
  useEffect(() => { if (!isOpen) return; setSection('basic'); setName(agent.name); setDescription(agent.description); setPrompt(agent.prompt ?? `你是${agent.name}。${agent.description}`); setModel(agent.model ?? 'deepseek-v4-pro'); setAssignedCapabilities(agent.capabilities); setAvatarUrl(agent.avatarUrl ?? null) }, [agent, isOpen])
  useEffect(() => () => { if (avatarUrl) URL.revokeObjectURL(avatarUrl) }, [avatarUrl])
  const changeAvatar = (file: File | null): void => { if (file) setAvatarUrl(URL.createObjectURL(file)) }
  const sections = [['basic', UserIcon, '基本资料'], ['prompt', EditPencil, '提示词'], ['model', Brain, '模型与能力'], ['memory', Database, '记忆']] as const

  return <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay"><Modal className="app-modal app-modal--large"><Dialog className="modal-dialog" aria-label="Agent 设置">
    <div className="modal-header"><div className="modal-identity employee-modal-identity"><Avatar label={name} initials={name.slice(0, 1)} color={agent.color} size="medium" src={avatarUrl} /><strong>{name}</strong><StatusLight tone={agent.tone} label={agent.status} breathing={agent.tone === 'active' || agent.tone === 'waiting'} /></div><div className="modal-header__actions"><IconButton label="删除 Agent" icon={Trash} className="modal-delete-button" onPress={onDelete} /></div><IconButton label="关闭" icon={Xmark} onPress={onClose} /></div>
    <div className="modal-layout"><nav className="modal-navigation">{sections.map(([id, Icon, label]) => <Button key={id} className={section === id ? 'is-active' : ''} onPress={() => setSection(id)}><Icon aria-hidden width={17} height={17} /><span>{label}</span></Button>)}</nav>
      <div className="modal-content"><div className="modal-content__main"><AgentFormSection section={section} name={name} description={description} prompt={prompt} model={model} capabilities={assignedCapabilities} avatarUrl={avatarUrl} onAvatar={changeAvatar} onName={setName} onDescription={setDescription} onPrompt={setPrompt} onModel={setModel} onCapabilities={setAssignedCapabilities} /></div></div>
    </div>
  </Dialog></Modal></ModalOverlay>
}

const UserIcon = Group

function AgentFormSection({ section, name, description, prompt, model, capabilities: assignedCapabilities, avatarUrl, onAvatar, onName, onDescription, onPrompt, onModel, onCapabilities }: { section: string; name: string; description: string; prompt: string; model: string; capabilities: string[]; avatarUrl: string | null; onAvatar: (file: File | null) => void; onName: (value: string) => void; onDescription: (value: string) => void; onPrompt: (value: string) => void; onModel: (value: string) => void; onCapabilities: (value: string[]) => void }): React.JSX.Element {
  if (section === 'basic') return <div className="form-section"><Heading>基本资料</Heading><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传头像" onChange={(event) => onAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={name} initials={name.slice(0, 1)} color="#b8c982" size="large" src={avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil width={16} height={16} /></span></label></div><TextField value={name} onChange={onName} className="form-field"><Label>名称</Label><Input maxLength={EMPLOYEE_FIELD_LIMITS.name.max} /></TextField><TextField value={description} onChange={onDescription} className="form-field"><Label>职责说明</Label><TextArea rows={4} maxLength={EMPLOYEE_FIELD_LIMITS.description.max} /></TextField></div>
  if (section === 'prompt') return <div className="form-section"><Heading>提示词</Heading><TextField value={prompt} onChange={onPrompt} className="form-field form-field--prompt"><Label>System Prompt</Label><TextArea rows={13} maxLength={EMPLOYEE_FIELD_LIMITS.systemPrompt.max} /></TextField><div className="prompt-layers"><p><ShieldCheck aria-hidden width={17} height={17} /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden width={17} height={17} /><span><strong>运行上下文层</strong><small>任务启动时按最小范围注入</small></span></p></div></div>
  if (section === 'model') return <div className="form-section"><Heading>模型与能力</Heading><ModelCapabilityPicker model={model} assignedCapabilities={assignedCapabilities} onModel={onModel} onCapabilities={onCapabilities} /><div className="derived-tools"><h3>派生资源</h3><p><Tools aria-hidden width={17} height={17} />由已绑定 Skill 解析 Tool 与 MCP</p><p><ShieldCheck aria-hidden width={17} height={17} />运行时仍与任务授权取交集</p></div></div>
  return <div className="form-section"><Heading>记忆</Heading><p>正式运行时仍会与任务 RunGrant 取交集。</p><div className="choice-stack"><label><input type="checkbox" defaultChecked /><span><strong>员工记忆</strong><small>保留该员工的长期工作偏好和经验</small></span></label><label><input type="checkbox" defaultChecked /><span><strong>任务记忆</strong><small>只读取当前任务明确允许的上下文</small></span></label><label><input type="checkbox" /><span><strong>全局记忆</strong><small>读取用户确认的全局偏好与规则</small></span></label></div></div>
}

function DetailDataRow({ title, description, value, tone }: { title: string; description: string; value: string; tone?: StatusTone }): React.JSX.Element {
  return <div className="detail-data-row"><span><strong>{title}</strong><small>{description}</small></span>{tone ? <StatusLight tone={tone} label={value} breathing={tone === 'waiting' || tone === 'active'} /> : <em>{value}</em>}</div>
}

function DetailModal({ view, capability, onClose }: { view: DetailView; capability: Capability; onClose: () => void }): React.JSX.Element {
  const definitions: Record<Exclude<DetailView, null>, { title: string; description: string }> = {
    'memory-governance': { title: '全部记忆', description: '查看记忆来源、状态和适用范围，处理冲突或过期内容。' },
    'capability-info': { title: '能力高级信息', description: '查看能力版本、依赖、授权边界与已绑定员工。' },
    'approval-detail': { title: '审批详情', description: '确认申请主体、访问范围、持续时间和可能产生的影响。' },
    'delivery-evidence': { title: '来源、证据与验收记录', description: '从最终交付回溯来源、证据索引和每一项验收结论。' },
    'about-advanced': { title: '应用高级信息', description: '用于本地诊断的版本、Runtime 与存储信息。' },
    'runtime-advanced': { title: 'Runtime 信息', description: '查看当前任务的运行快照、授权交集与恢复状态。' }
  }
  const definition = view ? definitions[view] : definitions['memory-governance']
  return <ModalOverlay isOpen={Boolean(view)} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay modal-overlay--nested"><Modal className="app-modal app-modal--large"><Dialog className="modal-dialog" aria-label={definition.title}>
    <div className="modal-header"><div><Heading slot="title">{definition.title}</Heading><span className="quiet-meta">详情页</span></div><IconButton label="关闭" icon={Xmark} onPress={onClose} /></div>
    <div className="detail-browser-content"><div className="detail-browser-intro"><h3>{definition.title}</h3><p>{definition.description}</p></div>
      {view === 'memory-governance' && <><section><div className="content-section-title"><h3>记忆概览</h3><span>44 项</span></div><div className="memory-summary"><div><strong>38</strong><span>有效</span></div><div><strong>4</strong><span>待确认</span></div><div><strong>2</strong><span>存在冲突</span></div></div></section><section><div className="content-section-title"><h3>全部记忆</h3><span>按最近更新排序</span></div><div className="detail-data-list"><DetailDataRow title="内容输出优先使用简体中文" description="全局偏好 · 来源：用户确认 · 今天 09:18" value="有效" tone="success" /><DetailDataRow title="任务交付需要保留来源与验收证据" description="全局规则 · 来源：任务复盘 · 8 月 30 日" value="有效" tone="success" /><DetailDataRow title="旧版页面结构与当前导航存在冲突" description="任务经验 · 需要选择保留版本 · 8 月 28 日" value="待处理" tone="waiting" /><DetailDataRow title="内容编辑默认面向旧渠道格式" description="员工经验 · 已被新发布规范替代 · 8 月 20 日" value="已过期" tone="muted" /></div></section></>}
      {view === 'capability-info' && <><section><div className="content-section-title"><h3>版本与状态</h3><span>{capability.kind === 'skill' ? 'Skill' : 'Tool'}</span></div><div className="detail-data-list"><DetailDataRow title={capability.name} description={`${capability.category} · 当前版本 v${capability.version}`} value={capability.status} tone={capability.tone} /><DetailDataRow title="更新策略" description="版本由能力目录统一发布，运行中的任务继续使用冻结快照" value="版本化" /><DetailDataRow title="绑定范围" description={capability.agents.length ? capability.agents.join('、') : '尚未绑定员工'} value={`${capability.agents.length} 位`} /></div></section><section><div className="content-section-title"><h3>运行边界</h3><span>只读</span></div><div className="detail-data-list"><DetailDataRow title="依赖" description={[...capability.skills, ...capability.tools].join(' · ')} value="已解析" tone="success" /><DetailDataRow title="权限" description={capability.permissions.join(' · ')} value="任务取交集" /></div></section></>}
      {view === 'approval-detail' && <><section><div className="content-section-title"><h3>本次申请</h3><span>等待决定</span></div><div className="detail-data-list"><DetailDataRow title="申请主体" description="网络情报员 · 东南亚 SaaS 市场研究" value="Agent" /><DetailDataRow title="访问资源" description="GitHub 公开仓库搜索，只读获取仓库与发布信息" value="只读" tone="success" /><DetailDataRow title="有效时间" description="仅当前任务、当前步骤有效，任务结束后自动失效" value="一次性" /><DetailDataRow title="副作用" description="不会写入 GitHub；检索结果会进入当前任务证据包" value="低风险" /></div></section></>}
      {view === 'delivery-evidence' && <><section><div className="content-section-title"><h3>验收结果</h3><span>3 / 3 通过</span></div><div className="detail-data-list"><DetailDataRow title="市场覆盖" description="六个主要市场均有独立结论与限制说明" value="通过" tone="success" /><DetailDataRow title="来源可追溯" description="关键结论关联 18 个已核验公开来源" value="通过" tone="success" /><DetailDataRow title="风险表达" description="冲突口径和信息缺口已降低结论强度" value="通过" tone="success" /></div></section><section><div className="content-section-title"><h3>证据与交付物</h3><span>3 个文件</span></div><div className="detail-data-list"><DetailDataRow title="SEA-SaaS-Market-Entry.md" description="最终报告 · 生成于 14:32" value="286 KB" /><DetailDataRow title="Evidence-Index.csv" description="结论到来源的证据索引" value="94 KB" /><DetailDataRow title="Verified-Sources.pdf" description="已核验来源快照" value="2.4 MB" /></div></section></>}
      {view === 'about-advanced' && <section><div className="content-section-title"><h3>本地诊断</h3><span>只读</span></div><div className="detail-data-list"><DetailDataRow title="客户端版本" description="AI Employee OS macOS Prototype" value="0.1.0" /><DetailDataRow title="Runtime" description="Local Control Runtime · 最近心跳 18ms" value="已连接" tone="success" /><DetailDataRow title="数据存储" description="本地版本化存储 · 迁移版本 020" value="正常" tone="success" /><DetailDataRow title="界面契约" description="排版、布局和窗口安全检查" value="通过" tone="success" /></div></section>}
      {view === 'runtime-advanced' && <section><div className="content-section-title"><h3>运行快照</h3><span>只读</span></div><div className="detail-data-list"><DetailDataRow title="任务状态" description="目标与验收标准已冻结，当前处于最终审核" value="正在审核" tone="active" /><DetailDataRow title="配置快照" description="2 位 Agent、2 个 Skill、3 个 Tool" value="已冻结" /><DetailDataRow title="授权交集" description="任务授权 ∩ Agent 能力 ∩ Skill 权限" value="有效" tone="success" /><DetailDataRow title="恢复状态" description="最近检查点 14:18，未发现未知副作用" value="可恢复" tone="success" /></div></section>}
    </div>
  </Dialog></Modal></ModalOverlay>
}

function MatterDetailModal({ matter, isOpen, onClose, onOpenDetail }: { matter: ConversationMatter; isOpen: boolean; onClose: () => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  return <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay"><Modal className="app-modal app-modal--medium"><Dialog className="modal-dialog" aria-label="事项详情"><div className="modal-header"><div><Heading slot="title">{matter.title}</Heading><StatusLight tone={matter.tone} label={matter.status} breathing={matter.group === 'attention' || matter.group === 'active'} /></div><IconButton label="关闭" icon={Xmark} onPress={onClose} /></div><div className="matter-detail-content"><section><h3>当前阶段</h3><p>{matter.description} 当前进度 {matter.progress}，下一步：{matter.nextStep}。</p></section><section><h3>执行时间线</h3><div className="timeline">{matter.timeline.map((item) => <TimelineItem key={item.title} state={item.state} title={item.title} meta={item.meta} />)}</div></section><section><h3>当前临时团队</h3><div className="participant-list">{matter.team.map((item) => <span key={item.name}><Avatar label={item.name} initials={item.initials} color={item.color} size="small" src={employeeAvatarForName(item.name)} />{item.name}</span>)}</div></section><Button className="advanced-disclosure" onPress={() => onOpenDetail('runtime-advanced')}>查看高级 Runtime 信息 <NavArrowRight aria-hidden width={14} height={14} /></Button></div></Dialog></Modal></ModalOverlay>
}

function TimelineItem({ state, title, meta }: { state: TimelineState; title: string; meta: string }): React.JSX.Element {
  return <div className={`timeline-item timeline-item--${state}`}><span>{state === 'done' ? <Check aria-hidden width={14} height={14} /> : null}</span><div><strong>{title}</strong><small>{meta}</small></div></div>
}

function DeleteAgentModal({ isOpen, onClose, onConfirm }: { isOpen: boolean; onClose: () => void; onConfirm: () => void }): React.JSX.Element {
  return <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay modal-overlay--nested"><Modal className="app-modal app-modal--small"><Dialog className="modal-dialog confirm-dialog" aria-label="删除 Agent"><span className="danger-icon"><WarningTriangle aria-hidden width={24} height={24} /></span><Heading slot="title">删除网络调研员？</Heading><p>此操作不可恢复。历史任务会保留执行时的名称与版本快照，并标记为已删除。</p><div className="confirm-actions"><Button className="button button--quiet" onPress={onClose}>取消</Button><Button className="button button--danger" onPress={onConfirm}>确认删除</Button></div></Dialog></Modal></ModalOverlay>
}

export function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('messages')
  const [agentItems, setAgentItems] = useState<Agent[]>(initialAgents)
  const [selectedConversation, setSelectedConversation] = useState('sea-saas')
  const [selectedAgent, setSelectedAgent] = useState('researcher')
  const [selectedCapability, setSelectedCapability] = useState('research')
  const [systemSection, setSystemSection] = useState('profile')
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: 'Kakarrot', role: '产品经理', description: '使用 AI Employee OS 组织个人工作、Agent 员工和可验收交付。', avatarUrl: null })
  const [supervisorPrompt, setSupervisorPrompt] = useState('你是 AI Employee OS 的总管，也是用户唯一的对话入口。你负责理解用户目标，判断请求是直接回答、归入已有事项还是创建新事项；当事项需要多步执行、持续状态、等待、交付物或用户确认时，按最小权限原则组织临时 Agent 团队。员工不直接代表系统向用户回复，由你汇总关键事件和最终交付。不得自行扩大权限、预算或访问范围。')
  const [selectedMatterId, setSelectedMatterId] = useState<ConversationMatterId>('market-entry')
  const [modal, setModal] = useState<ModalState>(null)
  const [detailView, setDetailView] = useState<DetailView>(null)
  const activeAgent = agentItems.find((item) => item.id === selectedAgent) ?? agentItems[0]
  const activeCapability = capabilities.find((item) => item.id === selectedCapability) ?? capabilities[0]
  const activeMatter = conversationMatters.find((item) => item.id === selectedMatterId) ?? conversationMatters[0]
  const activeConversation = conversations.find((item) => item.id === selectedConversation) ?? conversations[0]
  const activeSystemSection = systemSections.find((item) => item.id === systemSection) ?? systemSections[0]
  const resolvedTheme = theme === 'system' ? undefined : theme
  const navigate = (id: PageId): void => { setPage(id); setModal(null); setDetailView(null) }
  const openLinkedAgent = (): void => { setSelectedAgent('researcher'); setPage('contacts') }
  const createAgent = (agent: Agent): void => { setAgentItems((items) => [...items, agent]); setSelectedAgent(agent.id); setModal(null) }
  const toolbarTitle = page === 'messages' ? activeConversation.title : page === 'contacts' ? activeAgent.name : page === 'capabilities' ? activeCapability.name : activeSystemSection.label
  const toolbarSupport = page === 'contacts' ? <StatusLight tone={activeAgent.tone} label={activeAgent.status} breathing={activeAgent.tone === 'active' || activeAgent.tone === 'waiting'} /> : page === 'capabilities' ? <StatusLight tone={activeCapability.tone} label={activeCapability.status} /> : undefined
  const toolbarTrailing = page === 'contacts' ? <IconButton label="设置" icon={Settings} onPress={() => setModal('agent-settings')} /> : page === 'capabilities' ? <span className="quiet-meta">只读 {activeCapability.kind === 'skill' ? 'Skill' : 'Tool'} 目录</span> : undefined

  useEffect(() => {
    if (resolvedTheme) document.documentElement.dataset.theme = resolvedTheme
    else delete document.documentElement.dataset.theme
    return () => delete document.documentElement.dataset.theme
  }, [resolvedTheme])

  return (
    <IconoirProvider iconProps={{ strokeWidth: 1.5 }}>
      <div className="prototype" data-theme={resolvedTheme}>
        <Toolbar title={toolbarTitle} support={toolbarSupport} trailing={toolbarTrailing} />
        <Rail active={page} userProfile={userProfile} onNavigate={navigate} onProfile={() => { setSystemSection('profile'); navigate('system') }} />
        <ContextPane page={page} agentItems={agentItems} selectedConversation={selectedConversation} onConversation={setSelectedConversation} selectedAgent={selectedAgent} onAgent={setSelectedAgent} onCreateAgent={() => setModal('create-agent')} selectedCapability={selectedCapability} onCapability={setSelectedCapability} onOpenDetail={setDetailView} systemSection={systemSection} onSystemSection={setSystemSection} />
        <main className="workspace">
          <div className="workspace-center">
            {page === 'messages' && <MessagesPage conversationId={selectedConversation} userProfile={userProfile} onOpenMatter={(matterId) => { setSelectedMatterId(matterId); setModal('matter-detail') }} onOpenDetail={setDetailView} />}
            {page === 'contacts' && <ContactPage agent={activeAgent} />}
            {page === 'capabilities' && <CapabilityPage capability={activeCapability} onAgent={openLinkedAgent} onOpenDetail={setDetailView} />}
            {page === 'system' && <SystemPage section={systemSection} theme={theme} onTheme={setTheme} userProfile={userProfile} onUserProfile={setUserProfile} supervisorPrompt={supervisorPrompt} onSupervisorPrompt={setSupervisorPrompt} onOpenDetail={setDetailView} />}
          </div>
        </main>
        <CreateAgentModal isOpen={modal === 'create-agent'} onClose={() => setModal(null)} onCreate={createAgent} />
        <AgentSettingsModal agent={activeAgent} isOpen={modal === 'agent-settings'} onClose={() => setModal(null)} onDelete={() => setModal('delete-agent')} />
        <MatterDetailModal matter={activeMatter} isOpen={modal === 'matter-detail'} onClose={() => setModal(null)} onOpenDetail={setDetailView} />
        <DeleteAgentModal isOpen={modal === 'delete-agent'} onClose={() => setModal('agent-settings')} onConfirm={() => setModal(null)} />
        <DetailModal view={detailView} capability={activeCapability} onClose={() => setDetailView(null)} />
      </div>
    </IconoirProvider>
  )
}
