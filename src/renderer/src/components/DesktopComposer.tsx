import { useState, type DragEvent, type FormEventHandler, type ReactNode, type RefObject } from 'react'
import { ArrowUp, Plus, Xmark } from './cds-icons'
import { CdsButton } from '../open-claude-ui/primitives/CdsButton'

interface DesktopComposerProps {
  value: string
  placeholder: string
  inputRef: RefObject<HTMLTextAreaElement | null>
  disabled: boolean
  sending: boolean
  cancelling: boolean
  canCancel: boolean
  hasAttachments: boolean
  attachments?: ReactNode
  controls?: ReactNode
  panel?: ReactNode
  error?: string
  onChange: (value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
  onSelectAttachments: () => void
  onDropAttachments: (files: File[]) => void
  onCancel: () => void
}

/** Adapted from open-claude-ui ChatComposer / ChatComposerChin (MIT). */
export function DesktopComposer({ value, placeholder, inputRef, disabled, sending, cancelling, canCancel, hasAttachments, attachments, controls, panel, error, onChange, onSubmit, onSelectAttachments, onDropAttachments, onCancel }: DesktopComposerProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const acceptsFiles = (event: DragEvent<HTMLFormElement>): boolean => !sending && Array.from(event.dataTransfer.types ?? []).includes('Files')

  return <form data-cds="ChatComposer" className="composer desktop-composer" aria-label="消息输入" onSubmit={onSubmit}
    onDragEnter={(event) => { if (acceptsFiles(event)) { event.preventDefault(); setDragging(true) } }}
    onDragOver={(event) => { if (acceptsFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
    onDrop={(event) => { if (acceptsFiles(event)) { event.preventDefault(); setDragging(false); onDropAttachments(Array.from(event.dataTransfer.files)) } }}>
    <div className={`composer__box desktop-composer__box${dragging ? ' is-file-dragging' : ''}`}>
      {dragging && <div className="composer-drop-zone" role="status"><Plus aria-hidden /><span><strong>松开以上传文件</strong><small>Word、PowerPoint、Excel、PDF 或图片</small></span></div>}
      {attachments}
      <textarea ref={inputRef} id="supervisor-input" aria-label="发送消息" rows={2} value={value} onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }}
        placeholder={placeholder} disabled={disabled || sending} />
      <div className="composer__toolbar" data-cds="ChatComposerChin" data-touch-size="true">
        <div className="composer__group"><CdsButton variant="ghost" size="icon" type="button" className="attachment-upload-button" aria-label="添加附件" title="选择 Word、PowerPoint、Excel、PDF 或图片附件" disabled={sending} onClick={onSelectAttachments} icon={<Plus aria-hidden />} />{controls}</div>
        {sending && canCancel
          ? <CdsButton variant="secondary" size="sm" type="button" className="composer__cancel" aria-label={cancelling ? '取消中' : '取消'} title="停止本次回复" disabled={cancelling} onClick={onCancel}><Xmark aria-hidden /><span>{cancelling ? '取消中' : '停止'}</span></CdsButton>
          : <CdsButton variant="primary" size="icon" type="submit" aria-label="发送" title="发送消息" className="composer__send" disabled={(!value.trim() && !hasAttachments) || sending || disabled} icon={<ArrowUp aria-hidden />} />}
      </div>
      {panel}
    </div>
    <div className="desktop-composer__caption"><small>{disabled ? '正在连接工作环境' : sending ? '正在回复' : 'Enter 发送 · Shift+Enter 换行'}</small></div>
    {error && <small className="composer-error" role="alert">{error}</small>}
  </form>
}
