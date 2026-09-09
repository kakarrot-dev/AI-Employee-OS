import { CLIENT_WINDOW_LAYOUT } from '../shared/layout-contract'
import { createPreviewBridge } from './preview-bridge'
import { MeetingStore } from './meeting/store'
import { createMeetingScenes } from './meeting/scene'

// Both hosts mount the same client; the browser supplies explicit demo scene content.
document.documentElement.style.setProperty('--web-client-min-width', `${CLIENT_WINDOW_LAYOUT.minWidth}px`)
document.documentElement.style.setProperty('--web-client-min-height', `${CLIENT_WINDOW_LAYOUT.minHeight}px`)
const meetings = new MeetingStore()
window.aiEmployeeOS = createPreviewBridge(meetings)
const { mountClient } = await import('../renderer/src/mount-client')
mountClient({ scenes: createMeetingScenes(window.aiEmployeeOS, meetings) })
await import('./web-host.css')
await import('./meeting/meeting.css')
if (import.meta.hot) import.meta.hot.dispose(() => meetings.dispose())
