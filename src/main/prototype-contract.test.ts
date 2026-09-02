import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('macOS prototype visual contract', () => {
  it('keeps the canonical window, shell, component and modal dimensions', () => {
    const css = source('prototypes/macos-client-v2/src/layout.css')
    for (const token of [
      '--layout-window-default-width: 1280px',
      '--layout-window-default-height: 820px',
      '--layout-window-min-width: 960px',
      '--layout-window-min-height: 640px',
      '--layout-toolbar-height: 40px',
      '--layout-rail-width: 52px',
      '--layout-context-width: 264px',
      '--layout-window-controls-safe-left: 76px',
      '--layout-window-controls-safe-top: 44px',
      '--layout-composer-min-height: 100px',
      '--layout-modal-large-width: 900px',
      '--layout-modal-large-height: 680px'
    ]) expect(css).toContain(token)
    expect(css).toMatch(/@media \(max-width: 1199px\)[\s\S]*--layout-rail-width: 48px;[\s\S]*--layout-context-width: 226px;/)
  })

  it('keeps the canonical compact typography scale', () => {
    const css = source('prototypes/macos-client-v2/src/typography.css')
    for (const token of [
      '--type-size-meta: 10px',
      '--type-size-secondary: 11px',
      '--type-size-body: 12px',
      '--type-size-heading: 14px',
      '--type-size-title: 18px'
    ]) expect(css).toContain(token)
  })

  it('keeps every system settings section in one vertical content column', () => {
    const layout = source('prototypes/macos-client-v2/src/layout.css')
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    expect(layout).not.toContain('--layout-settings-label-width')
    expect(layout).not.toContain('--layout-settings-column-gap')
    expect(styles).toMatch(/\.settings-block \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?gap: 14px;[\s\S]*?\}/)
    expect(styles).toMatch(/\.settings-block__content \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?\}/)
    expect(styles).not.toContain('grid-template-columns: var(--layout-settings-label-width)')
  })

  it('only shows a message fade when content is actually collapsible', () => {
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    expect(styles).toContain('.markdown-message__content.is-collapsible:not(.is-expanded)::after')
    expect(styles).not.toContain('.markdown-message__content:not(.is-expanded)::after')
  })

  it('uses native macOS window controls and keeps modal surfaces outside their safe area', () => {
    const toolbar = source('src/renderer/src/components/client-ui.tsx')
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    expect(toolbar).toContain('window-controls-safe-area')
    expect(toolbar).not.toContain('<span /><span /><span />')
    expect(styles).not.toContain('.traffic-lights span')
    expect(styles).toMatch(/\.modal-overlay \{[\s\S]*?--layout-window-controls-safe-top[\s\S]*?--layout-window-controls-safe-left[\s\S]*?\}/)
  })

  it('does not render passive reminder copy below primary controls', () => {
    const client = source('src/renderer/src/App.tsx')
    const team = source('src/renderer/src/TeamModule.tsx')
    const system = source('src/renderer/src/SystemModule.tsx')
    const prototype = source('prototypes/macos-client-v2/src/App.tsx')
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    const sources = [client, team, system, prototype]
    for (const reminder of [
      '总管会判断是直接回答、归入已有事项，还是创建新事项。',
      '所有字段稍后仍可在员工设置中修改。',
      '点击头像从本地选择图片',
      '使用清晰的职责名称，不使用系统内部 ID。'
    ]) expect(sources.every((value) => !value.includes(reminder))).toBe(true)
    expect(styles).not.toContain('.composer > small')
    expect(styles).not.toContain('.create-agent-actions > span')
    expect(styles).not.toContain('.security-note')
    expect(styles).not.toContain('.matter-team-note')
  })

  it('imports the prototype tokens after legacy styles and isolates retired prototype-class rules', () => {
    const entry = source('src/renderer/src/main.tsx')
    expect(entry.indexOf("import './styles.css'")).toBeLessThan(entry.indexOf('prototypes/macos-client-v2/src/layout.css'))
    expect(entry.indexOf('layout.css')).toBeLessThan(entry.indexOf('typography.css'))
    expect(entry.indexOf('typography.css')).toBeLessThan(entry.indexOf('prototypes/macos-client-v2/src/styles.css'))
    expect(entry.indexOf('prototypes/macos-client-v2/src/styles.css')).toBeLessThan(entry.indexOf("import './prototype-adapter.css'"))
    const legacy = source('src/renderer/src/styles.css')
    expect(legacy).not.toMatch(/^\.(?:composer|context-pane|delivery-card)(?:\s|\{|>)/m)
    expect(legacy).toMatch(/^\.legacy-composer\s*\{/m)
    expect(legacy).toMatch(/^\.legacy-context-pane\s*\{/m)
    expect(legacy).toMatch(/^\.legacy-delivery-card\s*\{/m)
  })
})
