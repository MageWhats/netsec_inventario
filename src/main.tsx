import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigErrorPage } from '@/app/ConfigErrorPage'
import { parseEnv } from '@/lib/env'
import { aplicarTemaGuardado } from '@/lib/tema'
// Tipografías incluidas en la app (sin depender de Google Fonts): Montserrat para títulos, como el logo,
// y Plus Jakarta Sans para el texto
import '@fontsource-variable/montserrat'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'

aplicarTemaGuardado()
const root = createRoot(document.getElementById('root')!)
const { errors } = parseEnv()

if (errors) {
  root.render(<ConfigErrorPage errors={errors} />)
} else {
  // Import dinámico: el cliente de Supabase solo se crea si la configuración es válida
  const { App } = await import('@/app/App')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
