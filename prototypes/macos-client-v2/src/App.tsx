import React, { useEffect, useRef, useState } from 'react'
import type { ComponentType, FormEvent, ReactNode } from 'react'
import {
  ArrowUp,
  Brain,
  ChatBubble,
  Check,
  Coins,
  Community,
  Database,
  EditPencil,
  Eye,
  Group,
  HalfMoon,
  InfoCircle,
  Key,
  Link,
  Microphone,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
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
  Xmark
} from 'iconoir-react'
import {
  Button,
  Dialog,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea,
  TextField,
} from 'react-aria-components'
import networkIntelligenceAvatar from '../../../src/renderer/src/assets/employee-avatars/network-intelligence.png'
import documentWriterAvatar from '../../../src/renderer/src/assets/employee-avatars/document-writer.png'
import { ClientIconSystem } from '../../../src/renderer/src/components/client-icon-system'
import {
  AppShell, Toolbar as ClientToolbar, Rail as ClientRail, ContextPane as ClientContextPane,
  IconButton as ClientIconButton, Avatar as ClientAvatar, StatusLight as ClientStatusLight,
  SearchBox as ClientSearchBox, ListRow as ClientListRow, ProfileSummary as ClientProfileSummary,
  SelectionCatalog as ClientSelectionCatalog, SelectionOption as ClientSelectionOption,
  SectionHeader, ProfileFacts, ProfileValueTags, SummaryCardGrid, SummaryCard,
  DetailPage, DetailSummaryPanel, DetailSectionHeader, DetailState, SettingsBlock, SettingRow
} from '../../../src/renderer/src/components/client-ui'
import { ChatMessage, MarkdownMessage, MarkdownContent, ChatContentBlock, MessageActionCard, MessageConfirmationActions, MessageAttachmentGroup as ClientMessageAttachmentGroup, fileDetail } from '../../../src/renderer/src/components/message-ui'
import { candidateExpertGroups, type ExpertGroupSummary } from '../../../src/renderer/src/ExpertGroupDirectory'
import supervisorAvatar from '../../../src/renderer/src/assets/employee-avatars/supervisor.png'
import githubConnectionIcon from '../../../src/renderer/src/assets/connections/github.svg'
import feishuConnectionIcon from '../../../src/renderer/src/assets/connections/feishu.svg'
import teamsConnectionIcon from '../../../src/renderer/src/assets/connections/teams.svg'
import notionConnectionIcon from '../../../src/renderer/src/assets/connections/notion.svg'
import dingtalkConnectionIcon from '../../../src/renderer/src/assets/connections/dingtalk.svg'
import wecomConnectionIcon from '../../../src/renderer/src/assets/connections/wecom.svg'
import wechatConnectionIcon from '../../../src/renderer/src/assets/connections/wechat.svg'
import yuqueConnectionIcon from '../../../src/renderer/src/assets/connections/yuque.svg'
import wpsConnectionIcon from '../../../src/renderer/src/assets/connections/wps.svg'
import baiduNetdiskConnectionIcon from '../../../src/renderer/src/assets/connections/baidu-netdisk.svg'
import giteeConnectionIcon from '../../../src/renderer/src/assets/connections/gitee.svg'
import alibabaCloudConnectionIcon from '../../../src/renderer/src/assets/connections/alibaba-cloud.svg'
import { EMPLOYEE_FIELD_LIMITS } from '../../../src/shared/employee-contract'
import { FeishuMeetingPage } from './FeishuMeetingPage'
import { createFeishuMeetingSession, meetingExpertGroup, meetingStageStatus, type FeishuMeetingSession } from './feishu-meeting-demo'
import { useFeishuMeetingSessions } from './useFeishuMeetingSessions'

type PageId = 'messages' | 'contacts' | 'capabilities' | 'connections' | 'system'
type ThemeMode = 'system' | 'light' | 'dark'
type ContactKind = 'experts' | 'groups'
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
  expertGroupId?: string
  isNew?: boolean
  scene?: 'feishu-meeting'
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
  memoryScopes?: string[]
  deliveries: Array<{ title: string; meta: string; state: string }>
}

interface UserProfile {
  name: string
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
  file?: File
  id: string
  name: string
  detail: string
}

interface LocalMessage {
  text: string
  attachments: MessageAttachment[]
}

interface ConversationSession {
  publicationConfirmed?: boolean
  draft: string
  attachments: MessageAttachment[]
  messages: LocalMessage[]
}

const emptyConversationSession: ConversationSession = { draft: '', attachments: [], messages: [] }

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

const initialConversations: Conversation[] = [
  { id: 'feishu-meeting-v01', title: '飞书会议 · v0.1', preview: '专家团协作：飞书会议与妙记摘要', time: '刚刚', avatar: '团', color: '#c5b8e3', expertGroupId: meetingExpertGroup.id, scene: 'feishu-meeting' },
  { id: 'sea-saas', title: '东南亚市场研究', preview: '总管：等待你确认发布物料方向', time: '15:18', attention: true, avatar: '东', color: '#b8c982' },
  { id: 'plain-qa', title: 'Agent 产品讨论', preview: '总管：产品方案讨论记录', time: '12:26', avatar: '问', color: '#d7b36a' },
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
  { id: 'capabilities', label: '能力', icon: Sparks },
  { id: 'connections', label: '连接', icon: Link }
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

function IconButton({ onPress, isDisabled, ...props }: { label: string; icon: IconComponent; onPress?: () => void; isDisabled?: boolean; className?: string }): React.JSX.Element {
  return <ClientIconButton {...props} onClick={onPress} disabled={isDisabled} />
}

function StatusLight({ tone, ...props }: { tone: StatusTone; label: string; breathing?: boolean }): React.JSX.Element {
  return <ClientStatusLight state={tone} {...props} />
}

function Avatar({ size = 'medium', ...props }: { label: string; initials: string; color: string; size?: 'small' | 'medium' | 'large'; src?: string | null }): React.JSX.Element {
  return <ClientAvatar {...props} size={size} />
}

function SearchBox({ placeholder, ...props }: { placeholder: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  return <ClientSearchBox label={placeholder} placeholder={placeholder} {...props} />
}

const prototypeModelOptions = [
  { id: 'deepseek-v4-pro', provider: 'DeepSeek', description: '适合中文理解、推理与结构化输出。', status: 'Credential 已配置', tone: 'success' as const },
  { id: 'claude-sonnet-4.6', provider: 'Poe', description: '适合长文本理解、复杂指令执行与内容生成。', status: 'Credential 待配置', tone: 'waiting' as const }
]

function selectionIncludes(values: string[], query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return !normalized || values.some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized))
}

function SelectionCatalog({ label, result, empty, onQuery, ...props }: { label: string; placeholder: string; query: string; result: string; empty: string; onQuery: (value: string) => void; children: ReactNode }): React.JSX.Element {
  return <ClientSelectionCatalog searchLabel={label} resultLabel={result} emptyMessage={empty} onQueryChange={onQuery} {...props} />
}

function SelectionOption({ status, tone, ...props }: { title: string; description: string; meta: string; status: string; tone: StatusTone; selected: boolean; leading: ReactNode; onSelect: () => void }): React.JSX.Element {
  return <ClientSelectionOption {...props} status={<StatusLight tone={tone} label={status} />} />
}

function ModelCapabilityPicker({ model, assignedCapabilities, onModel, onCapabilities }: { model: string; assignedCapabilities: string[]; onModel: (value: string) => void; onCapabilities: (value: string[]) => void }): React.JSX.Element {
  const [modelQuery, setModelQuery] = useState('')
  const [capabilityQuery, setCapabilityQuery] = useState('')
  const models = prototypeModelOptions.filter((item) => selectionIncludes([item.id, item.provider, item.description], modelQuery))
  const skillCapabilities = capabilities
    .filter((item) => item.kind === 'skill' && selectionIncludes([item.name, item.summary, item.category, ...item.permissions], capabilityQuery))
    .sort((left, right) => Number(assignedCapabilities.includes(right.name)) - Number(assignedCapabilities.includes(left.name)) || left.name.localeCompare(right.name, 'zh-CN'))

  return <div className="model-capability-selection">
    <section className="selection-config-section"><div className="selection-config-section__heading"><div><h3>运行模型</h3><p>从候选模型中选择一个作为当前员工的主模型。</p></div><span>单选 · 当前 {model}</span></div><SelectionCatalog label="模型搜索结果" placeholder="搜索模型或 Provider" query={modelQuery} result={`${models.length} 个模型`} empty="没有匹配的模型。" onQuery={setModelQuery}>{models.map((item) => <SelectionOption key={item.id} title={item.id} description={item.description} meta={`${item.provider} · 文本模型`} status={item.status} tone={item.tone} selected={model === item.id} leading={<Brain aria-hidden />} onSelect={() => onModel(item.id)} />)}</SelectionCatalog></section>
    <section className="selection-config-section"><div className="selection-config-section__heading"><div><h3>Agent 能力</h3><p>可多选。已选能力优先显示，相关 Tool 与权限会随能力配置派生。</p></div><span>多选 · 已选 {assignedCapabilities.length} 项</span></div><SelectionCatalog label="能力搜索结果" placeholder="搜索能力、说明或权限" query={capabilityQuery} result={`${skillCapabilities.length} / ${capabilities.filter((item) => item.kind === 'skill').length} 项`} empty="没有匹配的能力。" onQuery={setCapabilityQuery}>{skillCapabilities.map((item) => { const selected = assignedCapabilities.includes(item.name); return <SelectionOption key={item.id} title={item.name} description={item.summary} meta={`v${item.version} · ${item.category}`} status={item.status} tone={item.tone} selected={selected} leading={<Sparks aria-hidden />} onSelect={() => onCapabilities(selected ? assignedCapabilities.filter((name) => name !== item.name) : [...assignedCapabilities, item.name])} /> })}</SelectionCatalog></section>
  </div>
}

