import React from 'react'
import ReactDOM from 'react-dom/client'
import { Dashboard } from './Dashboard'
// @ts-ignore TypeScript may not have declarations for CSS side-effect imports.
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
)
