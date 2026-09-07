import { useState } from 'react'
import { App } from '../App'
import { ClientModal } from '../components/client-ui'
import { createMockClient, type PreviewFile } from './client'
import type { Scenario } from './fixtures'
import './prototype.css'

export function PrototypeApp() {
  const [preview, setPreview] = useState<PreviewFile>()
  const [warning, setWarning] = useState('')
  const [panel, setPanel] = useState(false)
  const [reset, setReset] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('success')
  const [revision, setRevision] = useState(0)
  const [mock] = useState(() => {
    let storage: Storage | undefined
    try { storage = window.localStorage } catch { /* Session-only operation is supported. */ }
    const value = createMockClient({ storage, preview: setPreview, warn: message => queueMicrotask(() => setWarning(message)) })
    window.aiEmployeeOS = value.client
    return value
  })
  window.aiEmployeeOS = mock.client
  const download = () => {
    if (!preview) return
    const url = preview.url ?? URL.createObjectURL(new Blob([preview.text ?? ''], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = preview.name; a.click()
    if (!preview.url) setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <><App key={revision} /><button className="prototype-launcher" onClick={() => setPanel(true)}>交互原型 · Mock</button>
    <ClientModal open={panel} title="原型演示" size="medium" onClose={() => setPanel(false)}><div className="prototype-panel"><p>当前为客户端界面与交互原型，所有 Agent、模型、连接和任务结果均由前端 mock 数据展示。没有后端、模型请求或真实凭证存储。</p><label>下一次任务或连接的演示状态<select aria-label="演示场景" value={scenario} onChange={e => { const value = e.target.value as Scenario; setScenario(value); mock.setScenario(value) }}><option value="success">正常完成</option><option value="failure">执行失败</option><option value="approval">等待审批</option><option value="chat">直接回答，不创建事项</option></select></label><p>发送消息后会展示回复与事项状态。初始会话也提供已完成、失败、待审批示例。</p><p>配置与对话保存在独立的原型存储中；附件只保留到本窗口关闭。中断的模拟任务在下次打开时可重试。</p><button className="button button--danger" onClick={() => setReset(true)}>重置演示数据</button></div></ClientModal>
    <ClientModal open={reset} title="重置原型数据？" size="small" nested onClose={() => setReset(false)}><div className="prototype-panel"><p>清除本原型的配置和对话，恢复初始示例。正式客户端数据不受影响。</p><button className="button button--primary" onClick={() => { mock.reset();
      try { for (const key of Object.keys(window.localStorage)) if (key.startsWith('ai-employee-os.') && key !== 'ai-employee-os.prototype.mock.v1') window.localStorage.removeItem(key) } catch { /* Preferences are optional when storage is blocked. */ }
      document.documentElement.removeAttribute('data-theme'); setRevision(r => r + 1); setReset(false); setPanel(false); setWarning('') }}>确认重置</button></div></ClientModal>
    <ClientModal open={!!preview} title={preview?.name ?? '文件预览'} size="large" nested onClose={() => setPreview(undefined)}><div className="prototype-panel prototype-preview">{preview?.location && <p className="prototype-notice">模拟文件位置：原型交付文件夹。没有写入真实业务目录。</p>}{preview?.text !== undefined ? <pre>{preview.text}</pre> : preview?.url ? <p>附件已选择。此类型在原型中通过下载查看。</p> : null}</div><div className="prototype-preview-footer"><button className="button button--primary" onClick={download}>下载示例文件</button></div></ClientModal>
    {warning && <div className="prototype-warning" role="alert">{warning}<button onClick={() => setWarning('')}>关闭</button></div>}
  </>
}
