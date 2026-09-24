import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigErrorPage } from '@/app/ConfigErrorPage'
import { parseEnv } from '@/lib/env'
import './index.css'

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
