import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill'
import './index.css'
import App from './App.tsx'

// WICG HTML-in-Canvas polyfill — required for HTMLTexture to work across browsers.
// Uses native API where supported (Chrome flag), falls back to SVG foreignObject elsewhere.
installHtmlInCanvasPolyfill()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
