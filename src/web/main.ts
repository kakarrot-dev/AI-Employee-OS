import { CLIENT_WINDOW_LAYOUT } from '../shared/layout-contract'
import { createPreviewBridge } from './preview-bridge'

// Install the same narrow contract before the unmodified desktop renderer mounts.
document.documentElement.style.setProperty('--web-client-min-width', `${CLIENT_WINDOW_LAYOUT.minWidth}px`)
document.documentElement.style.setProperty('--web-client-min-height', `${CLIENT_WINDOW_LAYOUT.minHeight}px`)
window.aiEmployeeOS = createPreviewBridge()
await import('../renderer/src/main')
await import('./web-host.css')
