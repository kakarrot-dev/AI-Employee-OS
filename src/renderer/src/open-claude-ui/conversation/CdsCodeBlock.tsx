/**
 * Adapted from open-claude-ui code-examples/CodeBlock.tsx (MIT), pinned at
 * f504349419118a32804ce3a7fae74593070bf945. See third_party/open-claude-ui.
 * The source geometry is styled by messages.css; clipboard state follows the
 * actual write result and preserves the original code, including whitespace.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Code2, Copy } from '../../components/cds-icons'
import { CdsButton } from '../primitives/CdsButton'

export interface CdsCodeBlockProps {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  className?: string
}

export function CdsCodeBlock({ code, language = 'text', filename, showLineNumbers = false, className = '' }: CdsCodeBlockProps): React.JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const copyRequest = useRef(0)
  const copyTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  useEffect(() => {
    setCopyState('idle')
    return () => {
      copyRequest.current += 1
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      copyTimer.current = null
    }
  }, [code])

  const copyCode = async (): Promise<void> => {
    const request = ++copyRequest.current
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    copyTimer.current = null
    setCopyState('idle')
    try {
      if (window.aiEmployeeOS?.clipboard) await window.aiEmployeeOS.clipboard.writeText(code)
      else await navigator.clipboard.writeText(code)
      if (request !== copyRequest.current) return
      setCopyState('copied')
      copyTimer.current = window.setTimeout(() => {
        setCopyState('idle')
        copyTimer.current = null
      }, 2500)
    } catch {
      if (request === copyRequest.current) setCopyState('error')
    }
  }

  const label = copyState === 'copied' ? '已复制' : copyState === 'error' ? '复制失败，重试' : '复制代码'
  const accessibleLabel = copyState === 'copied' ? '已复制代码' : copyState === 'error' ? '复制失败，重试复制代码' : '复制代码'

  return <div className={`cds-code-block${className ? ` ${className}` : ''}`} data-cds="CodeBlock">
    <div className="cds-code-block__header">
      <div className="cds-code-block__identity">
        <Code2 aria-hidden />
        <span className="cds-code-block__language">{language.trim() || 'text'}</span>
        {filename && <><span aria-hidden>•</span><span className="cds-code-block__filename">{filename}</span></>}
      </div>
      <CdsButton type="button" variant="ghost" size="xs" className={`cds-code-block__copy${copyState === 'copied' ? ' is-copied' : ''}`} data-copy-state={copyState} aria-label={accessibleLabel} icon={copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} onClick={() => void copyCode()}>{label}</CdsButton>
    </div>
    <div className="cds-code-block__content">
      {showLineNumbers ? <table className="cds-code-block__line-table" aria-label={filename ? `${filename} 代码和行号` : '代码和行号'}><tbody>{code.split('\n').map((line, index) => <tr key={index}><th className="cds-code-block__line-number" scope="row">{index + 1}</th><td className="cds-code-block__line"><code>{line}</code></td></tr>)}</tbody></table> : <pre className="cds-code-block__pre"><code>{code}</code></pre>}
    </div>
  </div>
}
