import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App shell', () => {
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
        getStatus: vi.fn().mockResolvedValue({ state: 'ready', credentialStatus: { deepseek: 'configured', poe: 'missing' }, checkedAt: '2026-08-31T00:00:00Z', models: [{ provider: 'deepseek', modelId: 'deepseek-v4-pro', modality: 'text', verification: 'verified' }] })
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
        downloadModel: vi.fn(), list: vi.fn().mockResolvedValue([]), search: vi.fn().mockResolvedValue([]), update: vi.fn(), disable: vi.fn(), restore: vi.fn(), resolveConflict: vi.fn(), permanentlyDelete: vi.fn(), queue: vi.fn().mockResolvedValue([]), migrateEmbeddings: vi.fn()
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
    fireEvent.click(screen.getByRole('button', { name: /记忆与存储/ }))
    expect(screen.getByRole('heading', { name: '记忆与存储', level: 1 })).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('Runtime 尚未安装（Phase 2）')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /新建任务/ })).not.toBeInTheDocument()
  })

  it('uses the prototype conversation list and creates a real runtime conversation', async () => {
    render(<App />)
    expect(await screen.findByRole('button', { name: /与总管的对话尚无消息/ })).toBeInTheDocument()
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
    expect(await screen.findByRole('dialog', { name: '受控访问说明' })).toHaveTextContent('最小授权')
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
    expect(await screen.findByRole('dialog', { name: '语音输入说明' })).toHaveTextContent('暂未开放')
  })

  it('keeps direct-answer intent metadata out of the conversation timeline', async () => {
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([
      { id: 'message-user', role: 'user', content: 'hello', createdAt: '2026-08-31T09:24:00Z' },
      { id: 'message-agent', role: 'assistant', content: 'Hi there!', createdAt: '2026-08-31T09:24:01Z' }
    ])
    render(<App />)
    expect(await screen.findByText('Hi there!')).toBeInTheDocument()
    expect(screen.queryByText('这段对话尚未形成事项。')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '同意转为事项草稿' })).not.toBeInTheDocument()
  })

  it('uses only the narrow runtime bridge for reconnect', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Runtime 未连接' }))
    await waitFor(() => expect(window.aiEmployeeOS.runtime.reconnect).toHaveBeenCalledOnce())
  })

  it('opens the prototype three-step employee creation modal', async () => {
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
    expect(screen.getByRole('textbox', { name: '职责' })).toBeInTheDocument()
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
  })

  it('projects the same employee identity contract into the directory and detail page', async () => {
    const avatarDataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const version = { schemaVersion: 1 as const, id: 'employee-v1', createdAt: '2026-08-31T00:00:00Z', employeeId: 'employee-1', version: 1, state: 'draft' as const, name: '网络调研员', role: '多源网络调研', description: '形成可追溯的 ResearchBundle。', avatarDataUrl, systemPrompt: '只依据来源工作。', modelId: 'deepseek-v4-pro' as const, capabilityVersionIds: [], memoryScopes: ['employee' as const], testRunIds: [] }
    vi.mocked(window.aiEmployeeOS.employee.list).mockResolvedValue([{ id: 'employee-1', name: version.name, role: version.role, avatarDataUrl, status: 'draft', draftVersionId: version.id }])
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
    const toolbar = screen.getByRole('banner', { name: '窗口拖拽区' })
    expect(within(toolbar).queryByRole('button', { name: '设置' })).not.toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: '发消息' })).not.toBeInTheDocument()
    const settingsButton = screen.getByRole('button', { name: '设置' })
    expect(settingsButton.closest('.profile-intro__actions')).toBeInTheDocument()
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
    expect(settingsDialog.querySelectorAll('.settings-selection-grid')).toHaveLength(1)
    expect(within(settingsDialog).getByText('尚无可绑定能力。')).toBeInTheDocument()
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
      id: 'task-view-1', conversationId: 'local-supervisor', taskId: 'task-1', draftId: 'draft-1', state: 'needs_attention' as const,
      goal: '生成市场研究报告', acceptanceCriteria: ['关键结论可追溯'], employeeVersionIds: ['employee-v1'], draftRevision: 1, frozenRevision: 1, runId: 'run-1',
      assignments: [{ id: 'assignment-1', sequence: 1, employeeVersionId: 'employee-v1', state: 'succeeded' as const, output: 'done' }],
      timeline: [{ phase: 'research', nextNode: 'approval', createdAt: '2026-08-31T08:00:00Z' }],
      delivery: { id: 'delivery-1', acceptanceResults: [{ criterion: '关键结论可追溯', passed: true }], artifacts: [{ id: 'artifact-1', mediaType: 'text/markdown', relativePath: 'report.md', sha256: '1234567890abcdef' }], evidenceCount: 4, unresolvedIssues: [] },
      researchBundles: [], pendingChange: undefined,
      toolActions: [{ id: 'action-1', toolVersionId: 'github.search@v1', state: 'pending' as const, parameters: {}, risk: 'low' as const, approvalId: 'approval-1' }],
      approvals: [{ id: 'approval-1', toolActionId: 'action-1', decision: 'pending' as const }]
    }
    vi.mocked(window.aiEmployeeOS.conversation.history).mockResolvedValue([{ id: 'message-1', role: 'user', content: '请生成报告', createdAt: '2026-08-31T07:59:00Z' }])
    vi.mocked(window.aiEmployeeOS.task.list).mockResolvedValue([task])
    vi.mocked(window.aiEmployeeOS.task.approveTool).mockResolvedValue({ ...task, approvals: [{ ...task.approvals[0], decision: 'approved' as const }] })

    render(<App />)
    expect(await screen.findByRole('tab', { name: /事项/ })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: '生成市场研究报告', level: 3 })).toHaveLength(1)
    expect(document.querySelector('.runtime-matter-card')).not.toBeInTheDocument()
    expect(screen.getByText('已归入事项：生成市场研究报告')).toBeInTheDocument()
    expect(screen.getByText('1 / 1 项验收通过，4 条证据已固化。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    await waitFor(() => expect(window.aiEmployeeOS.task.approveTool).toHaveBeenCalledWith('action-1'))
  })

  it('uses the prototype Skills and Tools directory backed by the Runtime catalog', async () => {
    vi.mocked(window.aiEmployeeOS.resource.list).mockResolvedValue({
      skills: [{ id: 'skill-1', createdAt: '2026-08-31T00:00:00Z', name: '多源调研', description: '保留来源和信息缺口', version: 2, steps: ['拆分查询', '形成证据包'], toolVersionIds: ['tool-1'], available: true }],
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
    fireEvent.click(screen.getByRole('checkbox', { name: '允许 macOS 通知' }))
    expect(screen.getByRole('checkbox', { name: '启动时恢复上次会话' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '允许 macOS 通知' })).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '关于与诊断' }))
    fireEvent.click(screen.getByRole('button', { name: '查看高级信息' }))
    expect(screen.getByRole('dialog', { name: '应用高级信息' })).toHaveTextContent('本地诊断')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    fireEvent.click(screen.getByRole('button', { name: '资源与权限' }))
    fireEvent.click(screen.getByRole('button', { name: '重新检查' }))
    await waitFor(() => expect(window.aiEmployeeOS.resource.probe).toHaveBeenCalledOnce())
  })
})
