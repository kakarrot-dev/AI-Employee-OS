/** Surface and overlay adapted from open-claude-ui ConfirmationDialog.tsx at
 * f504349419118a32804ce3a7fae74593070bf945 (MIT). CSS motion replaces Framer. */
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { UNSAFE_PortalProvider } from 'react-aria/PortalProvider'

const DialogDepth = createContext(0)

export interface CdsDialogProps {
  open: boolean
  title: string
  size?: 'small' | 'medium' | 'large'
  nested?: boolean
  onClose: () => void
  children: ReactNode
}

export function CdsDialog({ open, title, size = 'large', nested = false, onClose, children }: CdsDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLElement>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null)
  const portalContainerRef = useRef<HTMLDivElement | null>(null)
  portalContainerRef.current = portalContainer
  const getPortalContainer = useCallback(() => portalContainerRef.current, [])
  const parentDepth = useContext(DialogDepth)
  const depth = Math.max(parentDepth + 1, nested ? 2 : 1)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useLayoutEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const isPortalTarget = (target: EventTarget | null): boolean => target instanceof Node && Boolean(portalContainerRef.current?.contains(target))
    const topmost = (): boolean => Array.from(document.querySelectorAll<HTMLElement>('[data-cds="Dialog"]')).reduce<HTMLElement | null>((current, element) => !current || Number(element.dataset.cdsDepth) >= Number(current.dataset.cdsDepth) ? element : current, null) === dialogRef.current
    const focusable = (): HTMLElement[] => dialogRef.current ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden') : []
    const focusFirst = (): void => { (focusable()[0] ?? dialogRef.current)?.focus() }
    const frame = window.requestAnimationFrame(() => { if (topmost() && !dialogRef.current?.contains(document.activeElement) && !isPortalTarget(document.activeElement)) focusFirst() })
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!topmost()) return
      // A descendant React Aria overlay owns its keyboard dismissal and focus
      // restoration. Only this dialog's dedicated portal is part of its scope.
      if (isPortalTarget(event.target) || isPortalTarget(document.activeElement)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0], last = items.at(-1)
      if (!first || !last) { event.preventDefault(); dialogRef.current?.focus(); return }
      const active = document.activeElement
      if (!dialogRef.current?.contains(active) || active === dialogRef.current || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    const onFocusIn = (event: FocusEvent): void => {
      if (!topmost() || !(event.target instanceof Node)) return
      if (dialogRef.current?.contains(event.target) || isPortalTarget(event.target)) {
        // A user or child overlay has already chosen focus. Do not let the
        // pending initial-focus frame replace its menu restoration target.
        window.cancelAnimationFrame(frame)
        return
      }
      focusFirst()
    }
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
      window.cancelAnimationFrame(frame)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, depth])
  if (!open) return null
  return createPortal(<DialogDepth.Provider value={depth}><div className={`modal-overlay cds-dialog-overlay${nested ? ' modal-overlay--nested' : ''}`} data-cds="DialogOverlay" data-entering="" role="presentation" style={{ zIndex: 100 + depth * 10 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current() }}>
    <section ref={dialogRef} className={`app-modal app-modal--${size} cds-dialog cds-dialog--${size}`} data-cds="Dialog" data-cds-depth={depth} data-entering="" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><UNSAFE_PortalProvider getContainer={getPortalContainer}>{children}</UNSAFE_PortalProvider></section>
    <div ref={setPortalContainer} data-cds="DialogPortal" style={{ display: 'contents' }} />
  </div></DialogDepth.Provider>, document.body)
}