function ListRow({ onPress, ...props }: { selected?: boolean; avatar?: ReactNode; title: string; subtitle: string; meta?: string; marker?: ReactNode; onPress: () => void }): React.JSX.Element {
  return <ClientListRow {...props} onClick={onPress} />
}

function ProfileSummary({ agent }: { agent: Agent }): React.JSX.Element {
  return <ClientProfileSummary identity={{ ...agent, avatarSrc: agent.avatarUrl }} title={agent.role} description={agent.description} />
}

function ConversationRow({ conversation, selected, onPress, onDelete }: { conversation: Conversation; selected: boolean; onPress: () => void; onDelete: () => void }): React.JSX.Element {
  return (
    <div className="conversation-row">
      <ListRow selected={selected} title={conversation.title} subtitle={conversation.preview} meta={conversation.time} marker={conversation.unread ? <span className="unread-dot" aria-label="未读消息" /> : undefined} onPress={onPress} />
      <IconButton className="conversation-row__delete" label={`删除会话 ${conversation.title}`} icon={Trash} onPress={onDelete} />
    </div>
  )
}

function MessageAttachmentGroup({ attachments, source, embedded = false, onRemove }: { attachments: MessageAttachment[]; source: 'user' | 'agent'; embedded?: boolean; onRemove?: (id: string) => void }): React.JSX.Element | null {
  const [preview, setPreview] = useState<MessageAttachment | null>(null)
  const [fileUrl, setFileUrl] = useState('')
  useEffect(() => {
    if (!preview?.file) return
    const url = URL.createObjectURL(preview.file)
    setFileUrl(url)
    return () => { URL.revokeObjectURL(url) }
  }, [preview])
  if (!attachments.length) return null
  const canOpen = attachments.every((attachment) => attachment.file)
  return <>
    <ClientMessageAttachmentGroup attachments={attachments} source={source} embedded={embedded} onRemove={onRemove} openMode="preview" onOpen={canOpen ? (id) => setPreview(attachments.find((attachment) => attachment.id === id) ?? null) : undefined} />
    {!onRemove && !canOpen && <p className="quiet-meta">示例附件未提供文件，无法打开或下载。</p>}
    <ModalOverlay isOpen={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)} isDismissable className="modal-overlay modal-overlay--nested"><Modal className="app-modal app-modal--medium"><Dialog className="modal-dialog" aria-label="附件预览"><div className="modal-header"><Heading slot="title">{preview?.name}</Heading><IconButton label="关闭" icon={Xmark} onPress={() => setPreview(null)} /></div><div className="modal-content"><p>{preview?.detail}</p>{fileUrl && preview?.file?.type.startsWith('image/') && <img className="attachment-image-preview" src={fileUrl} alt={preview.name} />}{fileUrl && <a className="button button--primary" href={fileUrl} download={preview?.name}>下载文件</a>}</div></Dialog></Modal></ModalOverlay>
  </>
}

function MatterTeamAvatars({ team }: { team: MatterParticipant[] }): React.JSX.Element {
  return <span className="matter-team-avatars" aria-label={`当前临时团队：${team.map((item) => item.name).join('、')}`}>{team.map((item) => <Avatar key={item.name} label={item.name} initials={item.initials} color={item.color} size="small" src={employeeAvatarForName(item.name)} />)}<small>{team.map((item) => item.name).join('、')}</small></span>
}

function MatterEvent({ matter, onOpen, onAnchor }: { matter: ConversationMatter; onOpen: () => void; onAnchor: (element: HTMLButtonElement | null) => void }): React.JSX.Element {
  return <button type="button" ref={onAnchor} className="matter-event message-stream-item" aria-label={`查看事项：${matter.title}`} onClick={onOpen}><span className="matter-event__body"><strong>{matter.title}</strong><span>{matter.description}</span></span><span className="matter-event__meta"><span className={`matter-event__state matter-event__state--${matter.tone}`}><i aria-hidden />{matter.status}</span><span className="matter-event__time"><time>{matter.updatedAt}</time><NavArrowRight aria-hidden /></span></span></button>
}

