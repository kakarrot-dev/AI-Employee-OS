import { useState } from 'react'
import { Archive, Trash, Undo } from 'iconoir-react'
import { ClientModal, DetailPage, DetailSectionHeader, IconButton, SearchBox, SummaryListItem } from '../../../src/renderer/src/components/client-ui'

interface ArchivedConversationSummary {
  id: string
  title: string
  preview: string
}

export function ArchivedConversationsPage({ conversations, onRestore, onDelete }: { conversations: ArchivedConversationSummary[]; onRestore: (id: string) => void; onDelete: (id: string) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ArchivedConversationSummary>()
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visible = conversations.filter((item) => `${item.title} ${item.preview}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))

  return <DetailPage className="archived-conversations-page">
    <DetailSectionHeader title="已归档的对话" description="归档的对话不会出现在聊天记录中，恢复后可继续聊天。" meta={`${conversations.length} 条`} />
    <SearchBox label="搜索归档对话" placeholder="搜索对话名称或内容" value={query} onChange={setQuery} />
    {visible.length ? <div className="archived-conversations-list" role="list" aria-label="归档对话列表">{visible.map((item) => <div className="archived-conversation-row" role="listitem" key={item.id}>
      <SummaryListItem title={item.title} subtitle={item.preview} leading={<Archive aria-hidden />} trailing={<div className="archived-conversation-actions"><IconButton label={`恢复对话 ${item.title}`} icon={Undo} onClick={() => onRestore(item.id)} /><IconButton label={`删除对话 ${item.title}`} icon={Trash} className="archived-conversation-delete" onClick={() => setPendingDelete(item)} /></div>} />
    </div>)}</div> : <div className="conversation-empty-state"><h2>{conversations.length ? '没有匹配的归档对话' : '暂无归档对话'}</h2><p>{conversations.length ? '试试其他关键词，或清空搜索查看全部。' : '在聊天记录中将鼠标移到对话上，点击归档图标即可移入这里。'}</p>{normalizedQuery && <button type="button" className="button button--quiet" onClick={() => setQuery('')}>清空搜索</button>}</div>}
    <ClientModal open={Boolean(pendingDelete)} title="删除对话？" size="small" onClose={() => setPendingDelete(undefined)}>
      <div className="modal-content archive-delete-confirmation"><div className="modal-content__main"><p>确定删除“{pendingDelete?.title}”？对话中的消息、附件和草稿将一并删除，此操作无法撤销。</p></div><div className="create-agent-actions"><button type="button" className="button button--quiet" onClick={() => setPendingDelete(undefined)}>取消</button><button type="button" className="button button--danger" onClick={() => { if (pendingDelete) onDelete(pendingDelete.id); setPendingDelete(undefined) }}>确认删除</button></div></div>
    </ClientModal>
  </DetailPage>
}
