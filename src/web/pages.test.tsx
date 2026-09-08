import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../renderer/src/App'
import { createPreviewBridge } from './preview-bridge'

describe('Unmodified main renderer running on the Web bridge', () => {
  beforeEach(() => { window.localStorage?.clear(); window.aiEmployeeOS = createPreviewBridge() })
  it('renders message content, experts, capabilities, connections and every system page', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '与总管的对话', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText(/这里展示的是/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '通讯录' }))
    expect(await screen.findByRole('heading', { name: '通讯录', level: 2 })).toBeInTheDocument()
    expect((await screen.findAllByText('文档编写员')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '能力' }))
    expect(await screen.findByRole('heading', { name: '能力', level: 2 })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelectorAll('.list-row').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: '连接' }))
    expect(await screen.findByRole('heading', { name: '连接', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('暂无已连接应用')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '系统' }))
    for (const section of ['个人资料', '通用', '总管', '模型服务', '资源与权限', '记忆与存储', '用量与预算', '关于与诊断']) {
      fireEvent.click(screen.getByRole('button', { name: section }))
      expect(screen.getByRole('heading', { name: section, level: 1 })).toBeInTheDocument()
      expect(document.querySelector('.system-page .settings-block')).not.toBeNull()
    }
  })
})
