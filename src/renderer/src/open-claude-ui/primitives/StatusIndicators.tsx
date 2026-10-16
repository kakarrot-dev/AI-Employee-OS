/** CSS adaptation of open-claude-ui StatusIndicators.tsx, fixed upstream commit
 * f504349419118a32804ce3a7fae74593070bf945 (MIT). */
export type CdsStatusTone = 'active' | 'waiting' | 'success' | 'danger' | 'muted'

export function CdsStatusIndicator({ tone, label, animate = false }: { tone: CdsStatusTone; label: string; animate?: boolean }): React.JSX.Element {
  return <span className="status-light cds-status" data-cds="StatusIndicator" data-tone={tone}>
    <span className={`status-light__dot status-light__dot--${tone} cds-status__mark${animate ? ' is-breathing' : ''}`} data-animated={animate || undefined} aria-hidden="true">
      {animate && <span className="cds-status__pulse" />}
      <span className="cds-status__core" />
    </span>
    <span className="cds-status__label">{label}</span>
  </span>
}
