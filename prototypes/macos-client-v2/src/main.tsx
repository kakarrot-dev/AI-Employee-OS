import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './layout.css'
import './typography.css'
import './styles.css'
import '../../../src/renderer/src/prototype-adapter.css'
import './feishu-meeting.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
