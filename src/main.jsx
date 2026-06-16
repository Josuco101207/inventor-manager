import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Manejo de errores al cargar chunks cuando se actualiza la app en el servidor
window.addEventListener('vite:preloadError', (event) => {
  window.location.reload();
});

// Registro del Service Worker para soporte offline y PWA
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
