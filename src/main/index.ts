import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, Menu, session } from 'electron'
import { CLIENT_WINDOW_LAYOUT, MACOS_TRAFFIC_LIGHT_POSITION } from '../shared/layout-contract'

const prototypeName = 'AI Employee OS Prototype'
app.setName(prototypeName)
app.setPath('userData', join(app.getPath('appData'), prototypeName))
app.enableSandbox()

function createWindow(): void {
  const window = new BrowserWindow({
    width: CLIENT_WINDOW_LAYOUT.defaultWidth,
    height: CLIENT_WINDOW_LAYOUT.defaultHeight,
    minWidth: CLIENT_WINDOW_LAYOUT.minWidth,
    minHeight: CLIENT_WINDOW_LAYOUT.minHeight,
    show: false,
    title: prototypeName,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    backgroundColor: '#f4f5f2',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      devTools: !app.isPackaged
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  if (developmentUrl) void window.loadURL(developmentUrl)
  else void window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)))
}

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: prototypeName, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
