import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockClient, MOCK_STORAGE_KEY } from './client'
const mocks: ReturnType<typeof createMockClient>[] = []
const setup = () => { vi.useFakeTimers(); const mock = createMockClient({ delay: 20 }); mocks.push(mock); return mock }
afterEach(() => { mocks.forEach(m => m.dispose()); mocks.length = 0; vi.useRealTimers() })
describe('pure frontend mock interactions', () => {
  it('streams then completes a task and exposes a real example file preview', async () => {
    const previews: unknown[] = []; vi.useFakeTimers()
    const mock = createMockClient({ delay: 20, preview: file => previews.push(file) }); mocks.push(mock)
    const c = await mock.client.conversation.create()
    const events: string[] = []; mock.client.conversation.onEvent(e => events.push(e.type))
    await mock.client.conversation.send(c.id, '生成示例报告')
    await vi.advanceTimersByTimeAsync(101)
    const task = (await mock.client.task.list()).find(t => t.conversationId === c.id)!
    expect(task.state).toBe('succeeded'); expect(events).toEqual(['output_delta', 'completed'])
    await mock.client.task.openArtifact(task.id, task.delivery!.artifacts[0].id)
    expect(previews).toEqual([expect.objectContaining({ text: expect.stringContaining('Mock 示例') })])
  })
  it('requires approval and supports rejection without later timer completion', async () => {
    const mock = setup(); mock.setScenario('approval'); const c = await mock.client.conversation.create()
    await mock.client.conversation.send(c.id, '审批演示'); await vi.advanceTimersByTimeAsync(101)
    const task = (await mock.client.task.list()).find(t => t.conversationId === c.id)!
    expect(task.state).toBe('needs_attention')
    await mock.client.task.rejectTool(task.toolActions[0].id); await vi.advanceTimersByTimeAsync(1000)
    expect((await mock.client.task.list()).find(t => t.id === task.id)?.state).toBe('cancelled')
  })
  it('recovers failure through retry and cancels an unfinished conversation response', async () => {
    const mock = setup(); mock.setScenario('failure'); const c = await mock.client.conversation.create()
    await mock.client.conversation.send(c.id, '失败演示'); await vi.advanceTimersByTimeAsync(101)
    const t = (await mock.client.task.list()).find(t => t.conversationId === c.id)!
    expect(t.state).toBe('failed'); await mock.client.task.retry(t.id); await vi.advanceTimersByTimeAsync(61)
    expect((await mock.client.task.list()).find(item => item.id === t.id)?.state).toBe('succeeded')
    const other = await mock.client.conversation.create(); const request = await mock.client.conversation.send(other.id, '取消演示'); await mock.client.conversation.cancel(request.requestId); await vi.advanceTimersByTimeAsync(1000)
    expect((await mock.client.conversation.history(other.id))).toHaveLength(1)
    expect((await mock.client.task.list()).some(t => t.conversationId === other.id)).toBe(false)
  })
  it('saves edited employee data and validates mandatory fields', async () => {
    const mock = setup(); const e = (await mock.client.employee.list())[0]; await mock.client.employee.beginEdit(e.id)
    const detail = await mock.client.employee.detail(e.id)
    const draft = { ...detail.draft!, role: '新的职责' }
    await mock.client.employee.saveDraft(e.id, draft)
    expect((await mock.client.employee.detail(e.id)).draft?.role).toBe('新的职责')
    await expect(mock.client.employee.create({ ...draft, name: '' })).rejects.toThrow('invalid_employee_name')
  })
  it('never stores submitted credentials and isolates the storage key', async () => {
    const store = new Map<string, string>(); const mock = createMockClient({ storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v) } } }); mocks.push(mock)
    await mock.client.provider.configurePoe('secret-do-not-store'); await mock.client.connection.connectFeishu({ appId: 'cli_demo', appSecret: 'secret-do-not-store' })
    expect([...store.keys()]).toEqual([MOCK_STORAGE_KEY]); expect(store.get(MOCK_STORAGE_KEY)).not.toContain('secret-do-not-store')
  })
  it('turns interrupted mock tasks into retryable failures after reload', async () => {
    const mock = setup(); const c = await mock.client.conversation.create(); await mock.client.conversation.send(c.id, '测试恢复'); await vi.advanceTimersByTimeAsync(41)
    const snapshot = JSON.stringify(mock.snapshot()); const restored = createMockClient({ storage: { getItem: () => snapshot, setItem: () => {} } }); mocks.push(restored)
    expect((await restored.client.task.list()).find(t => t.conversationId === c.id)?.state).toBe('failed')
  })
})
