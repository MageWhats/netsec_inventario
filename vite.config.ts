import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // "npm run dev:movil": HTTPS con certificado local y expuesto en la red, para abrir la app
  // desde el teléfono. El navegador solo permite usar la cámara en páginas seguras.
  const movil = mode === 'movil'

  return {
    plugins: [react(), tailwindcss(), movil && basicSsl({ name: 'netsec-inventario' })],
    server: movil ? { host: true } : undefined,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
