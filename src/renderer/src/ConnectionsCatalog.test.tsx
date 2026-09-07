import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FEISHU_DOCUMENT_SCOPES } from '../../shared/connection-contract'
import { FEISHU_MEETING_SCOPES } from '../../shared/feishu-meeting-contract'
import { ConnectionsCatalog } from './ConnectionsCatalog'

describe('meeting authorization upgrade', () => {
  it('reuses the stored secret and explicitly opts in to meeting scopes', async () => {
    const status = { provider: 'feishu' as const, state: 'connected' as const, appId: 'cli_example123', checkedAt: new Date().toISOString(), scopes: [...FEISHU_DOCUMENT_SCOPES] }
    const upgraded = { ...status, scopes: [...status.scopes, ...FEISHU_MEETING_SCOPES] }
    const connectFeishu = vi.fn().mockResolvedValue(upgraded), onStatusChange = vi.fn()
    Object.defineProperty(window, 'aiEmployeeOS', { configurable: true, value: { connection: { connectFeishu } } })
    render(<ConnectionsCatalog feishuStatus={status} loading={false} modalOpen onModalOpenChange={vi.fn()} onStatusChange={onStatusChange} />)
    expect(screen.getByText(/未授权。文档读取仍可使用/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开通会议能力' }))
    expect(screen.queryByLabelText('飞书 App Secret')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始用户授权' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: '我已添加文档和会议所需权限、发布版本，并保存上述重定向 URL' }))
    fireEvent.click(screen.getByRole('button', { name: '开始用户授权' }))
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(upgraded))
    expect(connectFeishu).toHaveBeenCalledWith({ appId: status.appId, appSecret: '', enableMeetings: true })
  })
})
