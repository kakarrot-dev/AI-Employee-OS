import type { BrowserWindowConstructorOptions } from 'electron'

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
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
