import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App shell', () => {
  beforeEach(() => {
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

  it('navigates across all six modules without inventing runtime state', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument()

    for (const label of ['任务', '团队', '资源', '记忆', '设置']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    }

    await waitFor(() => expect(screen.getByText('Runtime 尚未安装（Phase 2）')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /新建任务/ })).not.toBeInTheDocument()
  })

  it('uses only the narrow runtime bridge for reconnect', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Runtime 未连接' }))
    await waitFor(() => expect(window.aiEmployeeOS.runtime.reconnect).toHaveBeenCalledOnce())
  })

  it('opens the seven-step employee flow with a persistent prompt preview', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /团队/ }))
    fireEvent.click(await screen.findByRole('button', { name: '新建 Agent 员工' }))
    const navigation = screen.getByRole('navigation', { name: '创建步骤' })
    expect(navigation).toBeInTheDocument()
    for (const step of ['基本资料', 'System Prompt', '模型配置', 'Agent 能力', '记忆范围', '测试', '确认']) expect(within(navigation).getByRole('button', { name: new RegExp(step) })).toBeInTheDocument()
    expect(screen.getByText('持续预览')).toBeInTheDocument()
    expect(screen.getByText('平台安全层')).toBeInTheDocument()
  })
})
