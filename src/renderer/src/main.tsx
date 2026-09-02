import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import '../../../prototypes/macos-client-v2/src/layout.css'
import '../../../prototypes/macos-client-v2/src/typography.css'
import '../../../prototypes/macos-client-v2/src/styles.css'
import './prototype-adapter.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
