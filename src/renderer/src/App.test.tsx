import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryViewModel } from '../../shared/memory-contract'
import { App, buildFriendlyTimeline, identityAwareConversationPreview, selectActiveTask } from './App'

describe('App shell', () => {
  it('shows the latest terminal matter when no matter is still active', () => {
    const completedTasks = [{ id: 'latest-success', state: 'succeeded' }, { id: 'older-failure', state: 'failed' }] as unknown as Parameters<typeof selectActiveTask>[0]
    expect(selectActiveTask(completedTasks)?.id).toBe('latest-success')
    const withActiveTask = [{ id: 'latest-success', state: 'succeeded' }, { id: 'active', state: 'running' }] as unknown as Parameters<typeof selectActiveTask>[0]
    expect(selectActiveTask(withActiveTask)?.id).toBe('active')
  })

  it('projects the current user and supervisor names into conversation previews', () => {
    expect(identityAwareConversationPreview({ id: 'user', title: '会话', preview: '你：旧值', lastMessageRole: 'user', lastMessageContent: '你好', updatedAt: '', messageCount: 1 }, '卡卡罗特', '任务总管')).toBe('卡卡罗特：你好')
    expect(identityAwareConversationPreview({ id: 'assistant', title: '会话', preview: '总管：旧值', lastMessageRole: 'assistant', lastMessageContent: '已完成', updatedAt: '', messageCount: 1 }, '卡卡罗特', '任务总管')).toBe('任务总管：已完成')
  })

  it('turns repeated Runtime checkpoints into concise Chinese progress', () => {
    const task = {
      id: 'task-friendly-timeline', conversationId: 'conversation-1', draftId: 'draft-1', state: 'succeeded', goal: '整理新闻文档', acceptanceCriteria: ['来源可追溯'], employeeVersionIds: ['employee-v1'], directories: [], draftRevision: 1,
      assignments: [{ id: 'assignment-1', sequence: 1, employeeVersionId: 'employee-v1', employeeName: '文档编写员', employeeRole: '本机文档写入', state: 'succeeded' }],
      timeline: [
        { phase: 'created', nextNode: 'employee', createdAt: '2026-09-02T04:47:00Z' },
        { phase: 'memory_loaded', nextNode: 'employee', createdAt: '2026-09-02T04:47:10Z' },
        { phase: 'memory_loaded', nextNode: 'employee', createdAt: '2026-09-02T04:47:20Z' },
        { phase: 'employee_completed', assignmentId: 'assignment-1', nextNode: 'manager', createdAt: '2026-09-02T04:48:00Z' }
      ],
      delivery: { id: 'delivery-1', createdAt: '2026-09-02T04:49:00Z', acceptanceResults: [{ criterion: '来源可追溯', passed: true }], artifacts: [], evidenceCount: 5, unresolvedIssues: [] },
      researchBundles: [], toolActions: [], approvals: []
    } as unknown as Parameters<typeof buildFriendlyTimeline>[0]

    const timeline = buildFriendlyTimeline(task)
    expect(timeline.map((item) => item.title)).toEqual(['任务已创建', '工作资料已准备', '文档编写员已完成', '交付结果已保存'])
    expect(timeline.map((item) => `${item.title}${item.description}`).join('')).not.toMatch(/created|memory_loaded|employee_completed|下一步|employee/)
  })

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    window.localStorage?.clear()
    window.aiEmployeeOS = {
      runtime: {
        getStatus: vi.fn().mockResolvedValue({ state: 'disconnected', checkedAt: '2026-08-31T00:00:00Z', message: 'Runtime 尚未安装（Phase 2）' }),
        reconnect: vi.fn().mockResolvedValue({ state: 'disconnected', checkedAt: '2026-08-31T00:00:01Z', message: 'Runtime 尚未安装（Phase 2）' }),
        onStatusChanged: vi.fn().mockReturnValue(() => undefined)
      },
      provider: {
        getStatus: vi.fn().mockResolvedValue({ state: 'ready', credentialStatus: { deepseek: 'configured', poe: 'missing' }, checkedAt: '2026-08-31T00:00:00Z', models: [{ provider: 'deepseek', modelId: 'deepseek-v4-pro', modality: 'text', verification: 'verified' }] }),
        configurePoe: vi.fn(),
        verifyPoeModel: vi.fn()
      },
      conversation: {
        list: vi.fn().mockResolvedValue([{ id: 'local-supervisor', title: '与总管的对话', preview: '尚无消息', updatedAt: '2026-08-31T00:00:00Z', messageCount: 0 }]),
        create: vi.fn().mockResolvedValue({ id: 'conversation-new', title: '新会话', preview: '尚无消息', updatedAt: '2026-08-31T00:00:00Z', messageCount: 0 }),
        archive: vi.fn().mockResolvedValue({ archived: true, conversationId: 'local-supervisor' }),
        send: vi.fn().mockResolvedValue({ accepted: true, requestId: 'request-1', messageId: 'message-1' }),
        cancel: vi.fn().mockResolvedValue({ accepted: true }),
        history: vi.fn().mockResolvedValue([]),
        onEvent: vi.fn().mockReturnValue(() => undefined)
      },
      supervisor: {
        get: vi.fn().mockResolvedValue({ schemaVersion: 1, id: 'supervisor.local', createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', name: '总管', systemPrompt: '使用简体中文，依据证据组织和验收员工工作。', modelId: 'deepseek-v4-pro', memoryScopes: ['global'] }),
        update: vi.fn().mockImplementation(async (input) => ({ schemaVersion: 1, id: 'supervisor.local', createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:01:00Z', ...input }))
      },
      employee: {
        list: vi.fn().mockResolvedValue([]),
        capabilities: vi.fn().mockResolvedValue([]),
        detail: vi.fn(),
        create: vi.fn(),
        beginEdit: vi.fn(),
        saveDraft: vi.fn(),
        addTestCase: vi.fn(),
        runTest: vi.fn(),
        confirmTest: vi.fn(),
        publish: vi.fn(),
        rollback: vi.fn(),
        setDisabled: vi.fn(),
        archive: vi.fn(),
        restore: vi.fn(),
        deleteDraft: vi.fn(),
        onEvent: vi.fn().mockReturnValue(() => undefined)
      },
      task: {
        list: vi.fn().mockResolvedValue([]),
        outputDirectory: vi.fn().mockResolvedValue('/Users/kakarrot/Downloads'),
        openArtifact: vi.fn().mockResolvedValue({ opened: true }),
        revealArtifact: vi.fn().mockResolvedValue({ revealed: true }),
        createDraft: vi.fn(),
        updateDraft: vi.fn(),
        start: vi.fn(),
        requestChange: vi.fn(),
        acceptChange: vi.fn(),
        rejectChange: vi.fn(),
        approveTool: vi.fn(),
        rejectTool: vi.fn(),
        resolveTool: vi.fn(),
        onEvent: vi.fn().mockReturnValue(() => undefined)
      },
      resource: {
        list: vi.fn().mockResolvedValue({ skills: [], tools: [], mcps: [], healthChecks: [] }),
        probe: vi.fn().mockResolvedValue({ skills: [], tools: [], mcps: [], healthChecks: [] })
      },
      memory: {
        status: vi.fn().mockResolvedValue({ state: 'ready', model: 'BAAI/bge-small-zh-v1.5', dimensions: 512, modelSha256: 'hash', embedding: 'bm25_only', memoryCount: 0, pendingQueueCount: 0, checkedAt: '2026-08-31T00:00:00Z' }),
        downloadModel: vi.fn(), list: vi.fn().mockResolvedValue([]), search: vi.fn().mockResolvedValue([]), update: vi.fn(), disable: vi.fn(), restore: vi.fn(), resolveConflict: vi.fn(), permanentlyDelete: vi.fn(), queue: vi.fn().mockResolvedValue([]), acceptQueueItem: vi.fn(), dismissQueueItem: vi.fn(), migrateEmbeddings: vi.fn()
      },
      usage: {
        summary: vi.fn().mockResolvedValue({ requestCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, amountUsdMicros: null, checkedAt: '2026-08-31T00:00:00Z', models: [] })
      }
    }
  })

  it('navigates across the prototype primary modules without inventing runtime state', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '与总管的对话', level: 1 })).toBeInTheDocument()

    const destinations = [
      { button: /^通讯录$/, heading: 'Agent 员工' },
      { button: /^能力$/, heading: '能力目录' },
      { button: /^系统$/, heading: '个人资料' }
    ]
    for (const destination of destinations) {
      fireEvent.click(screen.getByRole('button', { name: destination.button }))
      expect(screen.getByRole('heading', { name: destination.heading, level: 1 })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: /模型服务/ }))
    expect(screen.getByRole('heading', { name: '模型服务', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('系统设置保存在本机')).not.toBeInTheDocument()
    expect(screen.queryByText('Runtime 已连接')).not.toBeInTheDocument()
    expect(screen.queryByText('Credential 已配置，明文不会回显')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /记忆与存储/ }))
    expect(screen.getByRole('heading', { name: '记忆与存储', level: 1 })).toBeInTheDocument()

    expect(screen.queryByText('Runtime 尚未安装（Phase 2）')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新建任务/ })).not.toBeInTheDocument()
  })

  it('uses one dot for unread messages and does not mark execution status in the conversation list', async () => {
    vi.mocked(window.aiEmployeeOS.conversation.list).mockResolvedValue([
      { id: 'conversation-selected', title: '当前会话', preview: '已读', updatedAt: '2026-09-02T08:00:00Z', messageCount: 0 },
      { id: 'conversation-unread', title: '未读会话', preview: '有三条新消息', updatedAt: '2026-09-02T07:00:00Z', messageCount: 3 },
      { id: 'conversation-attention', title: '待处理会话', preview: '事项执行失败', updatedAt: '2026-09-02T06:00:00Z', messageCount: 0 }
    ])
    vi.mocked(window.aiEmployeeOS.task.list).mockResolvedValue([{ conversationId: 'conversation-attention', state: 'failed' }] as never)

    render(<App />)

    expect(await screen.findByRole('heading', { name: '当前会话', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByLabelText('未读消息')).toHaveLength(1)
    expect(document.querySelectorAll('.unread-dot')).toHaveLength(1)
    expect(document.querySelector('.unread-count')).toBeNull()
    expect(screen.queryByLabelText('待处理')).not.toBeInTheDocument()
  })

  it('keeps every system settings menu populated without large placeholder pages', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '系统' }))

    for (const section of ['个人资料', '通用', '总管', '模型服务', '资源与权限', '记忆与存储', '用量与预算', '关于与诊断']) {
      fireEvent.click(screen.getByRole('button', { name: section }))
      expect(screen.queryByRole('heading', { name: section, level: 2 })).not.toBeInTheDocument()
      expect(document.querySelector('.system-page .settings-block')).not.toBeNull()
      expect(document.querySelector('.system-page .directory-empty')).toBeNull()
    }

    expect(await screen.findByRole('heading', { name: '应用', level: 3 })).toBeInTheDocument()
  })

  it('shows memory management inline with readable labels and without internal task identifiers', async () => {
    const storedMemory: MemoryViewModel = {
      id: 'memory-internal-1',
      scopeType: 'task',
      scopeId: 'task-internal-123',
      category: 'rule',
      version: 3,
      content: '交付前核对来源和完成证据。',
      tags: ['验收'],
      sourceRefs: ['task:task-internal-123'],
      indexVersion: 'bm25-only',
      status: 'active',
      createdAt: '2026-09-02T08:00:00Z',
      updatedAt: '2026-09-02T09:00:00Z'
    }
    const queued = Array.from({ length: 6 }, (_, index) => ({
      id: `queue-internal-${index + 1}`,
      sourceType: index % 2 === 0 ? 'task' as const : 'conversation' as const,
      sourceRef: `task:task-internal-${index + 1}`,
      scopeType: 'task' as const,
      scopeId: `task-internal-${index + 1}`,
      state: 'pending_authorization' as const,
      content: index === 0 ? '任务失败经验：tool_not_available_for_assignment\n候选记忆内容 1' : `候选记忆内容 ${index + 1}`,
      createdAt: `2026-09-02T09:${30 + index}:00Z`
    }))
    vi.mocked(window.aiEmployeeOS.memory.list).mockResolvedValue([storedMemory])
    vi.mocked(window.aiEmployeeOS.memory.queue).mockImplementation(async () => [...queued])
    vi.mocked(window.aiEmployeeOS.memory.acceptQueueItem).mockImplementation(async (id) => { queued.splice(queued.findIndex((item) => item.id === id), 1); return storedMemory })
    vi.mocked(window.aiEmployeeOS.memory.dismissQueueItem).mockImplementation(async (id) => { queued.splice(queued.findIndex((item) => item.id === id), 1); return { dismissed: true, queueId: id } })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '系统' }))
    fireEvent.click(screen.getByRole('button', { name: '记忆与存储' }))

    expect(await screen.findByRole('heading', { name: '待确认的记忆（6）', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /待确认\s*0/ })).not.toBeInTheDocument()
    expect(screen.getByText(/任务执行遇到问题：所需工具未获得授权。候选记忆内容 1/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('tool_not_available_for_assignment')
    expect(screen.queryByText('候选记忆内容 6')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看其余 1 条' }))
    expect(screen.getByText('候选记忆内容 6')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('task-internal-123')
    expect(document.body.textContent).not.toContain('memory-internal-1')

    fireEvent.click(within(screen.getByText(/任务执行遇到问题：所需工具未获得授权/).closest('.setting-row')!).getByRole('button', { name: '记住' }))
    await waitFor(() => expect(window.aiEmployeeOS.memory.acceptQueueItem).toHaveBeenCalledWith('queue-internal-1'))
    fireEvent.click(within(screen.getByText('候选记忆内容 2').closest('.setting-row')!).getByRole('button', { name: '忽略' }))
    await waitFor(() => expect(window.aiEmployeeOS.memory.dismissQueueItem).toHaveBeenCalledWith('queue-internal-2'))
    expect(document.body.textContent).not.toContain('task-internal-1')
    expect(document.body.textContent).not.toContain('queue-internal-1')
  })

  it('configures one Poe connection and verifies the three models independently', async () => {
    const missing = {
      state: 'degraded' as const,
      credentialStatus: { deepseek: 'configured' as const, poe: 'missing' as const },
      checkedAt: '2026-09-02T00:00:00Z',
      models: [
        { provider: 'deepseek' as const, modelId: 'deepseek-v4-pro', modality: 'text' as const, verification: 'verified' as const },
        { provider: 'poe' as const, modelId: 'claude-sonnet-4.6', modality: 'text' as const, verification: 'unverified' as const },
        { provider: 'poe' as const, modelId: 'gpt-image-2', modality: 'image' as const, verification: 'unverified' as const },
        { provider: 'poe' as const, modelId: 'seedance-2.0', modality: 'video' as const, verification: 'unverified' as const }
      ]
    }
    const configured = { ...missing, state: 'ready' as const, credentialStatus: { ...missing.credentialStatus, poe: 'configured' as const } }
    vi.mocked(window.aiEmployeeOS.provider.getStatus).mockResolvedValue(missing)
    vi.mocked(window.aiEmployeeOS.provider.configurePoe).mockResolvedValue(configured)
    vi.mocked(window.aiEmployeeOS.provider.verifyPoeModel).mockResolvedValue({ ...configured, models: configured.models.map((model) => model.modelId === 'gpt-image-2' ? { ...model, verification: 'verified' as const } : model) })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '系统' }))
    fireEvent.click(screen.getByRole('button', { name: '模型服务' }))
    const key = await screen.findByLabelText('Poe API Key')
    expect(screen.getByText('图像模型')).toBeInTheDocument()
    expect(screen.getByText('视频模型')).toBeInTheDocument()
    expect(screen.queryByText(/Responses API|Chat Completions API/)).not.toBeInTheDocument()
    expect(screen.queryByText('Credential 已配置，明文不会回显')).not.toBeInTheDocument()
    fireEvent.change(key, { target: { value: 'poe-valid-test-key' } })
    fireEvent.click(screen.getByRole('button', { name: '保存连接' }))
    await waitFor(() => expect(window.aiEmployeeOS.provider.configurePoe).toHaveBeenCalledWith('poe-valid-test-key'))
    fireEvent.click(screen.getByRole('button', { name: '验证 gpt-image-2' }))
    await waitFor(() => expect(window.aiEmployeeOS.provider.verifyPoeModel).toHaveBeenCalledWith('gpt-image-2'))
  })

  it('edits the Runtime-owned supervisor identity, model, prompt and memory policy', async () => {
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([{ id: 'message-supervisor', role: 'assistant', content: '身份已经更新。', createdAt: '2026-09-02T00:00:00Z' }])
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '系统' }))
    fireEvent.click(screen.getByRole('button', { name: '总管' }))
    expect(screen.queryByRole('heading', { name: '总管', level: 2 })).not.toBeInTheDocument()
    expect(screen.getByLabelText('从本地上传总管头像')).toBeEnabled()
    expect(screen.queryByText('PNG、JPEG 或 WebP')).not.toBeInTheDocument()
    expect(screen.getAllByText('系统提示词')).toHaveLength(1)
    expect(screen.queryByText('System Prompt')).not.toBeInTheDocument()
    expect(screen.queryByText('平台权限与安全规则始终优先。')).not.toBeInTheDocument()
    await screen.findByDisplayValue('使用简体中文，依据证据组织和验收员工工作。')
    expect(screen.getByRole('textbox', { name: '总管名称' })).toHaveAttribute('maxlength', '20')
    expect(screen.getByRole('textbox', { name: '总管系统提示词' })).toHaveAttribute('maxlength', '10000')
    fireEvent.change(screen.getByRole('textbox', { name: '总管名称' }), { target: { value: '任务总管' } })
    expect(screen.getByRole('textbox', { name: '总管名称' })).toHaveValue('任务总管')
    const supervisorAvatar = new File(['supervisor-avatar'], 'supervisor.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('从本地上传总管头像'), { target: { files: [supervisorAvatar] } })
    fireEvent.change(screen.getByRole('textbox', { name: '总管系统提示词' }), { target: { value: '使用简体中文，先检查目标与证据，再组织最少且充分的员工。' } })
    fireEvent.click(screen.getByRole('button', { name: /claude-sonnet-4\.6/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: '读取全局记忆' }))
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
    await waitFor(() => expect(window.aiEmployeeOS.supervisor.update).toHaveBeenCalledWith(expect.objectContaining({ name: '任务总管', avatarDataUrl: expect.stringMatching(/^data:image\/png;base64,/), modelId: 'claude-sonnet-4.6', memoryScopes: [] })), { timeout: 1_500 })
    fireEvent.click(screen.getByRole('button', { name: '消息' }))
    const supervisorMessage = (await screen.findByText('身份已经更新。')).closest('.message-block') as HTMLElement
    expect(within(supervisorMessage).getByText('任务总管')).toBeInTheDocument()
    expect(within(supervisorMessage).getByLabelText('任务总管').querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/))
    expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveAttribute('placeholder', '发送给任务总管，补充问题或事项信息')
  })

  it('uses the prototype conversation list and creates a real runtime conversation', async () => {
    render(<App />)
    const conversationButton = await screen.findByRole('button', { name: /与总管的对话尚无消息/ })
    expect(conversationButton).toBeInTheDocument()
    expect(conversationButton).toHaveClass('list-row--text')
    expect(conversationButton.querySelector('.avatar')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '折叠左侧栏' }))
    expect(document.querySelector('.prototype')).toHaveClass('is-context-collapsed')
    fireEvent.click(screen.getByRole('button', { name: '展开左侧栏' }))
    expect(document.querySelector('.prototype')).not.toHaveClass('is-context-collapsed')
    expect(within(screen.getByRole('banner', { name: '窗口拖拽区' })).getByRole('button', { name: '折叠事项边栏' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '通讯录' }))
    expect(screen.queryByRole('button', { name: /事项边栏/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '消息' }))
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    await waitFor(() => expect(window.aiEmployeeOS.conversation.create).toHaveBeenCalledOnce())
    expect(screen.getByRole('heading', { name: '新会话', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '发送消息' })).toBeInTheDocument()
    expect(screen.getByLabelText('添加附件')).toBeEnabled()
  })

  it('opens the prototype composer micro-interactions without pretending unavailable bridges exist', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '与总管的对话', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('总管会判断是直接回答、归入已有事项，还是创建新事项。')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '受控访问' }))
    expect(await screen.findByRole('dialog', { name: '受控访问说明' })).toHaveTextContent('/Users/kakarrot/Downloads')
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    expect(await screen.findByRole('dialog', { name: '语音输入说明' })).toHaveTextContent('暂未开放')
  })

  it('sends every new request with the fixed system Downloads directory', async () => {
    vi.mocked(window.aiEmployeeOS.runtime.getStatus).mockResolvedValue({ state: 'connected', checkedAt: '2026-09-02T00:00:00Z', message: 'Runtime 已连接' })
    render(<App />)
    const input = await screen.findByRole('textbox', { name: '发送消息' })
    await waitFor(() => expect(window.aiEmployeeOS.task.outputDirectory).toHaveBeenCalled())
    fireEvent.change(input, { target: { value: '整理为文档' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(window.aiEmployeeOS.conversation.send).toHaveBeenCalledWith('local-supervisor', '整理为文档', ['/Users/kakarrot/Downloads']))
  })

  it('projects the personal avatar and name into the conversation timeline without calling the user 你', async () => {
    const values = new Map<string, string>()
    const storage: Storage = {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key) },
      setItem: (key, value) => { values.set(key, value) }
    }
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
    window.localStorage.setItem('ai-employee-os.profile.name', 'KAKARROT')
    window.localStorage.setItem('ai-employee-os.profile.avatarUrl', 'data:image/png;base64,dGVzdA==')
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([
      { id: 'message-user', role: 'user', content: 'hello', createdAt: '2026-08-31T09:24:00Z' },
      { id: 'message-agent', role: 'assistant', content: 'Hi there!', createdAt: '2026-08-31T09:24:01Z' }
    ])
    render(<App />)
    expect(await screen.findByText('Hi there!')).toBeInTheDocument()
    expect((await screen.findByLabelText('总管')).querySelector('img')).toBeInTheDocument()
    const userMessage = (await screen.findByText('hello')).closest('.message-block') as HTMLElement
    expect(within(userMessage).getByText('KAKARROT')).toBeInTheDocument()
    expect(within(userMessage).getByLabelText('KAKARROT').querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,dGVzdA==')
    expect(within(userMessage).queryByText('你')).not.toBeInTheDocument()
    expect(screen.queryByText('这段对话尚未形成事项。')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '同意转为事项草稿' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '系统' }))
    expect(screen.queryByRole('heading', { name: '个人资料', level: 2 })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '身份', level: 3 })).toBeInTheDocument()
    expect(screen.getByLabelText('从本地上传个人头像')).toBeEnabled()
    expect(screen.getByRole('textbox', { name: '个人名称' })).toHaveValue('KAKARROT')
    expect(screen.queryByRole('textbox', { name: '身份说明' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '个人简介' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '个人名称' }), { target: { value: '卡卡罗特' } })
    const personalAvatar = new File(['personal-avatar'], 'personal.png', { type: 'image/png' })
    const personalAvatarInput = screen.getByLabelText('从本地上传个人头像')
    fireEvent.change(personalAvatarInput, { target: { files: [personalAvatar] } })
    await waitFor(() => expect(personalAvatarInput.closest('label')?.querySelector('.avatar img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/)))
    fireEvent.click(screen.getByRole('button', { name: '消息' }))
    const updatedUserMessage = (await screen.findByText('hello')).closest('.message-block') as HTMLElement
    expect(within(updatedUserMessage).getByText('卡卡罗特')).toBeInTheDocument()
    expect(within(updatedUserMessage).getByLabelText('卡卡罗特').querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/))
    expect(within(updatedUserMessage).queryByText('你')).not.toBeInTheDocument()
  })

  it('uses only the narrow runtime bridge for reconnect', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '重新连接' }))
    await waitFor(() => expect(window.aiEmployeeOS.runtime.reconnect).toHaveBeenCalledOnce())
  })

  it('opens the prototype three-step employee creation modal', async () => {
    vi.mocked(window.aiEmployeeOS.employee.capabilities).mockResolvedValue([
      { schemaVersion: 1, id: 'capability-research', createdAt: '2026-09-02T00:00:00Z', name: '网络调研能力', description: '收集、核验并整理公开资料。', version: 1, skillVersionIds: ['skill-research'], toolVersionIds: [], mcpVersionIds: [], requiredModelIds: [], permissionRequirements: ['公开网络读取'], dependencies: [] },
      { schemaVersion: 1, id: 'capability-document', createdAt: '2026-09-02T00:00:00Z', name: '文档交付能力', description: '生成可验收的结构化文档。', version: 1, skillVersionIds: ['skill-document'], toolVersionIds: ['tool-document'], mcpVersionIds: [], requiredModelIds: [], permissionRequirements: ['授权目录写入'], dependencies: [] }
    ])
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '通讯录' }))
    fireEvent.click(await screen.findByRole('button', { name: '新建 Agent 员工' }))
    const navigation = screen.getByRole('navigation', { name: '创建步骤' })
    expect(navigation).toBeInTheDocument()
    for (const step of ['基本资料', '提示词', '模型与能力']) expect(within(navigation).getByRole('button', { name: step })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '新建 Agent 员工' })).toBeInTheDocument()
    expect(screen.getByText('第 1 / 3 步')).toBeInTheDocument()
    expect(screen.getByLabelText('从本地上传新员工头像')).toBeEnabled()
    expect(screen.queryByText('所有字段稍后仍可在员工设置中修改。')).not.toBeInTheDocument()
    expect(screen.queryByText('点击头像从本地选择图片')).not.toBeInTheDocument()
    expect(screen.queryByText('使用清晰的职责名称，不使用系统内部 ID。')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '名称' })).toHaveAttribute('maxlength', '20')
    expect(screen.getByRole('textbox', { name: '职责' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '职责' })).toHaveAttribute('maxlength', '40')
    expect(screen.getByRole('textbox', { name: '职责说明' })).toHaveAttribute('maxlength', '500')
    expect(screen.getByRole('button', { name: '继续' })).toBeDisabled()
    fireEvent.click(within(navigation).getByRole('button', { name: '提示词' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请先完成当前步骤的必填项')
    fireEvent.change(screen.getByRole('textbox', { name: /^名称/ }), { target: { value: '用户研究员' } })
    fireEvent.change(screen.getByRole('textbox', { name: '职责' }), { target: { value: '用户访谈与洞察分析' } })
    fireEvent.change(screen.getByRole('textbox', { name: '职责说明' }), { target: { value: '负责用户访谈，不负责替代业务决策。' } })
    expect(screen.getByRole('button', { name: '继续' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(screen.getByRole('heading', { name: '提示词', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^System Prompt/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^System Prompt/ })).toHaveAttribute('maxlength', '10000')
    fireEvent.change(screen.getByRole('textbox', { name: /^System Prompt/ }), { target: { value: '只使用已授权资料，输出结论时保留来源和信息缺口。' } })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(screen.getByRole('heading', { name: '模型与能力', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索运行模型' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索 Agent 能力' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /deepseek-v4-pro/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /网络调研能力/ }))
    fireEvent.click(screen.getByRole('button', { name: /文档交付能力/ }))
    expect(screen.getByText('多选 · 已选 2 项')).toBeInTheDocument()
  })

  it('projects the same employee identity contract into the directory and detail page', async () => {
    const avatarDataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const version = { schemaVersion: 1 as const, id: 'employee-v1', createdAt: '2026-08-31T00:00:00Z', employeeId: 'employee-1', version: 1, state: 'draft' as const, name: '网络调研员', role: '多源网络调研', description: '形成可追溯的 ResearchBundle。', avatarDataUrl, systemPrompt: '只依据已确认的来源和任务边界工作。', modelId: 'deepseek-v4-pro' as const, capabilityVersionIds: ['capability-research'], memoryScopes: ['employee' as const], testRunIds: [] }
    vi.mocked(window.aiEmployeeOS.employee.list).mockResolvedValue([{ id: 'employee-1', name: version.name, role: version.role, avatarDataUrl, status: 'draft', draftVersionId: version.id, capabilityVersionIds: ['capability-research'], activeCapabilityVersionIds: [] }])
    vi.mocked(window.aiEmployeeOS.employee.capabilities).mockResolvedValue([
      { schemaVersion: 1, id: 'capability-research', createdAt: version.createdAt, name: '网络调研能力', description: '能力聚合说明不应显示在 Skill 卡片中。', version: 1, skillVersionIds: ['skill-research'], toolVersionIds: [], mcpVersionIds: [], requiredModelIds: [], permissionRequirements: ['公开网络读取'], dependencies: [] },
      { schemaVersion: 1, id: 'capability-document', createdAt: version.createdAt, name: '文档交付能力', description: '把已确认资料整理成结构清晰、可验收的文档。', version: 2, skillVersionIds: ['skill-document'], toolVersionIds: ['tool-document'], mcpVersionIds: [], requiredModelIds: [], permissionRequirements: ['授权目录写入'], dependencies: [] }
    ])
    vi.mocked(window.aiEmployeeOS.resource.list).mockResolvedValue({ skills: [{ id: 'skill-research', createdAt: version.createdAt, name: '多源网络调研', description: '从许可来源收集、核验并结构化公开资料。', version: 1, steps: [], toolVersionIds: [], instructionsMarkdown: '# 多源网络调研', instructionDigest: 'digest-1', available: true }], tools: [], mcps: [], healthChecks: [] })
    const detail = { employee: { schemaVersion: 1 as const, id: 'employee-1', createdAt: version.createdAt, name: version.name, draftVersionId: version.id, disabled: false, archived: false }, status: 'draft' as const, draft: version, versions: [version], testCases: [], testRuns: [], formalReferences: [] }
    vi.mocked(window.aiEmployeeOS.employee.detail).mockResolvedValue(detail)
    vi.mocked(window.aiEmployeeOS.employee.beginEdit).mockResolvedValue(detail)
    vi.mocked(window.aiEmployeeOS.employee.saveDraft).mockResolvedValue(detail)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '通讯录' }))
    expect(await screen.findByRole('button', { name: /网络调研员多源网络调研/ })).toBeInTheDocument()
    expect(screen.getAllByLabelText('网络调研员').length).toBeGreaterThan(0)
    expect(await screen.findByRole('heading', { name: '多源网络调研', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('形成可追溯的 ResearchBundle。')).toBeInTheDocument()
    const profileValues = screen.getByRole('list', { name: '基本资料' })
    expect(profileValues).toHaveTextContent('草稿')
    expect(profileValues).toHaveTextContent('deepseek-v4-pro')
    expect(profileValues).not.toHaveTextContent('工作状态')
    const skillCard = await screen.findByRole('article')
    expect(skillCard).toHaveTextContent('多源网络调研')
    expect(skillCard).toHaveTextContent('从许可来源收集、核验并结构化公开资料。')
    expect(skillCard).not.toHaveTextContent('能力聚合说明不应显示在 Skill 卡片中。')
    expect(skillCard.closest('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '最近 3 项交付' })).not.toBeInTheDocument()
    const toolbar = screen.getByRole('banner', { name: '窗口拖拽区' })
    expect(within(toolbar).queryByRole('button', { name: '设置' })).not.toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: '发消息' })).not.toBeInTheDocument()
    const settingsButton = screen.getByRole('button', { name: '设置' })
    expect(settingsButton.closest('.profile-summary__actions')).toBeInTheDocument()
    expect(settingsButton).not.toHaveTextContent('设置')
    expect(screen.queryByRole('button', { name: '发消息' })).not.toBeInTheDocument()
    fireEvent.click(settingsButton)
    const settingsDialog = await screen.findByRole('dialog', { name: '网络调研员' })
    expect(within(settingsDialog).queryByText(/已保存|保存中|未保存/)).not.toBeInTheDocument()
    expect(settingsDialog.querySelector('.employee-modal-identity')).toHaveTextContent('网络调研员草稿')
    expect(within(settingsDialog).getByRole('heading', { name: '员工身份', level: 3 })).toBeInTheDocument()
    expect(settingsDialog.querySelector('.employee-identity-editor')).toBeInTheDocument()
    expect(within(settingsDialog).queryByRole('button', { name: /停用 Agent|启用 Agent/ })).not.toBeInTheDocument()
    expect(within(settingsDialog).queryByRole('button', { name: /归档 Agent|恢复并重新测试/ })).not.toBeInTheDocument()
    const deleteButton = within(settingsDialog).getByRole('button', { name: '删除 Agent' })
    expect(deleteButton.closest('.modal-header__actions')).toBeInTheDocument()
    expect(deleteButton.closest('.modal-navigation')).not.toBeInTheDocument()
    expect(deleteButton).not.toHaveTextContent('删除 Agent')
    fireEvent.click(deleteButton)
    expect(await screen.findByRole('dialog', { name: '删除 网络调研员？' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(within(settingsDialog).getByRole('button', { name: '模型与能力' }))
    expect(within(settingsDialog).getByRole('heading', { name: '运行模型', level: 3 })).toBeInTheDocument()
    expect(within(settingsDialog).getByRole('heading', { name: 'Agent 能力', level: 3 })).toBeInTheDocument()
    expect(within(settingsDialog).getByRole('textbox', { name: '搜索运行模型' })).toBeInTheDocument()
    expect(within(settingsDialog).getByRole('textbox', { name: '搜索 Agent 能力' })).toBeInTheDocument()
    expect(within(settingsDialog).getByRole('button', { name: /deepseek-v4-pro/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(settingsDialog).getByRole('button', { name: /网络调研能力/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(settingsDialog).getByRole('button', { name: /文档交付能力/ })).toHaveAttribute('aria-pressed', 'false')
    expect(within(settingsDialog).getByText('能力聚合说明不应显示在 Skill 卡片中。')).toBeInTheDocument()
    fireEvent.change(within(settingsDialog).getByRole('textbox', { name: '搜索运行模型' }), { target: { value: 'Poe' } })
    expect(within(settingsDialog).queryByRole('button', { name: /deepseek-v4-pro/ })).not.toBeInTheDocument()
    expect(within(settingsDialog).getByRole('button', { name: /claude-sonnet-4.6/ })).toBeInTheDocument()
    fireEvent.change(within(settingsDialog).getByRole('textbox', { name: '搜索 Agent 能力' }), { target: { value: '不存在' } })
    expect(within(settingsDialog).getByText('没有匹配的能力。')).toBeInTheDocument()
    fireEvent.change(within(settingsDialog).getByRole('textbox', { name: '搜索 Agent 能力' }), { target: { value: '' } })
    fireEvent.click(within(settingsDialog).getByRole('button', { name: /文档交付能力/ }))
    await waitFor(() => expect(window.aiEmployeeOS.employee.saveDraft).toHaveBeenCalledWith('employee-1', expect.objectContaining({ capabilityVersionIds: ['capability-research', 'capability-document'] })), { timeout: 1_500 })
    expect(within(settingsDialog).queryByText('尚无可绑定能力。')).not.toBeInTheDocument()
    expect(within(settingsDialog).queryByRole('button', { name: '测试与发布' })).not.toBeInTheDocument()
    for (const heading of ['新建测试用例', '测试记录', '发布状态', '历史版本']) expect(within(settingsDialog).queryByRole('heading', { name: heading, level: 3 })).not.toBeInTheDocument()
    expect(within(settingsDialog).getByText('由总管统一组织，不在员工设置中操作')).toBeInTheDocument()
    fireEvent.click(within(settingsDialog).getByRole('button', { name: '基本资料' }))
    fireEvent.change(screen.getByRole('textbox', { name: '职责' }), { target: { value: '来源核验' } })
    expect(within(settingsDialog).queryByText(/已保存|保存中|未保存/)).not.toBeInTheDocument()
    await waitFor(() => expect(window.aiEmployeeOS.employee.saveDraft).toHaveBeenCalledWith('employee-1', expect.objectContaining({ role: '来源核验' })), { timeout: 1_500 })
  })

  it('renders real matter approval and delivery states and sends the decision through Runtime', async () => {
    const task = {
      id: 'task-view-1', conversationId: 'local-supervisor', createdAt: '2026-08-31T07:59:01Z', sourceMessageIds: ['message-1'], taskId: 'task-1', draftId: 'draft-1', state: 'needs_attention' as const,
      goal: '生成市场研究报告', acceptanceCriteria: ['关键结论可追溯'], employeeVersionIds: ['employee-version.network-intelligence.v2'], directories: [], draftRevision: 1, frozenRevision: 1, runId: 'run-1',
      assignments: [{ id: 'assignment-1', sequence: 1, employeeId: 'employee.network-intelligence', employeeVersionId: 'employee-version.network-intelligence.v2', employeeName: '网络情报员', employeeRole: '公开信息调研', createdAt: '2026-08-31T07:59:02Z', completedAt: '2026-08-31T08:00:00Z', state: 'succeeded' as const, output: '已完成调研并提交报告。' }],
      timeline: [{ phase: 'research', nextNode: 'approval', createdAt: '2026-08-31T08:00:00Z' }],
      delivery: { id: 'delivery-1', summary: '验收通过', result: '已完成调研并提交报告。', createdAt: '2026-08-31T08:00:01Z', acceptanceResults: [{ criterion: '关键结论可追溯', passed: true }], artifacts: [{ id: 'artifact-1', mediaType: 'text/markdown', relativePath: 'report.md', sha256: '1234567890abcdef' }], evidenceCount: 4, unresolvedIssues: [] },
      researchBundles: [], pendingChange: undefined,
      toolActions: [{ id: 'action-1', assignmentId: 'assignment-1', toolVersionId: 'github.search@v1', state: 'pending' as const, parameters: {}, risk: 'low' as const, approvalId: 'approval-1' }],
      approvals: [{ id: 'approval-1', toolActionId: 'action-1', decision: 'pending' as const }]
    }
    const previousTask = {
      ...task,
      id: 'task-view-2', taskId: 'task-2', draftId: 'draft-2', runId: 'run-2', state: 'failed' as const, goal: '复核竞争对手信息', delivery: undefined,
      assignments: [{ ...task.assignments[0], id: 'assignment-2', output: '历史执行未完成。' }],
      timeline: [{ phase: 'failed', createdAt: '2026-08-31T07:58:00Z' }],
      toolActions: [], approvals: []
    }
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([{ id: 'message-1', role: 'user', content: '请生成报告', createdAt: '2026-08-31T07:59:00Z' }])
    vi.mocked(window.aiEmployeeOS.task.list).mockResolvedValue([task, previousTask])
    vi.mocked(window.aiEmployeeOS.task.approveTool).mockResolvedValue({ ...task, approvals: [{ ...task.approvals[0], decision: 'approved' as const }] })

    render(<App />)
    expect(await screen.findByLabelText('当前会话事项')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /事项/ })).not.toBeInTheDocument()
    expect(await screen.findAllByRole('button', { name: /^定位事项：/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^查看事项：/ })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { name: '生成市场研究报告', level: 3 })).toHaveLength(1)
    expect(document.querySelector('.runtime-matter-card')).not.toBeInTheDocument()
    expect(screen.getByText('已创建事项')).toBeInTheDocument()
    const currentMatterCard = screen.getByRole('button', { name: '查看事项：生成市场研究报告' })
    expect(currentMatterCard).toHaveTextContent('生成市场研究报告')
    expect(currentMatterCard).not.toHaveTextContent('目标')
    expect(currentMatterCard).toHaveClass('message-stream-item')
    const failedMatterCard = screen.getByRole('button', { name: '查看事项：复核竞争对手信息' })
    expect(within(failedMatterCard).getByText('执行失败')).toHaveClass('matter-event__state', 'matter-event__state--danger')
    expect(screen.getByText('加入工作')).toBeInTheDocument()
    expect(screen.getAllByText('网络情报员').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已完成调研并提交报告。')).toHaveLength(1)
    const deliveryMessage = screen.getByText('验收通过').closest('.message-block')
    expect(deliveryMessage).toHaveClass('message-block--timeline', 'message-stream-item')
    expect(within(deliveryMessage as HTMLElement).getByText('总管')).toBeInTheDocument()
    expect(within(deliveryMessage as HTMLElement).getByText('已交付')).toBeInTheDocument()
    expect(document.querySelector('.delivery-card')).toBeNull()
    expect(document.querySelector('.message-delivery__eyebrow')).toHaveTextContent('结果')
    expect(screen.getByText('验收通过')).toBeInTheDocument()
    expect(screen.getByLabelText('交付概况')).toHaveTextContent('1/1完成要求4来源证据1交付文件')
    fireEvent.click(screen.getByRole('button', { name: '定位事项：生成市场研究报告' }))
    expect(screen.getByRole('button', { name: '查看事项：生成市场研究报告' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: '查看事项：生成市场研究报告' }))
    expect(screen.getByRole('dialog', { name: '生成市场研究报告' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '打开方式 report.md' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /使用系统默认应用打开/ }))
    fireEvent.click(screen.getByRole('button', { name: '打开方式 report.md' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /打开所在文件夹/ }))
    await waitFor(() => expect(window.aiEmployeeOS.task.openArtifact).toHaveBeenCalledWith('task-view-1', 'artifact-1'))
    expect(window.aiEmployeeOS.task.revealArtifact).toHaveBeenCalledWith('task-view-1', 'artifact-1')
    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    await waitFor(() => expect(window.aiEmployeeOS.task.approveTool).toHaveBeenCalledWith('action-1'))
    fireEvent.click(within(screen.getByRole('banner', { name: '窗口拖拽区' })).getByRole('button', { name: '折叠事项边栏' }))
    expect(screen.getByRole('button', { name: '展开事项边栏' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^定位事项：/ })).not.toBeInTheDocument()
  })

  it('shows joined employees and their live progress replies in the conversation timeline', async () => {
    const task = {
      id: 'task-live', conversationId: 'local-supervisor', createdAt: '2026-09-02T01:00:01Z', sourceMessageIds: ['message-live'], taskId: 'task-live', draftId: 'draft-live', state: 'running' as const,
      goal: '调研学校新闻并整理文档', acceptanceCriteria: ['来源可追溯'], employeeVersionIds: ['employee-network', 'employee-writer'], directories: ['/tmp/reports'], draftRevision: 1, frozenRevision: 1, runId: 'run-live',
      assignments: [
        { id: 'assignment-network', sequence: 1, employeeVersionId: 'employee-network', employeeName: '网络情报员', employeeRole: '多源公开信息调研', createdAt: '2026-09-02T01:00:02Z', completedAt: '2026-09-02T01:05:00Z', state: 'succeeded' as const, output: '已完成多源检索，并将来源交接给文档编写员。' },
        { id: 'assignment-writer', sequence: 2, employeeVersionId: 'employee-writer', employeeName: '文档编写员', employeeRole: '本机文档写入', createdAt: '2026-09-02T01:00:02Z', state: 'running' as const, output: '正在整理 Markdown 结构和来源索引。' }
      ],
      timeline: [{ phase: 'created', nextNode: 'employee', createdAt: '2026-09-02T01:00:02Z' }, { phase: 'employee_completed', assignmentId: 'assignment-network', nextNode: 'employee', createdAt: '2026-09-02T01:05:00Z' }],
      researchBundles: [], toolActions: [], approvals: []
    }
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([{ id: 'message-live', role: 'user', content: '调研学校新闻并整理文档', createdAt: '2026-09-02T01:00:00Z' }])
    vi.mocked(window.aiEmployeeOS.task.list).mockResolvedValue([task])

    render(<App />)
    const workTimeline = await screen.findByLabelText('员工工作时间线')
    expect(workTimeline).toHaveTextContent('网络情报员、文档编写员加入工作')
    expect(workTimeline).toHaveTextContent('已完成多源检索，并将来源交接给文档编写员。')
    expect(workTimeline).toHaveTextContent('正在整理 Markdown 结构和来源索引。')
    expect(workTimeline).toHaveTextContent('正在执行')
    expect(workTimeline).not.toHaveTextContent('本机文档写入 · 正在执行')
  })

  it('starts a legacy draft in the fixed Downloads directory without a picker', async () => {
    const draftTask = {
      id: 'draft-routed', conversationId: 'local-supervisor', draftId: 'draft-routed', state: 'draft' as const,
      goal: '调研学校最新新闻并整理成文档', acceptanceCriteria: ['来源可追溯', '文件可回读'], employeeVersionIds: ['employee-version.network-intelligence.v1', 'employee-version.document-writer.v1'], directories: [], requiresDirectories: true, draftRevision: 1,
      assignments: [], timeline: [], researchBundles: [], toolActions: [], approvals: []
    }
    vi.mocked(window.aiEmployeeOS.runtime.getStatus).mockResolvedValue({ state: 'connected', checkedAt: '2026-09-02T00:00:00Z', message: 'Runtime 已连接' })
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([{ id: 'message-route', role: 'user', content: '调研后整理成文档', createdAt: '2026-09-02T00:00:00Z' }])
    vi.mocked(window.aiEmployeeOS.task.list).mockResolvedValue([draftTask])
    vi.mocked(window.aiEmployeeOS.task.updateDraft).mockResolvedValue({ ...draftTask, directories: ['/Users/kakarrot/Downloads'], draftRevision: 2 })
    vi.mocked(window.aiEmployeeOS.task.start).mockResolvedValue({ ...draftTask, taskId: 'task-routed', state: 'running', directories: ['/Users/kakarrot/Downloads'], draftRevision: 2, frozenRevision: 1, runId: 'run-routed' })

    render(<App />)
    expect(await screen.findByText('该事项尚未绑定固定下载目录。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认并开始' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '选择文件夹' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '使用下载文件夹并开始' }))
    await waitFor(() => expect(window.aiEmployeeOS.task.updateDraft).toHaveBeenCalledWith('draft-routed', expect.objectContaining({ directories: ['/Users/kakarrot/Downloads'] })))
    await waitFor(() => expect(window.aiEmployeeOS.task.start).toHaveBeenCalledWith('draft-routed'))
    expect(screen.queryByRole('button', { name: '确认并开始' })).not.toBeInTheDocument()
  })

  it('does not offer stale Tool approval after a matter has failed', async () => {
    const failedTask = {
      id: 'task-failed', conversationId: 'local-supervisor', taskId: 'task-failed', draftId: 'draft-failed', state: 'failed' as const,
      goal: '调研并生成文档', acceptanceCriteria: ['来源可追溯'], employeeVersionIds: ['employee-version.network-intelligence.v1'], directories: ['/tmp/reports'], draftRevision: 1, frozenRevision: 1, runId: 'run-failed',
      assignments: [{ id: 'assignment-failed', sequence: 1, employeeVersionId: 'employee-version.network-intelligence.v1', state: 'failed' as const }], timeline: [], researchBundles: [],
      toolActions: [{ id: 'action-stale', toolVersionId: 'agent-reach.search@network-intelligence/v1', state: 'pending' as const, parameters: { query: 'x' }, risk: 'low' as const, approvalId: 'approval-stale' }],
      approvals: [{ id: 'approval-stale', toolActionId: 'action-stale', decision: 'pending' as const }]
    }
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([{ id: 'message-failed', role: 'user', content: '调研并生成文档', createdAt: '2026-09-02T00:00:00Z' }])
    vi.mocked(window.aiEmployeeOS.task.list).mockResolvedValue([failedTask])
    vi.mocked(window.aiEmployeeOS.employee.list).mockResolvedValue([
      { id: 'employee-network', name: '网络情报员', status: 'active', activeVersionId: 'employee-version.network-intelligence.v2', capabilityVersionIds: ['capability.network-intelligence.v2'], activeCapabilityVersionIds: ['capability.network-intelligence.v2'] },
      { id: 'employee-writer', name: '文档编写员', status: 'active', activeVersionId: 'employee-version.document-writer.v2', draftVersionId: 'employee-version.document-writer.v3', capabilityVersionIds: [], activeCapabilityVersionIds: ['capability.local-document.v2'] }
    ])
    const recreated = { ...failedTask, id: 'draft-recreated', draftId: 'draft-recreated', taskId: undefined, state: 'draft' as const, frozenRevision: undefined, runId: undefined, assignments: [], toolActions: [], approvals: [], requiresDirectories: true }
    vi.mocked(window.aiEmployeeOS.task.createDraft).mockResolvedValue(recreated)
    vi.mocked(window.aiEmployeeOS.task.start).mockResolvedValue({ ...recreated, taskId: 'task-recreated', state: 'running', frozenRevision: 1, runId: 'run-recreated' })
    render(<App />)
    expect(await screen.findByText('本次执行已失败，原有 Tool 审批已失效，不会继续调用外部工具。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '批准' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新创建事项草稿' }))
    await waitFor(() => expect(window.aiEmployeeOS.task.createDraft).toHaveBeenCalledWith(expect.objectContaining({ directories: ['/Users/kakarrot/Downloads'], authorizationMode: 'full_access', employeeVersionIds: ['employee-version.network-intelligence.v2', 'employee-version.document-writer.v2'] })))
    expect(window.aiEmployeeOS.task.start).toHaveBeenCalledWith('draft-recreated')
  })

  it('uses the prototype Skills and Tools directory backed by the Runtime catalog', async () => {
    vi.mocked(window.aiEmployeeOS.resource.list).mockResolvedValue({
      skills: [{ id: 'skill-1', createdAt: '2026-08-31T00:00:00Z', name: '多源调研', description: '保留来源和信息缺口', version: 2, steps: ['拆分查询', '形成证据包'], toolVersionIds: ['tool-1'], instructionsMarkdown: '# 多源调研\n\n保留来源和信息缺口。', instructionDigest: 'digest-1', available: true }],
      tools: [{ id: 'tool-1', createdAt: '2026-08-31T00:00:00Z', name: '公开检索', description: '只读公开来源', version: 1, sideEffect: 'external_read', risk: 'low', networkOrigins: ['https://example.com'], available: true, health: 'available', credentialStatus: 'not_required' }],
      mcps: [], healthChecks: []
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '能力' }))
    expect((await screen.findAllByRole('heading', { name: '多源调研', level: 1 })).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('heading', { name: 'SKILL.md', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tools' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MCP' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '能力目录信息' }))
    expect(screen.getByRole('dialog', { name: '能力目录信息' })).toHaveTextContent('2 项')
  })

  it('keeps system theme, diagnostics and resource checks interactive', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '系统' }))
    fireEvent.click(screen.getByRole('button', { name: '通用' }))
    fireEvent.click(screen.getByRole('button', { name: '深色' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(screen.getByRole('checkbox', { name: '启动时恢复上次会话' }))
    expect(screen.getByRole('checkbox', { name: '启动时恢复上次会话' })).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: '允许 macOS 通知' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关于与诊断' }))
    expect(screen.getByRole('heading', { name: '诊断', level: 3 })).toBeInTheDocument()
    expect(screen.getByText('能力资源')).toBeInTheDocument()
    expect(screen.queryByText(/Schema v\d+|Cursor \d+/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '资源与权限' }))
    expect(screen.getByRole('heading', { name: '资源概览', level: 3 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '检查' }))
    await waitFor(() => expect(window.aiEmployeeOS.resource.probe).toHaveBeenCalledOnce())
  })

  it('shows aggregated actual usage instead of an empty settings page', async () => {
    vi.mocked(window.aiEmployeeOS.usage!.summary).mockResolvedValue({
      requestCount: 2,
      inputTokens: 200,
      outputTokens: 50,
      totalTokens: 250,
      amountUsdMicros: null,
      checkedAt: '2026-09-02T04:00:00Z',
      models: [{ provider: 'deepseek', modelId: 'deepseek-v4-pro', requestCount: 2, inputTokens: 200, outputTokens: 50, totalTokens: 250 }]
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '系统' }))
    fireEvent.click(screen.getByRole('button', { name: '用量与预算' }))

    expect(await screen.findByText('200')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('250 Token')).toBeInTheDocument()
    expect(screen.getByText('模型服务未提供')).toBeInTheDocument()
    expect(screen.queryByText('Runtime 尚未提供聚合用量接口')).not.toBeInTheDocument()
  })
})
