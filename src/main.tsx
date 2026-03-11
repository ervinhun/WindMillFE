import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {DevTools} from "jotai-devtools"
import 'jotai-devtools/styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <DevTools />
    <App />
  </StrictMode>,
)
