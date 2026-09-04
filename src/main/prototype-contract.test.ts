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
      '--layout-toolbar-inline-padding: 24px',
      '--layout-toolbar-navigation-edge-padding: 10px',
      '--layout-toolbar-window-controls-gap: 16px',
      '--layout-toolbar-collapsed-navigation-width: calc(var(--layout-window-controls-safe-left) + var(--layout-toolbar-window-controls-gap) + var(--layout-icon-button-size) + var(--layout-toolbar-navigation-edge-padding))',
      '--layout-rail-width: 52px',
      '--layout-context-width: 264px',
      '--layout-window-controls-safe-left: 76px',
      '--layout-window-controls-safe-top: 44px',
      '--icon-size-inline: 14px',
      '--icon-size-control: 16px',
      '--icon-size-standard: 18px',
      '--icon-size-navigation: 20px',
      '--icon-size-feature: 24px',
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
    const rendererApp = source('src/renderer/src/App.tsx')
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    const adapter = source('src/renderer/src/prototype-adapter.css')
    expect(toolbar).toContain('window-controls-safe-area')
    expect(toolbar).toContain('data-layout-contract="application-toolbar"')
    expect(toolbar).toContain('data-toolbar-zone="actions"')
    expect(toolbar).not.toContain('<span /><span /><span />')
    expect(styles).not.toContain('.traffic-lights span')
    expect(styles).toMatch(/\.toolbar \{[\s\S]*?-webkit-app-region: drag;[\s\S]*?\}/)
    expect(styles).toMatch(/\.window-controls-safe-area \{[\s\S]*?-webkit-app-region: drag;[\s\S]*?\}/)
    expect(styles).toMatch(/\.toolbar__content \{[\s\S]*?padding: 0 var\(--layout-toolbar-inline-padding\);[\s\S]*?-webkit-app-region: drag;[\s\S]*?\}/)
    expect(styles).toMatch(/\.toolbar :is\([^)]+\) \{[\s\S]*?-webkit-app-region: no-drag;[\s\S]*?\}/)
    expect(adapter).not.toContain('--layout-toolbar-height:')
    expect(adapter).toMatch(/\.prototype\.is-context-collapsed \.toolbar \{[\s\S]*?grid-template-columns:\s*var\(--layout-toolbar-collapsed-navigation-width\) minmax\(0, 1fr\);[\s\S]*?\}/)
    expect(adapter).not.toContain('.matter-toolbar-toggle svg { transform: scaleX(-1); }')
    expect(rendererApp).not.toMatch(/\n\s+Sidebar(?:Collapse|Expand),/)
    expect(rendererApp).toContain("icon={contextCollapsed ? NavArrowRight : NavArrowLeft}")
    expect(rendererApp).toContain("icon={matterSidebarCollapsed ? NavArrowLeft : NavArrowRight}")
    expect(styles).toMatch(/\.prototype :is\(\.icon-button,[^}]+\) svg \{[\s\S]*?width:\s*var\(--icon-size-control\);[\s\S]*?height:\s*var\(--icon-size-control\);[\s\S]*?\}/)
    expect(adapter).not.toMatch(/\.window-controls-safe-area \{[^}]*-webkit-app-region: no-drag;[^}]*\}/)
    expect(styles).toMatch(/\.modal-overlay \{[\s\S]*?--layout-window-controls-safe-top[\s\S]*?--layout-window-controls-safe-left[\s\S]*?\}/)
  })

  it('keeps one minimal icon family and semantic icon-size contract', () => {
    const layout = source('prototypes/macos-client-v2/src/layout.css')
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    const iconSystem = source('src/renderer/src/components/client-icon-system.tsx')
    const rendererApp = source('src/renderer/src/App.tsx')
    const prototypeApp = source('prototypes/macos-client-v2/src/App.tsx')
    const sourceFiles = [
      rendererApp,
      prototypeApp,
      source('src/renderer/src/components/client-ui.tsx'),
      source('src/renderer/src/components/message-ui.tsx'),
      source('src/renderer/src/SystemModule.tsx'),
      source('src/renderer/src/TeamModule.tsx'),
      source('src/renderer/src/TaskModule.tsx'),
      source('src/renderer/src/ResourceModule.tsx'),
      source('src/renderer/src/RecruitmentCatalog.tsx'),
      source('src/renderer/src/ConnectionsCatalog.tsx')
    ]

    expect(iconSystem).toContain("library: 'iconoir-react'")
    expect(iconSystem).toContain('strokeWidth: 1.5')
    expect(rendererApp).toContain('<ClientIconSystem>')
    expect(prototypeApp).toContain('<ClientIconSystem>')
    for (const token of ['inline', 'control', 'standard', 'navigation', 'feature']) expect(layout).toContain(`--icon-size-${token}:`)
    expect(styles).toContain('width: var(--icon-size-standard)')
    expect(sourceFiles.join('\n')).not.toMatch(/IconoirProvider|<svg(?:\s|>)|\bwidth=\{\d+\}\s+height=\{\d+\}|[✓×›]/)
    expect(sourceFiles.join('\n')).not.toMatch(/from\s+['"](?:lucide-react|react-icons|@heroicons|@mui\/icons|phosphor-react)/)
  })

  it('lets the application shell fill a vertically resized window', () => {
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    expect(styles).toMatch(/\.prototype \{[\s\S]*?height: 100%;[\s\S]*?\}/)
    expect(styles).not.toMatch(/\.prototype \{[\s\S]*?height: min\(100%, var\(--layout-shell-max-height\)\);[\s\S]*?\}/)
  })

  it('lets the application shell fill a horizontally maximized window', () => {
    const styles = source('prototypes/macos-client-v2/src/styles.css')
    expect(styles).toMatch(/\.prototype \{[\s\S]*?width: 100%;[\s\S]*?\}/)
    expect(styles).not.toMatch(/\.prototype \{[\s\S]*?width: min\(100%, var\(--layout-shell-max-width\)\);[\s\S]*?\}/)
    expect(styles).toMatch(/\.toolbar__content \{[\s\S]*?width: 100%;[\s\S]*?\}/)
    expect(styles).not.toMatch(/\.toolbar__content \{[\s\S]*?width: min\(100%, var\(--layout-workspace-content-max-width\)\);[\s\S]*?\}/)
    expect(styles).toMatch(/\.workspace-center \{[\s\S]*?width: 100%;[\s\S]*?\}/)
    expect(styles).not.toMatch(/\.workspace-center \{[\s\S]*?width: min\(100%, var\(--layout-workspace-content-max-width\)\);[\s\S]*?\}/)
    expect(styles).toMatch(/\.message-canvas \{[\s\S]*?var\(--layout-message-content-max-width\)[\s\S]*?\}/)
    expect(styles).toMatch(/\.composer__box \{[\s\S]*?var\(--layout-message-content-max-width\)[\s\S]*?\}/)
    expect(styles).toMatch(/\.detail-page--wide \.detail-canvas \{[\s\S]*?var\(--layout-workspace-content-max-width\)[\s\S]*?\}/)
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
