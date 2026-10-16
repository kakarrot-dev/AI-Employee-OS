import { Book, ChatBubble, EditPencil, NavArrowRight, Compass, Sparks } from 'iconoir-react'
import { Button } from 'react-aria-components'
import './new-conversation.css'

const conversationStarters = [
  { label: '学习辅导', icon: Book, prompt: '我想梳理一门课的学习难点，请先了解我的学习目标和当前进度，再帮我制定复习计划。' },
  { label: '备课办公', icon: EditPencil, prompt: '我想准备一份教学或办公材料，请先问我使用场景、面向对象和具体要求，再一起梳理内容。' },
  { label: '旅行攻略', icon: Compass, prompt: '我想安排一次周末旅行，请先了解我的出发地、时间和预算，再一起规划路线。' },
  { label: '聊聊心事', icon: ChatBubble, prompt: '最近有些事情想找人聊聊，希望你先听我说，陪我梳理一下感受。' }
]

export function NewConversationHeader({ name }: { name: string }): React.JSX.Element {
  return <header className="welcome-heading">
    <div className="welcome-greeting"><span className="welcome-mark" aria-hidden="true"><Sparks /></span><p>你好，{name.trim() || '欢迎回来'}</p></div>
    <h2>今天，想一起做点什么？</h2>
    <p className="welcome-intro">学习、工作、生活，都可以从这里开始。</p>
  </header>
}

export function NewConversationActions({ onPrompt, onFindExpert }: { onPrompt: (prompt: string) => void; onFindExpert: () => void }): React.JSX.Element {
  return <div className="welcome-actions">
    <div className="welcome-starters" role="group" aria-label="快捷提问">{conversationStarters.map(({ label, icon: Icon, prompt }) => <Button key={label} className="welcome-starter" onPress={() => onPrompt(prompt)}><Icon aria-hidden="true" />{label}</Button>)}</div>
    <div className="welcome-experts"><span>想找一位更懂你的专家？</span><Button className="welcome-expert-link" onPress={onFindExpert}>找专家聊天<NavArrowRight aria-hidden="true" /></Button></div>
  </div>
}
