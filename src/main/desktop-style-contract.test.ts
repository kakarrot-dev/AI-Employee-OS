import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Electron desktop stylesheet contract', () => {
  it('gives the production desktop one CDS stylesheet chain independent of the Web prototype', () => {
    const entry = source('src/renderer/src/main.tsx')
    expect(entry).not.toContain('prototypes/macos-client-v2/src/')
    expect(entry).not.toContain("import './prototype-adapter.css'")
    expect(entry.indexOf('open-claude-ui/cds-theme.css')).toBeGreaterThan(-1)
    expect(entry.indexOf('open-claude-ui/cds-theme.css')).toBeLessThan(entry.indexOf('design-system/tokens.css'))
    expect(entry).not.toContain('design-system/components.css')
    expect(entry.indexOf('design-system/tokens.css')).toBeLessThan(entry.indexOf('design-system/primitives.css'))
    expect(entry.indexOf('design-system/primitives.css')).toBeLessThan(entry.indexOf('design-system/business.css'))
    expect(entry.indexOf('design-system/business.css')).toBeLessThan(entry.indexOf('design-system/desktop.css'))
    const legacy = source('src/renderer/src/styles.css')
    expect(legacy).not.toMatch(/^\.(?:composer|context-pane|delivery-card)(?:\s|\{|>)/m)
    expect(legacy).toMatch(/^\.legacy-composer\s*\{/m)
    expect(legacy).toMatch(/^\.legacy-context-pane\s*\{/m)
    expect(legacy).toMatch(/^\.legacy-delivery-card\s*\{/m)
  })
})
