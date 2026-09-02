import { useEffect, useMemo, useState } from 'react'
import type { MemoryCategoryView, MemoryHealthView, MemoryQueueItemView, MemoryStatusView, MemoryViewModel } from '../../shared/memory-contract'
import { SettingRow } from './components/client-ui'

type Filter = 'all' | MemoryStatusView | 'queue'

const categoryLabels: Record<MemoryCategoryView, string> = {
  preference: '个人偏好',
  fact: '事实信息',
  rule: '规则要求',
  knowledge: '知识',
  experience: '经验',
  summary: '对话摘要'
}

const scopeLabels: Record<MemoryViewModel['scopeType'], string> = {
  global: '所有场景',
  employee: '指定员工',
  task: '单次任务'
}

const statusLabels: Record<MemoryStatusView, string> = {
  active: '使用中',
  pending_verification: '待确认',
  conflicted: '需处理',
  disabled: '已停用'
}

function formatMemoryTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function sourceLabels(sourceRefs: string[]): string[] {
  const labels = sourceRefs.map((sourceRef) => {
    const sourceType = sourceRef.split(':', 1)[0]
    if (sourceType === 'task') return '任务执行'
    if (sourceType === 'conversation') return '对话内容'
    if (sourceType === 'user') return '用户确认'
    if (sourceType === 'memory') return '已有记忆'
    return '本地记录'
  })
  return [...new Set(labels)]
}

