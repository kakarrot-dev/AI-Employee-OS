// Audit-only failing acceptance cases. No real Bridge or provider is called.
// Bridge fixture copied from App.test.tsx at the audited working-tree snapshot.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../src/renderer/src/App'
import { ListRow } from '../../../src/renderer/src/components/client-ui'

describe('2026-09-10 prototype parity acceptance gaps', () => {
  afterEach(cleanup)
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
      attachment: {
        select: vi.fn().mockResolvedValue([]),
        importDropped: vi.fn().mockResolvedValue([]),
        open: vi.fn().mockResolvedValue({ opened: true }),
        reveal: vi.fn().mockResolvedValue({ revealed: true })
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
      expertGroup: {
        list: vi.fn().mockResolvedValue([]),
        archive: vi.fn()
      },
      task: {
        list: vi.fn().mockResolvedValue([]),
        outputDirectory: vi.fn().mockResolvedValue('/Users/kakarrot/Downloads'),
        openArtifact: vi.fn().mockResolvedValue({ opened: true }),
        revealArtifact: vi.fn().mockResolvedValue({ revealed: true }),
        createDraft: vi.fn(),
        updateDraft: vi.fn(),
        start: vi.fn(),
        retry: vi.fn(),
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
      },
      connection: {
        sendTeamsConfirmationCards: vi.fn(),
        getTeamsStatus: vi.fn().mockResolvedValue({ provider: 'teams', state: 'not_connected', checkedAt: '', canSearch: false, canCreate: false }),
        connectTeams: vi.fn(), disconnectTeams: vi.fn(),
        getFeishuStatus: vi.fn().mockResolvedValue({ provider: 'feishu', state: 'not_connected', checkedAt: '2026-09-04T00:00:00Z', scopes: [] }),
        openFeishuDeveloperConsole: vi.fn().mockResolvedValue(undefined),
        connectFeishu: vi.fn(),
        cancelFeishuAuthorization: vi.fn().mockResolvedValue({ provider: 'feishu', state: 'not_connected', checkedAt: '2026-09-04T00:00:01Z', scopes: [] }),
        disconnectFeishu: vi.fn()
      }
    }
  })


  function twoConversations(): void {
    vi.mocked(window.aiEmployeeOS.conversation.list).mockResolvedValue([
      { id: 'local-supervisor', title: '审计会话 A', preview: '尚无消息', updatedAt: '2026-09-10T00:00:00Z', messageCount: 0 },
      { id: 'audit-b', title: '审计会话 B', preview: '尚无消息', updatedAt: '2026-09-10T00:00:00Z', messageCount: 0 }
    ])
  }

  it('keeps an unsent draft scoped to its original conversation', async () => {
    twoConversations()
    render(<App />)
    const input = await screen.findByRole('textbox', { name: '发送消息' })
    fireEvent.change(input, { target: { value: '只属于会话 A 的未发送草稿' } })
    fireEvent.click(screen.getByRole('button', { name: /^审计会话 B尚无消息/ }))
    await screen.findByRole('heading', { name: '审计会话 B', level: 1 })
    expect(screen.getByRole('textbox', { name: '发送消息' })).toHaveValue('')
  })

  it('preserves an unsent draft across primary module navigation', async () => {
    render(<App />)
    const input = await screen.findByRole('textbox', { name: '发送消息' })
    fireEvent.change(input, { target: { value: '返回后应该保留的草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '通讯录', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: '消息', exact: true }))
    expect(await screen.findByRole('textbox', { name: '发送消息' })).toHaveValue('返回后应该保留的草稿')
  })

  it('does not project conversation A streaming output into conversation B', async () => {
    twoConversations()
    let listener: Parameters<typeof window.aiEmployeeOS.conversation.onEvent>[0] | undefined
    vi.mocked(window.aiEmployeeOS.runtime.getStatus).mockResolvedValue({ state: 'connected', checkedAt: '2026-09-10T00:00:00Z', message: 'test' })
    vi.mocked(window.aiEmployeeOS.conversation.onEvent).mockImplementation(value => {
      listener = value
      return () => { if (listener === value) listener = undefined }
    })
    render(<App />)
    const input = await screen.findByRole('textbox', { name: '发送消息' })
    fireEvent.change(input, { target: { value: '会话 A 请求' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(window.aiEmployeeOS.conversation.send).toHaveBeenCalledWith('local-supervisor', '会话 A 请求', expect.any(Array), []))
    fireEvent.click(screen.getByRole('button', { name: /^审计会话 B尚无消息/ }))
    await waitFor(() => expect(window.aiEmployeeOS.conversation.history).toHaveBeenCalledWith('audit-b'))
    act(() => listener?.({ type: 'output_delta', requestId: 'request-1', delta: '仅属于会话 A 的流式回复' }))
    // The shared typewriter exposes its full output as an accessible label
    // before all visible characters appear, so check that projection too.
    expect(screen.queryByLabelText('仅属于会话 A 的流式回复')).not.toBeInTheDocument()
    expect(screen.queryByText('仅属于会话 A 的流式回复')).not.toBeInTheDocument()
  })

  it('exposes selected directory row state to assistive technology', () => {
    render(<ListRow title="审计专家" subtitle="待命" selected onClick={() => undefined} />)
    const row = screen.getByRole('button', { name: /审计专家/ })
    expect(row.getAttribute('aria-current') === 'true' || row.getAttribute('aria-pressed') === 'true' || row.getAttribute('aria-selected') === 'true').toBe(true)
  })

  it('switches address-book tabs with the same arrow-key interaction as the prototype', async () => {
    render(<App />)
    await screen.findByRole('textbox', { name: '发送消息' })
    fireEvent.click(screen.getByRole('button', { name: '通讯录', exact: true }))
    const expertTab = screen.getByRole('tab', { name: '专家', exact: true })
    expertTab.focus()
    fireEvent.keyDown(expertTab, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '专家团', exact: true })).toHaveAttribute('aria-selected', 'true')
  })
})
