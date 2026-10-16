import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme, readTheme } from './SystemModule'
import './design-system/tailwind.css'
import './open-claude-ui/cds-theme.css'
import './design-system/tokens.css'
import './design-system/primitives.css'
import './design-system/messages.css'
import './design-system/business.css'
import './design-system/desktop.css'

applyTheme(readTheme())
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (readTheme() === 'system') applyTheme('system')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
