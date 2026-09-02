import type { BrowserWindowConstructorOptions } from 'electron'
import { CLIENT_WINDOW_LAYOUT } from '../shared/layout-contract'

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: CLIENT_WINDOW_LAYOUT.defaultWidth,
    height: CLIENT_WINDOW_LAYOUT.defaultHeight,
    minWidth: CLIENT_WINDOW_LAYOUT.minWidth,
    minHeight: CLIENT_WINDOW_LAYOUT.minHeight,
    show: false,
    title: 'AI Employee OS',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#f4f5f2',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      devTools: !import.meta.env.PROD
    }
  }
}

export function isTrustedRendererUrl(url: string, devServerUrl?: string): boolean {
  if (devServerUrl) {
    try {
      return new URL(url).origin === new URL(devServerUrl).origin
    } catch {
      return false
    }
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/out/renderer/index.html')
  } catch {
    return false
  }
}
