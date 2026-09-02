import { describe, expect, it } from 'vitest'
import { createWindowOptions, isTrustedRendererUrl } from './window-security'
import { CLIENT_WINDOW_LAYOUT, MACOS_TRAFFIC_LIGHT_POSITION } from '../shared/layout-contract'

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

  it('uses the shared adaptive window contract', () => {
    const options = createWindowOptions('/private/preload.js')
    expect(options).toMatchObject({
      width: CLIENT_WINDOW_LAYOUT.defaultWidth,
      height: CLIENT_WINDOW_LAYOUT.defaultHeight,
      minWidth: CLIENT_WINDOW_LAYOUT.minWidth,
      minHeight: CLIENT_WINDOW_LAYOUT.minHeight
    })
    expect(options.titleBarStyle).toBe('hiddenInset')
    expect(options.trafficLightPosition).toEqual(MACOS_TRAFFIC_LIGHT_POSITION)
    expect(MACOS_TRAFFIC_LIGHT_POSITION.y + CLIENT_WINDOW_LAYOUT.macOSTrafficLightSize / 2).toBe(CLIENT_WINDOW_LAYOUT.toolbarHeight / 2)
  })

  it('accepts only the exact dev origin or packaged renderer', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(isTrustedRendererUrl('https://example.com/', 'http://localhost:5173')).toBe(false)
    expect(isTrustedRendererUrl('file:///Applications/AI%20Employee%20OS.app/Contents/Resources/app.asar/out/renderer/index.html')).toBe(true)
    expect(isTrustedRendererUrl('file:///tmp/other.html')).toBe(false)
  })
})
