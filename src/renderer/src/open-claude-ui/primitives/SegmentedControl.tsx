/** Geometry and dimensions adapted from open-claude-ui SegmentedControl.tsx
 * at f504349419118a32804ce3a7fae74593070bf945 (MIT). Motion is CSS only. */
import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export interface SegmentedTabItem { id: string; label: string; icon?: ReactNode; badge?: string | number; disabled?: boolean; tabId?: string; controls?: string }
export interface SegmentedControlProps {
  tabs: Array<string | SegmentedTabItem>
  value?: string | number
  defaultValue?: string | number
  onChange?: (value: string | number, index: number) => void
  size?: 'sm' | 'md'
  className?: string
  label?: string
}

export function CdsSegmentedControl({ tabs, value, defaultValue, onChange, size = 'md', className = '', label = '选项' }: SegmentedControlProps): React.JSX.Element {
  const normalized = tabs.map((tab, index) => typeof tab === 'string' ? { id: String(index), label: tab } : tab)
  const resolveIndex = (selection: string | number | undefined): number => normalized.findIndex((tab) => tab.id === String(selection) || tab.label === selection)
  const [internalValue, setInternalValue] = useState(defaultValue)
  const candidate = resolveIndex(value === undefined ? internalValue : value)
  const activeIndex = candidate >= 0 && !normalized[candidate].disabled ? candidate : normalized.findIndex((tab) => !tab.disabled)
  const canCompact = normalized.length === 3 && normalized.every((tab) => Boolean(tab.icon))
  const rootRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const id = useId()
  const select = (index: number): void => {
    const tab = normalized[index]
    if (!tab || tab.disabled) return
    if (value === undefined) setInternalValue(tab.id)
    onChange?.(tab.id, index)
  }
  return <div ref={rootRef} className={`cds-segmented cds-segmented--${size}${className ? ` ${className}` : ''}`} data-cds="SegmentedControl" data-pills={normalized.length} data-compact-icons={canCompact || undefined} role="tablist" aria-label={label} style={{ '--cds-segment-index': Math.max(0, activeIndex), '--cds-segment-count': Math.max(1, normalized.length) } as CSSProperties}>
    {activeIndex >= 0 && <span className="cds-segmented__indicator" aria-hidden="true" />}
    {normalized.map((tab, index) => <button key={tab.id} ref={(element) => { if (element) tabRefs.current.set(tab.id, element); else tabRefs.current.delete(tab.id) }} id={tab.tabId ?? `${id}-${tab.id}`} aria-controls={tab.controls} type="button" role="tab" className="cds-segmented__tab" aria-label={tab.label} aria-selected={activeIndex === index} tabIndex={activeIndex === index ? 0 : -1} disabled={tab.disabled} onClick={() => select(index)} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const enabled = normalized.map((item, itemIndex) => item.disabled ? -1 : itemIndex).filter((itemIndex) => itemIndex >= 0)
      if (!enabled.length) return
      const current = enabled.indexOf(index)
      const rtl = rootRef.current && getComputedStyle(rootRef.current).direction === 'rtl'
      const step = (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1)
      const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)! : enabled[(current + step + enabled.length) % enabled.length]
      select(next)
      tabRefs.current.get(normalized[next].id)?.focus()
    }}>
      {tab.icon && <span className="cds-segmented__icon" aria-hidden="true">{tab.icon}</span>}
      <span className="cds-segmented__label">{tab.label}</span>
      {tab.badge !== undefined && <span className="cds-segmented__badge">{tab.badge}</span>}
    </button>)}
  </div>
}