function friendlyQueueContent(content: string | undefined): string {
  if (!content?.trim()) return '重启客户端后显示待确认内容'
  const failureLabels: Record<string, string> = {
    tool_not_available_for_assignment: '所需工具未获得授权',
    invalid_tool_parameters: '工具参数不符合要求',
    provider_failed: '模型服务暂时不可用',
    runtime_timeout: '处理超时'
  }
  const failure = content.match(/^任务失败经验：([a-z0-9_]+)\s*/i)
  let value = failure ? `任务执行遇到问题：${failureLabels[failure[1]] ?? '任务未能完成'}。${content.slice(failure[0].length)}` : content
  value = value.replace(/^目标：/, '任务目标：').replace(/\n结果：/, '；执行结果：')
  return value.replace(/#{1,6}\s*/g, '').replaceAll('**', '').replaceAll('`', '').replace(/\s+/g, ' ').trim()
}

export function MemoryModule({ onSnapshot }: { onSnapshot?: (snapshot: { memories: MemoryViewModel[]; queue: MemoryQueueItemView[] }) => void }): React.JSX.Element {
  const [memories, setMemories] = useState<MemoryViewModel[]>([])
  const [queue, setQueue] = useState<MemoryQueueItemView[]>([])
  const [health, setHealth] = useState<MemoryHealthView>()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string>()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ content: '', category: 'knowledge' as MemoryCategoryView, tags: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyQueueId, setBusyQueueId] = useState<string>()
  const [queueVisibleCount, setQueueVisibleCount] = useState(5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const [items, status, queued] = await Promise.all([window.aiEmployeeOS.memory.list(), window.aiEmployeeOS.memory.status(), window.aiEmployeeOS.memory.queue()])
      setMemories(items)
      setHealth(status)
      setQueue(queued)
      setFilter((current) => queued.length > 0 && current === 'all' ? 'queue' : queued.length === 0 && current === 'queue' ? 'all' : current)
      onSnapshot?.({ memories: items, queue: queued })
      setError(undefined)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load().catch(() => setError('暂时无法读取本地记忆')) }, [])

  const visible = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-CN')
    return memories.filter((memory) => {
      const matchesFilter = filter === 'all' || filter === 'queue' ? true : memory.status === filter
      const matchesQuery = keyword.length === 0 || `${memory.content} ${memory.tags.join(' ')}`.toLocaleLowerCase('zh-CN').includes(keyword)
      return matchesFilter && matchesQuery
    })
  }, [filter, memories, query])

  const selected = memories.find((memory) => memory.id === selectedId)
  const beginEdit = (memory: MemoryViewModel): void => {
    setSelectedId(memory.id)
    setDraft({ content: memory.content, category: memory.category, tags: memory.tags.join('、') })
    setEditing(true)
    setDeleteConfirm(false)
  }
  const save = async (): Promise<void> => {
    if (!selected || !draft.content.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const updated = await window.aiEmployeeOS.memory.update(selected.id, { content: draft.content.trim(), category: draft.category, tags: draft.tags.split(/[、,，]/).map((value) => value.trim()).filter(Boolean) })
      setMemories((items) => items.map((item) => item.id === updated.id ? updated : item))
      setEditing(false)
    } catch {
      setError('记忆修改失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }
  const govern = async (memory: MemoryViewModel, action: 'disable' | 'restore' | 'resolve'): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const updated = action === 'disable' ? await window.aiEmployeeOS.memory.disable(memory.id) : action === 'restore' ? await window.aiEmployeeOS.memory.restore(memory.id) : await window.aiEmployeeOS.memory.resolveConflict(memory.id)
      setMemories((items) => items.map((item) => item.id === updated.id ? updated : item))
      await load()
    } catch {
      setError('操作失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (memory: MemoryViewModel): Promise<void> => {
    if (!deleteConfirm) return
    setBusy(true)
    setError(undefined)
    try {
      await window.aiEmployeeOS.memory.permanentlyDelete(memory.id)
      setMemories((items) => items.filter((item) => item.id !== memory.id))
      setSelectedId(undefined)
      setDeleteConfirm(false)
      await load()
    } catch {
      setError('删除失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }
  const initializeModel = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const status = await window.aiEmployeeOS.memory.downloadModel()
      setHealth(status)
      await window.aiEmployeeOS.memory.migrateEmbeddings()
      await load()
    } catch {
      setError('智能查找启用失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const handleQueueItem = async (item: MemoryQueueItemView, action: 'accept' | 'dismiss'): Promise<void> => {
    setBusyQueueId(item.id)
    setError(undefined)
    try {
      if (action === 'accept') await window.aiEmployeeOS.memory.acceptQueueItem(item.id)
      else await window.aiEmployeeOS.memory.dismissQueueItem(item.id)
      await load()
    } catch {
      setError(action === 'accept' ? '暂时无法记住这条内容，请重试' : '暂时无法忽略这条内容，请重试')
    } finally {
      setBusyQueueId(undefined)
    }
  }

  const filterOptions: Array<[Filter, string, number]> = ([
    ['all', '全部', memories.length],
    ['active', '使用中', memories.filter((memory) => memory.status === 'active').length],
    ['pending_verification', '待确认', memories.filter((memory) => memory.status === 'pending_verification').length],
    ['conflicted', '需处理', memories.filter((memory) => memory.status === 'conflicted').length],
    ['disabled', '已停用', memories.filter((memory) => memory.status === 'disabled').length],
    ['queue', '自动更新', queue.length]
  ] as Array<[Filter, string, number]>).filter(([id, , count]) => id === 'all' ? memories.length > 0 : count > 0)

  return <section className="memory-module memory-module--embedded">
    <SettingRow title="记忆查找" description={loading ? '正在读取' : health?.embedding === 'hybrid' ? '智能查找已启用' : '当前使用基础查找'}>
      {health?.embedding === 'bm25_only' && <button type="button" className="button button--quiet" onClick={() => void initializeModel()} disabled={busy}>{busy ? '启用中' : '启用智能查找'}</button>}
    </SettingRow>
    {memories.length > 0 && filter !== 'queue' && <div className="memory-search"><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索记忆" placeholder="搜索记忆内容或标签" /></div>}
    {filterOptions.length > 1 && <div className="memory-filters">{filterOptions.map(([id, label, count]) => <button type="button" key={id} className={filter === id ? 'active' : ''} onClick={() => { setFilter(id); setSelectedId(undefined); setEditing(false); setDeleteConfirm(false) }}>{label}<span>{count}</span></button>)}</div>}
    {error && <div className="memory-inline-error" role="alert"><span>{error}</span><button type="button" className="button button--quiet" onClick={() => void load().catch(() => setError('暂时无法读取本地记忆'))}>重试</button></div>}
    {filter === 'queue' ? <><div className="memory-queue memory-queue--compact">{queue.length ? queue.slice(0, queueVisibleCount).map((item) => <SettingRow key={item.id} title={friendlyQueueContent(item.content)} description={`${item.sourceType === 'conversation' ? '来自对话' : '来自任务'} · ${formatMemoryTime(item.createdAt)}`}><span className="memory-queue-actions"><button type="button" className="button button--primary" disabled={Boolean(busyQueueId)} onClick={() => void handleQueueItem(item, 'accept')}>{busyQueueId === item.id ? '处理中' : '记住'}</button><button type="button" className="button button--quiet" disabled={Boolean(busyQueueId)} onClick={() => void handleQueueItem(item, 'dismiss')}>忽略</button></span></SettingRow>) : <p className="memory-empty-row">暂无待确认内容</p>}</div>{queue.length > 5 && <button type="button" className="memory-show-more" onClick={() => setQueueVisibleCount((count) => count >= queue.length ? 5 : queue.length)}>{queueVisibleCount >= queue.length ? '收起' : `查看其余 ${queue.length - queueVisibleCount} 条`}</button>}</> : <div className="memory-governance-list">{visible.length ? visible.map((memory) => {
      const expanded = selectedId === memory.id
      return <article className={`memory-governance-item${expanded ? ' is-expanded' : ''}`} key={memory.id}>
        <button type="button" className="memory-governance-summary" aria-expanded={expanded} onClick={() => { setSelectedId(expanded ? undefined : memory.id); setEditing(false); setDeleteConfirm(false) }}>
          <span><strong>{memory.content}</strong><small>{categoryLabels[memory.category]} · {scopeLabels[memory.scopeType]} · {formatMemoryTime(memory.updatedAt)}</small></span>
          <span className={`memory-status is-${memory.status}`}>{statusLabels[memory.status]}</span>
        </button>
        {expanded && <div className="memory-governance-detail">{editing ? <div className="memory-editor">
          <label>内容<textarea value={draft.content} onChange={(event) => setDraft((value) => ({ ...value, content: event.target.value }))} /></label>
          <label>类型<select value={draft.category} onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value as MemoryCategoryView }))}>{Object.entries(categoryLabels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
          <label>标签<input value={draft.tags} onChange={(event) => setDraft((value) => ({ ...value, tags: event.target.value }))} placeholder="多个标签用顿号分隔" /></label>
          <div><button type="button" onClick={() => setEditing(false)}>取消</button><button type="button" className="primary-action" onClick={() => void save()} disabled={busy || !draft.content.trim()}>{busy ? '保存中' : '保存修改'}</button></div>
        </div> : <>
          <div className="memory-readable-meta"><span><small>适用范围</small><strong>{scopeLabels[memory.scopeType]}</strong></span><span><small>来源</small><strong>{sourceLabels(memory.sourceRefs).join('、') || '本地记录'}</strong></span>{memory.tags.length > 0 && <span><small>标签</small><strong>{memory.tags.join('、')}</strong></span>}</div>
          <div className="memory-actions"><button type="button" onClick={() => beginEdit(memory)}>修改</button>{memory.status === 'disabled' ? <button type="button" onClick={() => void govern(memory, 'restore')} disabled={busy}>恢复使用</button> : <button type="button" onClick={() => void govern(memory, 'disable')} disabled={busy}>停用</button>}{memory.status === 'conflicted' && <button type="button" onClick={() => void govern(memory, 'resolve')} disabled={busy}>保留这条</button>}<button type="button" className="danger-action" onClick={() => setDeleteConfirm(true)}>删除</button></div>
          {deleteConfirm && <div className="delete-confirm"><strong>确认删除这条记忆？</strong><p>删除后无法在应用内恢复，系统外的备份不会受到影响。</p><div><button type="button" onClick={() => setDeleteConfirm(false)}>取消</button><button type="button" className="danger-action" onClick={() => void remove(memory)} disabled={busy}>{busy ? '删除中' : '确认删除'}</button></div></div>}
        </>}</div>}
      </article>
    }) : <p className="memory-empty-row">{loading ? '正在读取记忆' : query.trim() ? '没有找到匹配的记忆' : '暂无此类记忆'}</p>}</div>}
  </section>
}
