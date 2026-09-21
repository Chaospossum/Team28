import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { STATIC_HOST } from './staticHost'

/** Static builds answer /api/* in the browser; install that before the app can fetch. */
const ready = STATIC_HOST
  ? import('./browserApi').then((m) => m.installBrowserApi())
  : Promise.resolve()

ready.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