function AttachmentUploadButton({ onFiles }: { onFiles: (files: File[]) => void }): React.JSX.Element {
  return <label className="attachment-upload-button" title="添加附件"><input type="file" multiple aria-label="添加附件" onChange={(event) => { onFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} /><span className="icon-button" aria-hidden="true"><Plus /></span></label>
}

function DirectoryPane({ page, conversations, onCreateConversation, onDeleteConversation, agentItems, contactKind, onContactKind, selectedGroup, onGroup, selectedConversation, onConversation, selectedAgent, onAgent, onCreateAgent, selectedCapability, onCapability, onOpenDetail, systemSection, onSystemSection }: {
  page: PageId
  conversations: Conversation[]
  onCreateConversation: () => void
  onDeleteConversation: (id: string) => void
  agentItems: Agent[]
  contactKind: ContactKind
  onContactKind: (kind: ContactKind) => void
  selectedGroup: string
  onGroup: (id: string) => void
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
  const [capabilityFilter, setCapabilityFilter] = useState<'skill' | 'tool'>('skill')
  const pageTitle = { messages: '消息', contacts: '通讯录', capabilities: '能力', connections: '连接', system: '系统' }[page]
  const filteredConversations = conversations.filter((item) => selectionIncludes([item.title, item.preview], query))
  const filteredAgents = agentItems.filter((item) => selectionIncludes([item.name, item.role], query))
  const filteredGroups = candidateExpertGroups.filter((item) => `${item.name} ${item.description} ${item.members.map((member) => member.name).join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const filteredCapabilities = capabilities.filter((item) => selectionIncludes([item.name, item.summary], query))
  const visibleCapabilities = filteredCapabilities.filter((item) => item.kind === capabilityFilter)

  useEffect(() => {
    setQuery('')
  }, [page])

  const contextAction = page === 'messages'
    ? <IconButton label="新建会话" icon={Plus} onPress={onCreateConversation} />
    : page === 'contacts' && contactKind === 'experts'
      ? <IconButton label="新建 Agent" icon={Plus} onPress={onCreateAgent} />
      : page === 'capabilities'
        ? <IconButton label="能力目录信息" icon={InfoCircle} onPress={() => onOpenDetail('capability-info')} />
        : undefined

  return (
    <ClientContextPane>
      <SectionHeader title={pageTitle} action={contextAction} />
      {page !== 'system' && page !== 'connections' && <SearchBox placeholder={page === 'messages' ? '搜索会话' : page === 'contacts' ? contactKind === 'experts' ? '搜索专家' : '搜索专家团' : '搜索能力'} value={query} onChange={setQuery} />}
      {page === 'messages' && <>
        <div className="context-scroll">{filteredConversations.length === 0 && <p className="contact-list-empty" role="status">{query.trim() ? '没有匹配的会话' : '暂无会话'}</p>}{filteredConversations.map((item) => <ConversationRow key={item.id} conversation={item} selected={selectedConversation === item.id} onPress={() => onConversation(item.id)} onDelete={() => onDeleteConversation(item.id)} />)}</div>
      </>}
      {page === 'contacts' && <Tabs className="contact-tabs" selectedKey={contactKind} onSelectionChange={(key) => { onContactKind(key as ContactKind); setQuery('') }}>
        <TabList className="filter-row capability-kind-switch" aria-label="通讯录类型">
          <Tab id="experts" className={({ isSelected }) => isSelected ? 'is-active' : ''}>专家</Tab>
          <Tab id="groups" className={({ isSelected }) => isSelected ? 'is-active' : ''}>专家团</Tab>
        </TabList>
        <TabPanel id="experts" className="context-scroll context-scroll--flush">
          {filteredAgents.map((item) => <ListRow key={item.id} selected={selectedAgent === item.id} avatar={<Avatar label={item.name} initials={item.initials} color={item.color} size="small" src={item.avatarUrl ?? employeeAvatarForName(item.name)} />} title={item.name} subtitle={item.role} meta="" marker={<StatusLight tone={item.tone} label={item.status} breathing={item.tone === 'active' || item.tone === 'waiting'} />} onPress={() => onAgent(item.id)} />)}
          {filteredAgents.length === 0 && <p className="contact-list-empty">没有匹配的专家</p>}
        </TabPanel>
        <TabPanel id="groups" className="context-scroll context-scroll--flush">
          {filteredGroups.map((item) => <ListRow key={item.id} selected={selectedGroup === item.id} avatar={<Avatar label={item.name} initials={item.name.slice(0, 1)} color="#c5b8e3" size="small" />} title={item.name} subtitle={`${item.members.length} 位专家`} onPress={() => onGroup(item.id)} />)}
          {filteredGroups.length === 0 && <p className="contact-list-empty">没有匹配的专家团</p>}
        </TabPanel>
      </Tabs>}
      {page === 'capabilities' && <>
        <Tabs className="contact-tabs" selectedKey={capabilityFilter} onSelectionChange={(key) => { const kind = key as 'skill' | 'tool'; setCapabilityFilter(kind); onCapability(capabilities.find((item) => item.kind === kind)?.id ?? selectedCapability) }}>
          <TabList className="filter-row capability-kind-switch" aria-label="能力类型">{([['skill', 'Skills'], ['tool', 'Tools']] as const).map(([id, label]) => <Tab key={id} id={id} className={({ isSelected }) => isSelected ? 'is-active' : ''}>{label}</Tab>)}</TabList>
          {(['skill', 'tool'] as const).map((kind) => <TabPanel key={kind} id={kind} className="context-scroll context-scroll--flush">{visibleCapabilities.length === 0 && <p className="contact-list-empty" role="status">没有匹配的能力</p>}{visibleCapabilities.map((item) => <ListRow key={item.id} selected={selectedCapability === item.id} title={item.name} subtitle={item.category} marker={<StatusLight tone={item.tone} label={item.status} />} onPress={() => onCapability(item.id)} />)}</TabPanel>)}
        </Tabs>
      </>}
      {page === 'connections' && <div className="context-scroll context-scroll--flush"><p className="contact-list-empty">暂无已连接应用</p></div>}
      {page === 'system' && <div className="system-navigation">{systemSections.map((item) => { const Icon = item.icon; return <Button key={item.id} aria-current={systemSection === item.id ? 'page' : undefined} className={systemSection === item.id ? 'is-active' : ''} onPress={() => onSystemSection(item.id)}><Icon aria-hidden /><span>{item.label}</span><NavArrowRight aria-hidden /></Button> })}</div>}
    </ClientContextPane>
  )
}

function MatterSidebar({ matters, collapsed, onLocate }: { matters: ConversationMatter[]; collapsed: boolean; onLocate: (matterId: ConversationMatterId) => void }): React.JSX.Element {
  const orderedMatters = [...matters].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return <aside className={`matter-sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="当前会话事项">
    {!collapsed && <><div className="matter-sidebar__header"><span><strong>事项</strong><small>{matters.length}</small></span></div><div className="matter-sidebar__list">
      {orderedMatters.map((matter) => <button type="button" className="matter-sidebar__item" key={matter.id} aria-label={`定位事项：${matter.title}`} onClick={() => onLocate(matter.id)}><span className={`matter-sidebar__status matter-sidebar__status--${matter.group === 'completed' ? 'succeeded' : matter.group === 'attention' ? 'needs_attention' : 'running'}`} aria-hidden /><span><strong>{matter.title}</strong><small>{matter.status} · {matter.updatedAt}</small></span></button>)}
      {matters.length === 0 && <p className="matter-sidebar__empty">当前会话暂无事项</p>}
    </div></>}
  </aside>
}

function MessagesPage({ conversation, session, onSessionChange, userProfile, matterSidebarCollapsed, onOpenMatter, onOpenDetail }: { conversation: Conversation; session: ConversationSession; onSessionChange: (patch: Partial<ConversationSession>) => void; userProfile: UserProfile; matterSidebarCollapsed: boolean; onOpenMatter: (matterId: ConversationMatterId) => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const matterAnchors = useRef(new Map<ConversationMatterId, HTMLButtonElement>())
  const messageEndRef = useRef<HTMLDivElement>(null)
  const [composerPanel, setComposerPanel] = useState<'model' | 'voice' | null>(null)
  const composerInputRef = useRef<HTMLTextAreaElement>(null)
  const { draft, attachments: draftAttachments, messages: localMessages } = session
  const selectedExpertGroup = candidateExpertGroups.find((group) => group.id === conversation.expertGroupId)
  const hasMatters = conversation.id === 'sea-saas'
  const addAttachments = (files: File[]): void => onSessionChange({ attachments: [...draftAttachments, ...files.map((file) => ({ id: crypto.randomUUID(), name: file.name, detail: fileDetail(file), file }))] })
  const removeAttachment = (id: string): void => onSessionChange({ attachments: draftAttachments.filter((item) => item.id !== id) })
  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!draft.trim() && !draftAttachments.length) return
    onSessionChange({ messages: [...localMessages, { text: draft.trim(), attachments: draftAttachments }], draft: '', attachments: [] })
  }

  useEffect(() => {
    if (!conversation.isNew) return
    const input = composerInputRef.current
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  }, [conversation.id, conversation.isNew])

  useEffect(() => {
    if (localMessages.length) messageEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [localMessages.length])
  const locateMatter = (matterId: ConversationMatterId): void => {
    const target = matterAnchors.current.get(matterId)
    if (!target) return
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
  }
  const anchorMatter = (matterId: ConversationMatterId, element: HTMLButtonElement | null): void => {
    if (element) matterAnchors.current.set(matterId, element)
    else matterAnchors.current.delete(matterId)
  }

  return (
    <div className="workspace-page message-page">
      <div className={`conversation-workspace${matterSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <div className="conversation-column">
      <div className="message-scroll" aria-label="对话">
        <div className="message-canvas">
          {conversation.isNew && localMessages.length === 0 ? <div className="runtime-empty-state"><span className="runtime-empty-state__mark" aria-hidden><Community /></span><h2>{selectedExpertGroup ? `与${selectedExpertGroup.name}一起办事` : '从一段对话开始'}</h2><p>{selectedExpertGroup ? `已选择${selectedExpertGroup.name}。补充要办理的事项、目标和要求后发送给总管。` : '描述你要办理的事项、目标和要求。'}</p></div> : <div className="date-divider"><span>今天</span></div>}
          {!conversation.isNew && !hasMatters && <><ChatMessage source="user" name={userProfile.name.trim() || '本地用户'} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl ?? undefined} time="12:24"><MarkdownMessage>希望产品原型可以展示清晰的场景办理步骤，并在消息时间线回看过程和结果。</MarkdownMessage></ChatMessage><ChatMessage source="agent" name="总管" initials="总" color="#aebd83" avatarSrc={supervisorAvatar} time="12:26"><MarkdownMessage>Web 0.1 通过选择场景、填写表单和点击操作按钮推进。飞书会议场景包含参会人选择、会议创建、内容读取和摘要展示。</MarkdownMessage></ChatMessage></>}
          {hasMatters && <>
          <ChatMessage source="user" name={userProfile.name.trim() || '本地用户'} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl ?? undefined} time="13:40"><MarkdownMessage>整理东南亚 **SaaS 市场进入机会**，重点看六个主要市场、竞争格局和进入风险。最终给我一份能直接评审的报告。</MarkdownMessage><MessageAttachmentGroup attachments={exampleUserAttachments} source="user" /></ChatMessage>
          <ChatMessage source="agent" name="总管" initials="总" color="#aebd83" avatarSrc={supervisorAvatar} time="13:41"><MarkdownMessage>已明确**目标和验收标准**。我会组织网络情报员收集并核验来源，再由文档编写员整理成可评审报告。</MarkdownMessage></ChatMessage>
          <MatterEvent matter={conversationMatters[0]} onOpen={() => onOpenMatter('market-entry')} onAnchor={(element) => anchorMatter('market-entry', element)} />
          <article className="approval-card is-resolved message-stream-item"><div><Key aria-hidden /><p>你已批准网络情报员在当前事项中只读访问 GitHub 公开仓库。</p><IconButton label="查看审批详情" icon={Eye} onPress={() => onOpenDetail('approval-detail')} /></div></article>
          <ChatMessage source="agent" variant="timeline" name="总管" initials="总" color="#aebd83" avatarSrc={supervisorAvatar} time="14:32" status={<StatusLight tone="success" label="已交付" />}><ChatContentBlock variant="delivery" content={{ schemaVersion: 1, title: '东南亚 SaaS 市场进入研究报告', summary: '六个主要市场已覆盖，竞争格局和进入风险均有来源支持。', metrics: [{ label: '完成要求', value: '2/2' }, { label: '来源证据', value: '20' }, { label: '交付文件', value: String(generatedAttachments.length) }] }}><MessageAttachmentGroup attachments={generatedAttachments} source="agent" embedded /><Button className="text-action" onPress={() => onOpenDetail('delivery-evidence')}>查看完整验收记录 <NavArrowRight aria-hidden /></Button></ChatContentBlock></ChatMessage>
          <ChatMessage source="user" name={userProfile.name.trim() || '本地用户'} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl ?? undefined} time="15:05"><MarkdownMessage>基于刚才通过验收的报告，再整理一套**官网发布稿、管理层摘要和视觉方案**。</MarkdownMessage></ChatMessage>
          <ChatMessage source="agent" name="总管" initials="总" color="#aebd83" avatarSrc={supervisorAvatar} time="15:06"><MarkdownMessage>当前展示已选定的发布包示例：由**文档编写员**负责整理，**网络情报员**补充来源核验。</MarkdownMessage></ChatMessage>
          <MatterEvent matter={conversationMatters[1]} onOpen={() => onOpenMatter('publication-pack')} onAnchor={(element) => anchorMatter('publication-pack', element)} />
          <MessageActionCard title="确认发布物料方向" status={session.publicationConfirmed ? '已确认 · 演示' : '待确认 · 演示'} tone={session.publicationConfirmed ? 'success' : 'waiting'} actions={!session.publicationConfirmed && <MessageConfirmationActions cancelLabel="提出修改" confirmLabel="确认方向" onCancel={() => { onSessionChange({ draft: draft || '发布物料修改建议：' }); composerInputRef.current?.focus() }} onConfirm={() => onSessionChange({ publicationConfirmed: true })} />}><p>{session.publicationConfirmed ? '方向已在本次演示中确认，未启动真实制作任务。' : '确认发布物料的视觉方向，或在输入框补充修改建议。'}</p><IconButton label="查看事项详情" icon={Eye} onPress={() => onOpenMatter('publication-pack')} /></MessageActionCard>
          </>}
          {localMessages.map((message, index) => <ChatMessage source="user" name={userProfile.name.trim() || '本地用户'} initials={userProfile.name.trim().slice(0, 1) || '用'} color="#d9c5a6" avatarSrc={userProfile.avatarUrl ?? undefined} time="刚刚" key={`${message.text}-${index}`}><MarkdownMessage>{message.text || '已添加附件'}</MarkdownMessage><MessageAttachmentGroup attachments={message.attachments} source="user" /></ChatMessage>)}
          <div ref={messageEndRef} />
        </div>
      </div>
      <form className="composer" onSubmit={submit}>
        <div className="composer__box">
          {draftAttachments.length > 0 && <div className="composer-attachment-tray"><MessageAttachmentGroup attachments={draftAttachments} source="user" embedded onRemove={removeAttachment} /></div>}
          <textarea ref={composerInputRef} aria-label="发送消息" rows={2} value={draft} onChange={(event) => onSessionChange({ draft: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="发送给总管，补充问题或事项信息" />
          <div className="composer__toolbar">
            <div className="composer__group"><AttachmentUploadButton onFiles={addAttachments} /></div>
            <div className="composer__group"><Button className="composer__control" aria-expanded={composerPanel === 'model'} aria-controls="prototype-composer-model-panel" onPress={() => setComposerPanel((panel) => panel === 'model' ? null : 'model')}><Sparks aria-hidden /><span>deepseek-v4-pro</span><NavArrowDown aria-hidden /></Button><IconButton label="语音输入" icon={Microphone} onPress={() => setComposerPanel((panel) => panel === 'voice' ? null : 'voice')} /><Button type="submit" aria-label="发送" className="composer__send" isDisabled={!draft.trim() && !draftAttachments.length}><ArrowUp aria-hidden /></Button></div>
          </div>
          {composerPanel && <div className={`composer-popover composer-popover--${composerPanel}`} id={`prototype-composer-${composerPanel}-panel`} role="dialog" aria-label={composerPanel === 'model' ? '当前会话模型' : '语音输入说明'}>{composerPanel === 'model' ? <><strong>当前会话模型</strong><div className="composer-popover__options"><button type="button" className="is-active" onClick={() => setComposerPanel(null)}><span><b>deepseek-v4-pro</b><small>原型演示</small></span><Check aria-hidden /></button></div><p>此页面用于演示消息交互，尚未连接模型服务。</p></> : <><strong>语音输入</strong><p>语音输入暂未开放。</p><StatusLight tone="muted" label="暂未开放" /></>}</div>}
        </div>
      </form>
      </div>
      <MatterSidebar matters={hasMatters ? conversationMatters : []} collapsed={matterSidebarCollapsed} onLocate={locateMatter} />
      </div>
    </div>
  )
}

function ContactPage({ agent }: { agent: Agent }): React.JSX.Element {
  const assignedSkills = capabilities.filter((capability) => capability.kind === 'skill' && agent.capabilities.includes(capability.name))
  return (
    <DetailPage className="employee-detail-page">
        <ProfileSummary agent={agent} />
        <ProfileValueTags items={[{ label: '工作状态', accessibleValue: agent.status, value: <StatusLight tone={agent.tone} label={agent.status} breathing={agent.tone === 'active' || agent.tone === 'waiting'} /> }, { label: '加入时间', accessibleValue: agent.joinedAt ?? '2026 年 8 月 14 日', value: agent.joinedAt ?? '2026 年 8 月 14 日' }, { label: '运行模型', accessibleValue: agent.model ?? 'deepseek-v4-pro', value: agent.model ?? 'deepseek-v4-pro' }, { label: '配置版本', accessibleValue: 'v1', value: 'v1' }]} />
        <section className="plain-section"><div className="content-section-title"><h3>能力摘要</h3><span>{assignedSkills.length} 项 Skill</span></div><SummaryCardGrid emptyMessage="尚未绑定 Skill。">{assignedSkills.map((skill) => <SummaryCard key={skill.id} leading={<Sparks aria-hidden />} title={skill.name} description={skill.summary} />)}</SummaryCardGrid></section>
      </DetailPage>
  )
}

function ExpertGroupPage({ group, onEnterConversation }: { group: ExpertGroupSummary; onEnterConversation: (group: ExpertGroupSummary) => void }): React.JSX.Element {
  return <DetailPage className="employee-detail-page">
      <ClientProfileSummary identity={{ name: '专家团 · 原型示例', initials: group.name.slice(0, 1), color: '#c5b8e3' }} title={group.name} description={group.description} actions={<Button className="button button--primary" onPress={() => onEnterConversation(group)}>选择并进入会话</Button>} />
      <section className="plain-section"><div className="content-section-title"><h3>成员与分工</h3><span>{group.members.length} 位专家</span></div><SummaryCardGrid emptyMessage="暂无成员。">{group.members.map((member) => <SummaryCard key={member.id} leading={<Avatar label={member.name} initials={member.name.slice(0, 1)} color="#b8c982" size="small" />} title={member.name} description={member.responsibility} />)}</SummaryCardGrid></section>
    </DetailPage>
}

function CapabilityPage({ capability, onAgent, onOpenDetail }: { capability: Capability; onAgent: (name: string) => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const isSkill = capability.kind === 'skill'
  const MarkIcon = isSkill ? Sparks : Tools
  return (
    <DetailPage>
        <section className="capability-intro"><div className="capability-mark"><MarkIcon aria-hidden /></div><div><span className="capability-category">{capability.category} · v{capability.version}</span><h2>{capability.name}</h2><p>{capability.summary}</p></div></section>
        <section className="plain-section"><h3>{isSkill ? '适用任务' : '可用于'}</h3><div className="use-case-list">{capability.useCases.map((item) => <span key={item}>{item}</span>)}</div></section>
        <section className="plain-section"><h3>{isSkill ? '执行与依赖' : '调用关系'}</h3><div className="dependency-groups">{isSkill ? <><DependencyGroup icon={Brain} title="执行步骤" items={capability.skills} /><DependencyGroup icon={Tools} title="Tools" items={capability.tools} /></> : <><DependencyGroup icon={Sparks} title="关联 Skills" items={capability.skills} /><DependencyGroup icon={Database} title="连接与运行" items={capability.tools} /></>}<DependencyGroup icon={ShieldCheck} title="权限" items={capability.permissions} /></div></section>
        <section className="plain-section"><div className="content-section-title"><h3>已绑定 Agent</h3><span>{capability.agents.length} 位</span></div>{capability.agents.map((name) => <Button className="linked-agent" key={name} onPress={() => onAgent(name)}><Avatar label={name} initials={name.slice(0, 1)} color="#b8c982" size="small" src={employeeAvatarForName(name)} /><span><strong>{name}</strong><small>查看员工资料</small></span><NavArrowRight aria-hidden /></Button>)}</section>
        {isSkill && capability.skillMarkdown && <section className="plain-section skill-document"><div className="content-section-title"><h3>SKILL.md</h3><span>完整文档 · v{capability.version}</span></div><MarkdownContent className="skill-document__markdown">{capability.skillMarkdown}</MarkdownContent></section>}
        <Button className="advanced-disclosure" onPress={() => onOpenDetail('capability-info')}>高级信息 <NavArrowRight aria-hidden /></Button>
      </DetailPage>
  )
}

const connectionCategories = [
  {
    id: 'collaboration',
    name: '协作沟通',
    description: '连接团队消息、组织协同与客户触达渠道。',
    applications: [
      { id: 'feishu', name: '飞书', description: '消息、文档、日历与组织协作。', icon: feishuConnectionIcon },
      { id: 'teams', name: 'Microsoft Teams', description: '团队消息、会议与协作空间。', icon: teamsConnectionIcon },
      { id: 'dingtalk', name: '钉钉', description: '组织通讯、消息、审批与协同办公。', icon: dingtalkConnectionIcon },
      { id: 'wecom', name: '企业微信', description: '企业内部协作与客户连接。', icon: wecomConnectionIcon },
      { id: 'wechat', name: '微信', description: '消息触达与客户沟通渠道。', icon: wechatConnectionIcon }
    ]
  },
  {
    id: 'knowledge',
    name: '知识与文件',
    description: '连接知识库、在线文档与企业文件空间。',
    applications: [
      { id: 'notion', name: 'Notion', description: '知识库、文档与工作流协作。', icon: notionConnectionIcon },
      { id: 'yuque', name: '语雀', description: '团队知识库、文档与结构化知识管理。', icon: yuqueConnectionIcon },
      { id: 'wps', name: 'WPS Office', description: '文档、表格、演示与云端协作。', icon: wpsConnectionIcon },
      { id: 'baidu-netdisk', name: '百度网盘', description: '云端文件存储、同步与共享。', icon: baiduNetdiskConnectionIcon }
    ]
  },
  {
    id: 'development',
    name: '研发与云服务',
    description: '连接代码协作平台与云端基础设施。',
    applications: [
      { id: 'github', name: 'GitHub', description: '代码仓库、Issue、Pull Request 与 CI 协作。', icon: githubConnectionIcon },
      { id: 'gitee', name: 'Gitee', description: '代码托管、协作开发与 DevOps。', icon: giteeConnectionIcon },
      { id: 'alibaba-cloud', name: '阿里云', description: '云计算资源、数据服务与企业基础设施。', icon: alibabaCloudConnectionIcon }
    ]
  }
]

const connectionApplications = connectionCategories.flatMap((category) => category.applications)

function ConnectionsPage(): React.JSX.Element {
  return <DetailPage width="wide" className="connections-page"><section className="recruitment-catalog connections-catalog" aria-label="连接" data-source="static">
    <DetailSummaryPanel icon={<Link aria-hidden />} title="外部系统与应用" description="当前版本静态展示可连接应用目录，所有应用均为默认未连接状态。" metrics={[{ label: '应用总数', value: connectionApplications.length }, { label: '应用类型', value: connectionCategories.length }, { label: '已连接', value: 0 }]} />
    <div className="recruitment-catalog__categories">{connectionCategories.map((category) => <section className="recruitment-category" aria-label={category.name} key={category.id}>
      <DetailSectionHeader title={category.name} description={category.description} meta={`${category.applications.length} 个`} />
      <SummaryCardGrid emptyMessage="暂无已连接应用" label={`${category.name}应用`}>
        {category.applications.map((application) => <div className="recruitment-card connection-card" role="listitem" key={application.id}><SummaryCard leading={<span className="connection-logo" role="img" aria-label={`${application.name} 官方图标`}><img alt="" src={application.icon} /></span>} title={application.name} description={application.description} tone="muted" trailing={<DetailState tone="muted">未连接</DetailState>} /></div>)}
      </SummaryCardGrid>
    </section>)}</div>
  </section></DetailPage>
}

function DependencyGroup({ icon: Icon, title, items }: { icon: IconComponent; title: string; items: string[] }): React.JSX.Element {
  return <div><div className="dependency-groups__title"><Icon aria-hidden /><span>{title}</span></div>{items.map((item) => <p key={item}><Check aria-hidden />{item}</p>)}</div>
}

interface DemoSettings {
  permissionMode: 'balanced' | 'ask'
  budget: number
  poeConfigured: boolean
  verifiedModels: string[]
}

function SystemPage({ demoSettings, onDemoSettings, section, theme, onTheme, userProfile, onUserProfile, supervisorPrompt, onSupervisorPrompt, onOpenDetail }: { demoSettings: DemoSettings; onDemoSettings: (settings: DemoSettings) => void; section: string; theme: ThemeMode; onTheme: (theme: ThemeMode) => void; userProfile: UserProfile; onUserProfile: (profile: UserProfile) => void; supervisorPrompt: string; onSupervisorPrompt: (prompt: string) => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  return (
    <DetailPage className="system-page">
        {section === 'profile' && <ProfileSettings profile={userProfile} onProfile={onUserProfile} />}
        {section === 'general' && <GeneralSettings theme={theme} onTheme={onTheme} />}
        {section === 'supervisor' && <SupervisorSettings prompt={supervisorPrompt} onPrompt={onSupervisorPrompt} />}
        {section === 'models' && <ModelSettings settings={demoSettings} onSettings={onDemoSettings} />}
        {section === 'resources' && <ResourceSettings mode={demoSettings.permissionMode} onMode={(permissionMode) => onDemoSettings({ ...demoSettings, permissionMode })} />}
        {section === 'memory' && <MemorySettings onOpenDetail={onOpenDetail} />}
        {section === 'usage' && <UsageSettings budget={demoSettings.budget} onBudget={(budget) => onDemoSettings({ ...demoSettings, budget })} />}
        {section === 'about' && <AboutSettings onOpenDetail={onOpenDetail} />}
      </DetailPage>
  )
}

function ProfileSettings({ profile, onProfile }: { profile: UserProfile; onProfile: (profile: UserProfile) => void }): React.JSX.Element {
  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]): void => onProfile({ ...profile, [key]: value })
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => update('avatarUrl', typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }
  return <SettingsBlock title="身份"><div className="employee-identity-editor"><div className="employee-avatar-setting"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传个人头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={profile.name || '本地用户'} initials={profile.name.trim().slice(0, 1) || '用'} color="#d7b36a" size="large" src={profile.avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label></div><TextField value={profile.name} onChange={(value) => update('name', value)} className="form-field"><Label>名称</Label><Input maxLength={20} aria-label="个人名称" /></TextField></div></SettingsBlock>
}

function GeneralSettings({ theme, onTheme }: { theme: ThemeMode; onTheme: (theme: ThemeMode) => void }): React.JSX.Element {
  return <><SettingsBlock title="外观" description="主题变化会立即应用到整个原型。"><div className="theme-choice">{([['system', Settings, '跟随系统'], ['light', SunLight, '浅色'], ['dark', HalfMoon, '深色']] as const).map(([id, Icon, label]) => <Button key={id} aria-pressed={theme === id} className={theme === id ? 'is-active' : ''} onPress={() => onTheme(id)}><Icon aria-hidden /><span>{label}</span>{theme === id && <Check aria-hidden />}</Button>)}</div></SettingsBlock><SettingsBlock title="启动" description="以下设置需在 macOS 客户端使用；Web 原型刷新后恢复初始数据。"><SettingRow title="启动时恢复上次会话" description="保留会话选择、滚动位置和未发送草稿"><input type="checkbox" disabled aria-label="启动时恢复上次会话" /></SettingRow><SettingRow title="允许 macOS 通知" description="通知只是提醒，业务记录仍保存在原会话"><input type="checkbox" disabled aria-label="允许 macOS 通知" /></SettingRow></SettingsBlock></>
}

function SupervisorSettings({ prompt, onPrompt }: { prompt: string; onPrompt: (prompt: string) => void }): React.JSX.Element {
  return <SettingsBlock title="系统提示词"><TextField aria-label="总管系统提示词" value={prompt} onChange={onPrompt} className="form-field"><TextArea rows={13} aria-label="总管系统提示词" /></TextField></SettingsBlock>
}

function ModelSettings({ settings, onSettings }: { settings: DemoSettings; onSettings: (settings: DemoSettings) => void }): React.JSX.Element {
  const [credential, setCredential] = useState('')
  const { poeConfigured: configured, verifiedModels } = settings
  const models = [
    { id: 'claude-sonnet-4.6', detail: '文本模型' },
    { id: 'gpt-image-2', detail: '图像模型' },
    { id: 'seedance-2.0', detail: '视频模型' }
  ]
  return <><SettingsBlock title="DeepSeek"><ProviderRow name="deepseek-v4-pro" status="已验证 · 演示" tone="success" detail="文本模型" /></SettingsBlock><SettingsBlock title="Poe"><div className="provider-credential-panel"><TextField value={credential} onChange={setCredential} className="form-field provider-credential-field"><Label>Poe API Key</Label><div className="provider-credential-control"><Input type="password" placeholder={configured ? '输入新 Key 可替换当前连接' : '输入示例 Key（至少 8 位）'} /><Button className="button button--primary" isDisabled={credential.trim().length < 8} onPress={() => { onSettings({ ...settings, poeConfigured: true, verifiedModels: [] }); setCredential('') }}>保存示例连接</Button></div></TextField><p>仅演示配置和验证状态；使用任意 8 位以上示例值，不会连接模型或消耗积分。</p></div>{models.map((model) => <ProviderRow key={model.id} name={model.id} status={verifiedModels.includes(model.id) ? '已验证 · 演示' : configured ? '待验证' : '待配置'} tone={verifiedModels.includes(model.id) ? 'success' : 'waiting'} detail={model.detail} actionLabel="验证" onConfigure={configured ? () => onSettings({ ...settings, verifiedModels: verifiedModels.includes(model.id) ? verifiedModels : [...verifiedModels, model.id] }) : undefined} />)}</SettingsBlock></>
}

function ProviderRow({ name, status, tone, detail, actionLabel = '配置', onConfigure }: { name: string; status: string; tone: StatusTone; detail?: string; actionLabel?: string; onConfigure?: () => void }): React.JSX.Element {
  return <div className="provider-row"><span><strong>{name}</strong>{detail && <small>{detail}</small>}</span><StatusLight tone={tone} label={status} breathing={tone === 'waiting'} />{onConfigure && <Button className="button button--quiet" onPress={onConfigure}>{actionLabel}</Button>}</div>
}

function ResourceSettings({ mode, onMode }: { mode: DemoSettings['permissionMode']; onMode: (mode: DemoSettings['permissionMode']) => void }): React.JSX.Element {
  return <><SettingsBlock title="默认权限" description="本次演示中保留选择；不改变客户端的实际授权。"><div className="permission-choice"><Button aria-pressed={mode === 'balanced'} className={mode === 'balanced' ? 'is-active' : ''} onPress={() => onMode('balanced')}>{mode === 'balanced' && <Check aria-hidden />}<span><strong>平衡</strong><small>读取操作自动执行，其他操作需要确认</small></span></Button><Button aria-pressed={mode === 'ask'} className={mode === 'ask' ? 'is-active' : ''} onPress={() => onMode('ask')}>{mode === 'ask' && <Check aria-hidden />}<span><strong>每次询问</strong><small>所有操作都需要确认</small></span></Button></div></SettingsBlock><SettingsBlock title="资源状态" description="以下为示例状态。"><ProviderRow name="GitHub Repository Search" status="可用" tone="success" /><ProviderRow name="RSS Reader" status="可用" tone="success" /><ProviderRow name="Image Generation" status="不可用" tone="danger" detail="缺少 Poe 连接凭证" /></SettingsBlock></>
}

function MemorySettings({ onOpenDetail }: { onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const rows = [
    { title: '内容输出优先使用简体中文', meta: '全局偏好，来源：用户确认', tone: 'success' as const, status: '有效' },
    { title: '任务交付需要保留来源与验收证据', meta: '全局规则，来源：任务复盘', tone: 'success' as const, status: '有效' },
    { title: '旧版页面结构与当前导航存在冲突', meta: '任务经验，等待用户处理', tone: 'waiting' as const, status: '冲突' }
  ].filter((item) => item.title.includes(query) || item.meta.includes(query))
  return <><SettingsBlock title="本地记忆"><div className="memory-summary"><div><strong>38</strong><span>有效记忆</span></div><div><strong>6</strong><span>等待处理</span></div><div><strong>24.8 MB</strong><span>本地占用</span></div></div><SearchBox placeholder="搜索记忆内容" value={query} onChange={setQuery} /></SettingsBlock><SettingsBlock title="最近记忆"><div className="memory-rows">{rows.length === 0 && <p role="status">没有匹配的记忆</p>}{rows.map((item) => <Button key={item.title} onPress={() => onOpenDetail('memory-governance')}><span><strong>{item.title}</strong><small>{item.meta}</small></span><StatusLight tone={item.tone} label={item.status} breathing={item.tone === 'waiting'} /></Button>)}</div></SettingsBlock><Button className="text-action" onPress={() => onOpenDetail('memory-governance')}>查看和治理全部记忆 <NavArrowRight aria-hidden /></Button></>
}

function UsageSettings({ budget, onBudget }: { budget: number; onBudget: (budget: number) => void }): React.JSX.Element {
  const [draftBudget, setDraftBudget] = useState(String(budget))
  const amount = Number(draftBudget)
  const valid = draftBudget.trim() !== '' && Number.isFinite(amount) && amount >= 0 && amount <= 1000000

  return <><div className="usage-summary"><div><span>本周期用量</span><strong>¥ 86.42</strong><small>示例用量，不代表实际账单</small></div><div><span>预算余额</span><strong>¥ {(budget - 86.42).toFixed(2)}</strong><small>月度预算 ¥ {budget}</small></div></div><SettingsBlock title="用量来源"><div className="usage-rows"><p><span>deepseek-v4-pro</span><strong>4.82M tokens</strong><em>¥ 61.30</em></p><p><span>gpt-image-2</span><strong>12 张图像</strong><em>价格待验证</em></p><p><span>seedance-2.0</span><strong>0 分钟</strong><em>尚未使用</em></p></div></SettingsBlock><SettingsBlock title="预算"><SettingRow title="月度预算" description="本次演示中保留，范围 ¥ 0–1,000,000"><form onSubmit={(event) => { event.preventDefault(); if (valid) onBudget(amount) }}><TextField aria-label="月度预算金额" value={draftBudget} onChange={setDraftBudget} className="form-field" isInvalid={!valid}><Input aria-label="月度预算金额" type="number" min={0} max={1000000} step="0.01" /></TextField>{!valid && <p role="alert">请输入范围内的有效金额。</p>}<Button type="submit" className="button button--quiet" isDisabled={!valid || amount === budget}>保存预算</Button></form></SettingRow></SettingsBlock></>
}

function AboutSettings({ onOpenDetail }: { onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  return <><SettingsBlock title="应用"><SettingRow title="AI Employee OS"><span>0.1.0</span></SettingRow><SettingRow title="本地服务"><StatusLight tone="muted" label="Web 演示 · 未连接" /></SettingRow><SettingRow title="本地数据"><span>示例数据</span></SettingRow></SettingsBlock><SettingsBlock title="诊断" description="本地服务检查与诊断导出需在 macOS 客户端执行。"><SettingRow title="检查本地服务"><Button className="button button--quiet" isDisabled><Refresh aria-hidden />检查</Button></SettingRow><SettingRow title="导出诊断信息" description="不包含连接凭证和记忆正文"><Button className="button button--quiet" isDisabled>导出</Button></SettingRow></SettingsBlock><Button className="advanced-disclosure" onPress={() => onOpenDetail('about-advanced')}>查看高级信息 <NavArrowRight aria-hidden /></Button></>
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
    <div className="modal-layout"><nav className="modal-navigation create-agent-navigation">{steps.map(([id, Icon, label], index) => <Button key={id} aria-current={step === index ? 'step' : undefined} isDisabled={index > step} className={step === index ? 'is-active' : ''} onPress={() => index <= step && setStep(index as 0 | 1 | 2)}><Icon aria-hidden /><span>{label}</span>{index < step && <Check aria-hidden />}</Button>)}</nav>
      <div className="modal-content modal-content--with-footer"><div className="modal-content__main">
        {step === 0 && <div className="form-section"><Heading>基本资料</Heading><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传新员工头像" onChange={(event) => changeAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={name || '新员工'} initials={name.trim().slice(0, 1) || '新'} color="#c5b8e3" size="large" src={avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label></div><TextField value={name} onChange={setName} className="form-field"><Label>名称</Label><Input maxLength={EMPLOYEE_FIELD_LIMITS.name.max} placeholder="例如：用户研究员" /></TextField><TextField value={role} onChange={setRole} className="form-field"><Label>职责</Label><Input maxLength={EMPLOYEE_FIELD_LIMITS.role.max} placeholder="例如：用户访谈与洞察分析" /></TextField><TextField value={description} onChange={setDescription} className="form-field"><Label>职责说明</Label><TextArea rows={4} maxLength={EMPLOYEE_FIELD_LIMITS.description.max} placeholder="说明这个 Agent 负责什么，以及不负责什么。" /></TextField></div>}
        {step === 1 && <div className="form-section"><Heading>提示词</Heading><TextField value={prompt} onChange={setPrompt} className="form-field form-field--prompt"><Label>System Prompt</Label><TextArea rows={14} maxLength={EMPLOYEE_FIELD_LIMITS.systemPrompt.max} placeholder="定义角色、工作方法、输出要求和边界。" /></TextField><div className="prompt-layers"><p><ShieldCheck aria-hidden /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden /><span><strong>运行上下文层</strong><small>任务开始时按最小范围注入</small></span></p></div></div>}
        {step === 2 && <div className="form-section"><Heading>模型与能力</Heading><ModelCapabilityPicker model={model} assignedCapabilities={assignedCapabilities} onModel={setModel} onCapabilities={setAssignedCapabilities} /></div>}
      </div><div className="create-agent-actions"><div><Button className="button button--quiet" onPress={step === 0 ? onClose : () => setStep((step - 1) as 0 | 1)}>{step === 0 ? '取消' : '上一步'}</Button><Button className="button button--primary" isDisabled={!canContinue} onPress={advance}>{step === 2 ? '创建员工' : '继续'}</Button></div></div></div>
    </div>
  </Dialog></Modal></ModalOverlay>
}

function AgentSettingsModal({ agent, isOpen, onClose, onDelete, onSave }: { agent: Agent; isOpen: boolean; onClose: () => void; onDelete: () => void; onSave: (agent: Agent) => void }): React.JSX.Element {
  const [section, setSection] = useState('basic')
  const [memoryScopes, setMemoryScopes] = useState(agent.memoryScopes ?? ['employee', 'task'])
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description)
  const [prompt, setPrompt] = useState(agent.prompt ?? `你是${agent.name}。${agent.description}`)
  const [model, setModel] = useState(agent.model ?? 'deepseek-v4-pro')
  const [assignedCapabilities, setAssignedCapabilities] = useState(agent.capabilities)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(agent.avatarUrl ?? null)
  useEffect(() => { if (!isOpen) return; setSection('basic'); setMemoryScopes(agent.memoryScopes ?? ['employee', 'task']); setName(agent.name); setDescription(agent.description); setPrompt(agent.prompt ?? `你是${agent.name}。${agent.description}`); setModel(agent.model ?? 'deepseek-v4-pro'); setAssignedCapabilities(agent.capabilities); setAvatarUrl(agent.avatarUrl ?? null) }, [agent, isOpen])
  const changeAvatar = (file: File | null): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setAvatarUrl(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }
  const valid = [[name, EMPLOYEE_FIELD_LIMITS.name], [description, EMPLOYEE_FIELD_LIMITS.description], [prompt, EMPLOYEE_FIELD_LIMITS.systemPrompt]] as const
  const canSave = valid.every(([value, limits]) => [...value.trim()].length >= limits.min && [...value.trim()].length <= limits.max) && Boolean(model && assignedCapabilities.length)
  const save = (): void => { if (canSave) onSave({ ...agent, name: name.trim(), initials: name.trim().slice(0, 1), description: description.trim(), prompt: prompt.trim(), model, capabilities: assignedCapabilities, avatarUrl, memoryScopes }) }
  const sections = [['basic', UserIcon, '基本资料'], ['prompt', EditPencil, '提示词'], ['model', Brain, '模型与能力'], ['memory', Database, '记忆']] as const

  return <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay"><Modal className="app-modal app-modal--large"><Dialog className="modal-dialog" aria-label="Agent 设置">
    <div className="modal-header"><div className="modal-identity employee-modal-identity"><Avatar label={name} initials={name.slice(0, 1)} color={agent.color} size="medium" src={avatarUrl} /><strong>{name}</strong><StatusLight tone={agent.tone} label={agent.status} breathing={agent.tone === 'active' || agent.tone === 'waiting'} /></div><div className="modal-header__actions"><IconButton label="删除 Agent" icon={Trash} className="modal-delete-button" onPress={onDelete} /></div><IconButton label="关闭" icon={Xmark} onPress={onClose} /></div>
    <div className="modal-layout"><nav className="modal-navigation">{sections.map(([id, Icon, label]) => <Button key={id} aria-current={section === id ? 'page' : undefined} className={section === id ? 'is-active' : ''} onPress={() => setSection(id)}><Icon aria-hidden /><span>{label}</span></Button>)}</nav>
      <div className="modal-content modal-content--with-footer"><div className="modal-content__main"><AgentFormSection section={section} name={name} description={description} prompt={prompt} model={model} capabilities={assignedCapabilities} avatarUrl={avatarUrl} onAvatar={changeAvatar} onName={setName} onDescription={setDescription} onPrompt={setPrompt} onModel={setModel} onCapabilities={setAssignedCapabilities} memoryScopes={memoryScopes} onMemoryScopes={setMemoryScopes} /></div><div className="create-agent-actions"><div><Button className="button button--quiet" onPress={onClose}>取消</Button><Button className="button button--primary" isDisabled={!canSave} onPress={save}>保存设置</Button></div></div></div>
    </div>
  </Dialog></Modal></ModalOverlay>
}

const UserIcon = Group

function AgentFormSection({ section, name, description, prompt, model, capabilities: assignedCapabilities, avatarUrl, onAvatar, onName, onDescription, onPrompt, onModel, onCapabilities, memoryScopes, onMemoryScopes }: { section: string; name: string; description: string; prompt: string; model: string; capabilities: string[]; avatarUrl: string | null; onAvatar: (file: File | null) => void; onName: (value: string) => void; onDescription: (value: string) => void; onPrompt: (value: string) => void; onModel: (value: string) => void; onCapabilities: (value: string[]) => void; memoryScopes: string[]; onMemoryScopes: (value: string[]) => void }): React.JSX.Element {
  if (section === 'basic') return <div className="form-section"><Heading>基本资料</Heading><div className="avatar-editor"><label className="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="从本地上传头像" onChange={(event) => onAvatar(event.currentTarget.files?.[0] ?? null)} /><Avatar label={name} initials={name.slice(0, 1)} color="#b8c982" size="large" src={avatarUrl} /><span className="avatar-upload__affordance" aria-hidden="true"><EditPencil /></span></label></div><TextField value={name} onChange={onName} className="form-field"><Label>名称</Label><Input maxLength={EMPLOYEE_FIELD_LIMITS.name.max} /></TextField><TextField value={description} onChange={onDescription} className="form-field"><Label>职责说明</Label><TextArea rows={4} maxLength={EMPLOYEE_FIELD_LIMITS.description.max} /></TextField></div>
  if (section === 'prompt') return <div className="form-section"><Heading>提示词</Heading><TextField value={prompt} onChange={onPrompt} className="form-field form-field--prompt"><Label>System Prompt</Label><TextArea rows={13} maxLength={EMPLOYEE_FIELD_LIMITS.systemPrompt.max} /></TextField><div className="prompt-layers"><p><ShieldCheck aria-hidden /><span><strong>平台安全层</strong><small>系统内置，只读</small></span></p><p><Brain aria-hidden /><span><strong>运行上下文层</strong><small>任务启动时按最小范围注入</small></span></p></div></div>
  if (section === 'model') return <div className="form-section"><Heading>模型与能力</Heading><ModelCapabilityPicker model={model} assignedCapabilities={assignedCapabilities} onModel={onModel} onCapabilities={onCapabilities} /><div className="derived-tools"><h3>派生资源</h3><p><Tools aria-hidden />由已绑定 Skill 解析 Tool 与 MCP</p><p><ShieldCheck aria-hidden />运行时仍与任务授权取交集</p></div></div>
  return <div className="form-section"><Heading>记忆</Heading><p>正式运行时仍会与任务 RunGrant 取交集。</p><div className="choice-stack">{[['employee', '员工记忆', '保留该员工的长期工作偏好和经验'], ['task', '任务记忆', '只读取当前任务明确允许的上下文'], ['global', '全局记忆', '读取用户确认的全局偏好与规则']].map(([id, label, description]) => <label key={id}><input type="checkbox" checked={memoryScopes.includes(id)} onChange={(event) => onMemoryScopes(event.target.checked ? [...memoryScopes, id] : memoryScopes.filter((scope) => scope !== id))} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div></div>
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
      {view === 'about-advanced' && <section><div className="content-section-title"><h3>本地诊断</h3><span>只读</span></div><div className="detail-data-list"><DetailDataRow title="客户端版本" description="AI Employee OS macOS Prototype" value="0.1.0" /><DetailDataRow title="Runtime" description="Web 原型未连接本地运行服务" value="未连接" tone="muted" /><DetailDataRow title="数据存储" description="当前页面使用内存中的示例数据" value="演示" tone="muted" /><DetailDataRow title="界面契约" description="复用共享布局、排版与组件；运行时不执行项目检查" value="共享契约" /></div></section>}
      {view === 'runtime-advanced' && <section><div className="content-section-title"><h3>运行快照</h3><span>只读</span></div><div className="detail-data-list"><DetailDataRow title="任务状态" description="目标与验收标准已冻结，当前处于最终审核" value="正在审核" tone="active" /><DetailDataRow title="配置快照" description="2 位 Agent、2 个 Skill、3 个 Tool" value="已冻结" /><DetailDataRow title="授权交集" description="任务授权 ∩ Agent 能力 ∩ Skill 权限" value="有效" tone="success" /><DetailDataRow title="恢复状态" description="最近检查点 14:18，未发现未知副作用" value="可恢复" tone="success" /></div></section>}
    </div>
  </Dialog></Modal></ModalOverlay>
}

function MatterDetailModal({ matter, isOpen, onClose, onOpenDetail }: { matter: ConversationMatter; isOpen: boolean; onClose: () => void; onOpenDetail: (view: DetailView) => void }): React.JSX.Element {
  return <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay"><Modal className="app-modal app-modal--medium"><Dialog className="modal-dialog" aria-label="事项详情"><div className="modal-header"><div><Heading slot="title">{matter.title}</Heading><StatusLight tone={matter.tone} label={matter.status} breathing={matter.group === 'attention' || matter.group === 'active'} /></div><IconButton label="关闭" icon={Xmark} onPress={onClose} /></div><div className="matter-detail-content"><section><h3>当前阶段</h3><p>{matter.description} 当前进度 {matter.progress}，下一步：{matter.nextStep}。</p></section><section><h3>执行时间线</h3><div className="timeline">{matter.timeline.map((item) => <TimelineItem key={item.title} state={item.state} title={item.title} meta={item.meta} />)}</div></section><section><h3>当前临时团队</h3><div className="participant-list">{matter.team.map((item) => <span key={item.name}><Avatar label={item.name} initials={item.initials} color={item.color} size="small" src={employeeAvatarForName(item.name)} />{item.name}</span>)}</div></section><Button className="advanced-disclosure" onPress={() => onOpenDetail('runtime-advanced')}>查看高级 Runtime 信息 <NavArrowRight aria-hidden /></Button></div></Dialog></Modal></ModalOverlay>
}

function TimelineItem({ state, title, meta }: { state: TimelineState; title: string; meta: string }): React.JSX.Element {
  return <div className={`timeline-item timeline-item--${state}`}><span>{state === 'done' ? <Check aria-hidden /> : null}</span><div><strong>{title}</strong><small>{meta}</small></div></div>
}

function DeleteAgentModal({ name, isOpen, onClose, onConfirm }: { name: string; isOpen: boolean; onClose: () => void; onConfirm: () => void }): React.JSX.Element {
  return <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="modal-overlay modal-overlay--nested"><Modal className="app-modal app-modal--small"><Dialog className="modal-dialog confirm-dialog" aria-label="删除 Agent"><span className="danger-icon"><WarningTriangle aria-hidden /></span><Heading slot="title">删除{name}？</Heading><p>将从本次原型演示中删除该员工。历史示例内容保留，刷新页面可恢复初始数据。</p><div className="confirm-actions"><Button className="button button--quiet" onPress={onClose}>取消</Button><Button className="button button--danger" onPress={onConfirm}>确认删除</Button></div></Dialog></Modal></ModalOverlay>
}

export function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('messages')
  const [contextCollapsed, setContextCollapsed] = useState(false)
  const [matterSidebarCollapsed, setMatterSidebarCollapsed] = useState(false)
  const [agentItems, setAgentItems] = useState<Agent[]>(initialAgents)
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [conversationSessions, setConversationSessions] = useState<Record<string, ConversationSession>>({})
  const [feishuSessions, setFeishuSessions] = useFeishuMeetingSessions()
  const [selectedConversation, setSelectedConversation] = useState('feishu-meeting-v01')
  const [selectedAgent, setSelectedAgent] = useState(initialAgents[0].id)
  const [contactKind, setContactKind] = useState<ContactKind>('experts')
  const [selectedGroup, setSelectedGroup] = useState(candidateExpertGroups[0].id)
  const [selectedCapability, setSelectedCapability] = useState('research')
  const [systemSection, setSystemSection] = useState('profile')
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [demoSettings, setDemoSettings] = useState<DemoSettings>({ permissionMode: 'balanced', budget: 500, poeConfigured: false, verifiedModels: [] })
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: 'Kakarrot', avatarUrl: null })
  const [supervisorPrompt, setSupervisorPrompt] = useState('Web 原型 0.1 按用户明确选择的场景和结构化字段推进。缺少或无效的信息在表单中提示；会议场景提交后自动演示预约、通知、会议、妙记转写及专家团交付，无意图识别或追问。所有示例回执和内容均标明演示来源，不代表真实外部操作。')
  const [selectedMatterId, setSelectedMatterId] = useState<ConversationMatterId>('market-entry')
  const [modal, setModal] = useState<ModalState>(null)
  const [detailView, setDetailView] = useState<DetailView>(null)
  const activeAgent = agentItems.find((item) => item.id === selectedAgent) ?? agentItems[0]
  const activeGroup = candidateExpertGroups.find((item) => item.id === selectedGroup) ?? candidateExpertGroups[0]
  const capabilityDefinition = capabilities.find((item) => item.id === selectedCapability) ?? capabilities[0]
  const activeCapability = { ...capabilityDefinition, agents: agentItems.filter((agent) => capabilityDefinition.kind === 'skill' ? agent.capabilities.includes(capabilityDefinition.name) : capabilityDefinition.skills.some((skill) => agent.capabilities.includes(skill))).map((agent) => agent.name) }
  const activeMatter = conversationMatters.find((item) => item.id === selectedMatterId) ?? conversationMatters[0]
  const activeConversation = conversations.find((item) => item.id === selectedConversation) ?? conversations[0]
  const activeSystemSection = systemSections.find((item) => item.id === systemSection) ?? systemSections[0]
  const resolvedTheme = theme === 'system' ? undefined : theme
  const navigate = (id: PageId): void => { setPage(id); setModal(null); setDetailView(null) }
  const createConversation = (group?: ExpertGroupSummary): void => {
    const isFeishu = !group || group.id === meetingExpertGroup.id
    const conversation: Conversation = { id: crypto.randomUUID(), title: isFeishu ? '飞书会议 · v0.1' : `${group!.name}办事`, preview: isFeishu ? '会议专家团：安排会议，调取妙记生成摘要' : `已选择${group!.name}，待补充事项`, time: '刚刚', avatar: group?.name.slice(0, 1) ?? '会', color: '#c5b8e3', expertGroupId: isFeishu ? meetingExpertGroup.id : group?.id, isNew: true, scene: isFeishu ? 'feishu-meeting' : undefined }
    setConversations((items) => [conversation, ...items])
    if (isFeishu) setFeishuSessions((items) => ({ ...items, [conversation.id]: createFeishuMeetingSession() }))
    else setConversationSessions((items) => ({ ...items, [conversation.id]: { draft: `请调用${group!.name}协作处理：`, attachments: [], messages: [] } }))
    setSelectedConversation(conversation.id)
    setContextCollapsed(false)
    navigate('messages')
  }
  const deleteConversation = (id: string): void => {
    const next = conversations.filter((item) => item.id !== id)
    setConversations(next)
    if (selectedConversation === id) setSelectedConversation(next[0]?.id ?? '')
    setConversationSessions((items) => { const remaining = { ...items }; delete remaining[id]; return remaining })
    setFeishuSessions((items) => { const remaining = { ...items }; delete remaining[id]; return remaining })
  }
  const deleteAgent = (): void => {
    const remaining = agentItems.filter((item) => item.id !== selectedAgent)
    setAgentItems(remaining)
    setSelectedAgent(remaining[0]?.id ?? '')
    setModal(null)
  }
  const saveAgent = (agent: Agent): void => {
    setAgentItems((items) => items.map((item) => item.id === agent.id ? agent : item))
    setModal(null)
  }
  const updateFeishuSession = (id: string, session: FeishuMeetingSession): void => {
    setFeishuSessions((items) => ({ ...items, [id]: session }))
  }
  const displayedConversations = conversations.map((item) => {
    const session = feishuSessions[item.id]
    return session ? { ...item, title: session.meeting?.topic ?? item.title, preview: meetingStageStatus[session.stage].title, time: '刚刚' } : item
  })
  const updateConversationSession = (id: string, patch: Partial<ConversationSession>): void => {
    setConversationSessions((items) => ({ ...items, [id]: { ...(items[id] ?? emptyConversationSession), ...patch } }))
    const lastMessage = patch.messages?.at(-1)
    if (lastMessage) setConversations((items) => items.map((item) => item.id === id ? { ...item, preview: `我：${lastMessage.text || '已添加附件'}`, time: '刚刚' } : item))
  }
  const openLinkedAgent = (name: string): void => { const agent = agentItems.find((item) => item.name === name); if (!agent) return; setSelectedAgent(agent.id); setContactKind('experts'); navigate('contacts') }
  const createAgent = (agent: Agent): void => { setAgentItems((items) => [...items, agent]); setSelectedAgent(agent.id); setContactKind('experts'); setModal(null) }
  const toolbarTitle = page === 'messages' ? (activeConversation ? feishuSessions[activeConversation.id]?.meeting?.topic ?? activeConversation.title : '消息') : page === 'contacts' ? contactKind === 'experts' ? activeAgent?.name ?? '通讯录' : activeGroup.name : page === 'capabilities' ? activeCapability.name : page === 'connections' ? '连接' : activeSystemSection.label
  const toolbarSupport = page === 'contacts' && contactKind === 'experts' && activeAgent ? <StatusLight tone={activeAgent.tone} label={activeAgent.status} breathing={activeAgent.tone === 'active' || activeAgent.tone === 'waiting'} /> : page === 'capabilities' ? <StatusLight tone={activeCapability.tone} label={activeCapability.status} /> : undefined
  const toolbarTrailing = page === 'contacts' && contactKind === 'experts' && activeAgent ? <IconButton label="设置" icon={Settings} onPress={() => setModal('agent-settings')} /> : page === 'capabilities' ? <span className="quiet-meta">只读 {activeCapability.kind === 'skill' ? 'Skill' : 'Tool'} 目录</span> : undefined

  useEffect(() => {
    if (resolvedTheme) document.documentElement.dataset.theme = resolvedTheme
    else delete document.documentElement.dataset.theme
    return () => { delete document.documentElement.dataset.theme }
  }, [resolvedTheme])

  return (
    <ClientIconSystem>
      <AppShell contextCollapsed={page === 'messages' && contextCollapsed}
        toolbar={page === 'messages' ? <ClientToolbar title={toolbarTitle} support={activeConversation?.isNew ? <span className="quiet-meta">原型演示</span> : undefined} icon={ChatBubble} navigation={<ClientIconButton label={contextCollapsed ? '展开左侧栏' : '折叠左侧栏'} icon={contextCollapsed ? NavArrowRight : NavArrowLeft} onClick={() => setContextCollapsed((value) => !value)} />} trailing={<ClientIconButton label={matterSidebarCollapsed ? '展开事项边栏' : '折叠事项边栏'} icon={matterSidebarCollapsed ? NavArrowLeft : NavArrowRight} className={`matter-toolbar-toggle${matterSidebarCollapsed ? '' : ' is-active'}`} onClick={() => setMatterSidebarCollapsed((value) => !value)} />} /> : <ClientToolbar title={toolbarTitle} support={toolbarSupport} trailing={toolbarTrailing} />}
        rail={<ClientRail active={page} items={navItems} footerItems={[{ id: 'system', label: '系统', icon: Settings }]} userProfile={userProfile} onNavigate={navigate} onProfile={() => { setSystemSection('profile'); navigate('system') }} />}
        context={<DirectoryPane page={page} conversations={displayedConversations} onCreateConversation={() => createConversation()} onDeleteConversation={deleteConversation} agentItems={agentItems} contactKind={contactKind} onContactKind={setContactKind} selectedGroup={selectedGroup} onGroup={setSelectedGroup} selectedConversation={selectedConversation} onConversation={setSelectedConversation} selectedAgent={selectedAgent} onAgent={setSelectedAgent} onCreateAgent={() => setModal('create-agent')} selectedCapability={selectedCapability} onCapability={setSelectedCapability} onOpenDetail={setDetailView} systemSection={systemSection} onSystemSection={setSystemSection} />}>
            {page === 'messages' && activeConversation && activeConversation.scene !== 'feishu-meeting' && <MessagesPage key={selectedConversation} conversation={activeConversation} session={conversationSessions[selectedConversation] ?? emptyConversationSession} onSessionChange={(patch) => updateConversationSession(selectedConversation, patch)} userProfile={userProfile} matterSidebarCollapsed={matterSidebarCollapsed} onOpenMatter={(matterId) => { setSelectedMatterId(matterId); setModal('matter-detail') }} onOpenDetail={setDetailView} />}
            {page === 'messages' && activeConversation && activeConversation.scene === 'feishu-meeting' && <FeishuMeetingPage key={activeConversation.id} session={feishuSessions[activeConversation.id]} onChange={(session) => updateFeishuSession(activeConversation.id, session)} userProfile={userProfile} sidebarCollapsed={matterSidebarCollapsed} />}
            {page === 'contacts' && (contactKind === 'experts' ? <>{activeAgent ? <ContactPage agent={activeAgent} /> : <div className="conversation-empty-state"><h2>创建一位专家开始</h2><Button className="button button--primary" onPress={() => setModal('create-agent')}>创建专家</Button></div>}</> : <ExpertGroupPage group={activeGroup} onEnterConversation={createConversation} />)}
            {page === 'capabilities' && <CapabilityPage capability={activeCapability} onAgent={openLinkedAgent} onOpenDetail={setDetailView} />}
            {page === 'connections' && <ConnectionsPage />}
            {page === 'system' && <SystemPage demoSettings={demoSettings} onDemoSettings={setDemoSettings} section={systemSection} theme={theme} onTheme={setTheme} userProfile={userProfile} onUserProfile={setUserProfile} supervisorPrompt={supervisorPrompt} onSupervisorPrompt={setSupervisorPrompt} onOpenDetail={setDetailView} />}
            {page === 'messages' && !activeConversation && <div className="conversation-empty-state"><h2>选择或新建会话开始</h2></div>}
      </AppShell>
        <CreateAgentModal isOpen={modal === 'create-agent'} onClose={() => setModal(null)} onCreate={createAgent} />
        {activeAgent && <AgentSettingsModal agent={activeAgent} isOpen={modal === 'agent-settings'} onClose={() => setModal(null)} onDelete={() => setModal('delete-agent')} onSave={saveAgent} />}
        <MatterDetailModal matter={activeMatter} isOpen={modal === 'matter-detail'} onClose={() => setModal(null)} onOpenDetail={setDetailView} />
        <DeleteAgentModal name={activeAgent?.name ?? '员工'} isOpen={modal === 'delete-agent'} onClose={() => setModal('agent-settings')} onConfirm={deleteAgent} />
        <DetailModal view={detailView} capability={activeCapability} onClose={() => setDetailView(null)} />
    </ClientIconSystem>
  )
}
