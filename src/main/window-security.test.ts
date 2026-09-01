import { describe, expect, it } from 'vitest'
import { createWindowOptions, isTrustedRendererUrl } from './window-security'

describe('Electron window security', () => {
  it('keeps the renderer sandboxed behind context isolation', () => {
    const options = createWindowOptions('/private/preload.js')
    expect(options.webPreferences).toMatchObject({
      preload: '/private/preload.js',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    })
  })

  it('accepts only the exact dev origin or packaged renderer', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(isTrustedRendererUrl('https://example.com/', 'http://localhost:5173')).toBe(false)
    expect(isTrustedRendererUrl('file:///Applications/AI%20Employee%20OS.app/Contents/Resources/app.asar/out/renderer/index.html')).toBe(true)
    expect(isTrustedRendererUrl('file:///tmp/other.html')).toBe(false)
  })
})
