import { describe, expect, it, vi } from 'vitest'
import { createPreviewBridge } from './preview-bridge'
import { builtInCatalog, previewConversation } from './fixtures'

describe('Web preview bridge', () => {
  it('uses the complete built-in catalog and returns isolated data', async () => {
    const bridge = createPreviewBridge()
    expect(await bridge.employee.list()).toHaveLength(5)
    expect(await bridge.employee.capabilities()).toEqual(builtInCatalog.capabilities)
    expect(await bridge.resource.list()).toEqual(builtInCatalog.resources)
    const employees = await bridge.employee.list()
    const detail = await bridge.employee.detail(employees[0].id)
    detail.employee.name = 'mutated'
    expect((await bridge.employee.detail(employees[0].id)).employee.name).not.toBe('mutated')
    const resources = await bridge.resource.list()
    resources.skills.length = 0
    expect((await bridge.resource.list()).skills.length).toBeGreaterThan(0)
  })
  it('validates drafts and supports create, edit, disable, restore and constrained deletion', async () => {
    const bridge = createPreviewBridge()
    const input = { name: '测试专家', role: '文档分析', description: '分析用户提供的材料并整理结构化结果。', systemPrompt: '依据用户提供的材料整理分析结果。', modelId: 'deepseek-v4-pro' as const, capabilityVersionIds: [], memoryScopes: [] }
    await expect(bridge.employee.create({ ...input, name: '' })).rejects.toThrow('invalid_employee_name')
    const detail = await bridge.employee.create(input)
    const employeeId = detail.employee.id
    expect((await bridge.employee.saveDraft(employeeId, { ...input, name: '编辑专家' })).draft?.name).toBe('编辑专家')
    expect((await bridge.employee.setDisabled(employeeId, true)).status).toBe('disabled')
    expect((await bridge.employee.archive(employeeId)).status).toBe('archived')
    expect((await bridge.employee.restore(employeeId)).status).toBe('disabled')
    await bridge.employee.deleteDraft(employeeId)
    await expect(bridge.employee.detail(employeeId)).rejects.toThrow('employee_not_found')
    await expect(bridge.employee.deleteDraft('employee.document-writer')).rejects.toThrow('employee_has_history')
    expect((await createPreviewBridge().employee.list())).toHaveLength(5)
  })
  it('persists preview messages within the page and cancels pending replies without emitting later', async () => {
    vi.useFakeTimers()
    try {
      const bridge = createPreviewBridge(), listener = vi.fn()
      const unsubscribe = bridge.conversation.onEvent(listener)
      const conversation = await bridge.conversation.create()
      const sent = await bridge.conversation.send(conversation.id, '你好')
      await bridge.conversation.cancel(sent.requestId)
      await vi.runAllTimersAsync()
      expect(listener).toHaveBeenCalledExactlyOnceWith({ type: 'completed', requestId: sent.requestId })
      expect(await bridge.conversation.history(conversation.id)).toHaveLength(1)
      await bridge.conversation.send(conversation.id, '查看演示')
      await vi.runAllTimersAsync()
      expect((await bridge.conversation.history(conversation.id)).at(-1)?.content).toContain('未调用模型')
      unsubscribe(); listener.mockClear()
      await bridge.conversation.send(conversation.id, '不再订阅')
      await vi.runAllTimersAsync()
      expect(listener).not.toHaveBeenCalled()
      await bridge.conversation.archive(previewConversation.id)
      expect(await bridge.task.list()).toEqual([])
    } finally { vi.useRealTimers() }
  })
  it('never simulates real credentials, publishing, external writes or successful model execution', async () => {
    const bridge = createPreviewBridge()
    expect((await bridge.provider.getStatus()).credentialStatus).toEqual({ deepseek: 'missing', poe: 'missing' })
    expect((await bridge.connection.getFeishuStatus()).state).toBe('not_connected')
    const actions = [() => bridge.provider.configurePoe('unused'), () => bridge.employee.runTest('employee', 'test'), () => bridge.employee.publish('employee'), () => bridge.connection.connectFeishu({ appId: 'cli_demo', appSecret: 'unused' }), () => bridge.task.start('draft'), () => bridge.task.openArtifact('task', 'file')]
    for (const action of actions) await expect(action()).rejects.toThrow('Web 演示未连接真实服务')
    expect((await bridge.usage!.summary()).requestCount).toBe(0)
  })
})
