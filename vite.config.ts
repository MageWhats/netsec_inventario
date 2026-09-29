import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // "npm run dev:movil": HTTPS con certificado local y expuesto en la red, para abrir la app
  // desde el teléfono. El navegador solo permite usar la cámara en páginas seguras.
  const movil = mode === 'movil'

  // Site Key de Cloudflare Turnstile: es pública por diseño (el navegador la necesita para dibujar
  // el CAPTCHA). Se acepta con o sin el prefijo VITE_ porque el panel de Vercel advierte al guardar
  // variables "KEY" con ese prefijo. Solo se expone esta variable exacta, nunca un prefijo general.
  const env = loadEnv(mode, process.cwd(), '')
  const turnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY || env.TURNSTILE_SITE_KEY || ''

  return {
    plugins: [
      react(),
      tailwindcss(),
      movil && basicSsl({ name: 'netsec-inventario' }),
      // App instalable que abre al instante: el service worker guarda el código de la app (no los datos,
      // que siempre se piden a Supabase). Con una versión nueva, la app ofrece actualizar (ActualizacionApp).
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: false, // se usa public/manifest.webmanifest
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,webmanifest}'],
          // Alfabetos que no se usan (el navegador solo los pediría si aparecieran) y partes de jsPDF que la app no usa
          globIgnores: ['**/*-cyrillic*', '**/*-vietnamese*', '**/html2canvas-*', '**/purify.es-*'],
          // El motor del escáner (WebAssembly) pesa ~1 MB
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: movil ? { host: true } : undefined,
    define: {
      'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(turnstileSiteKey),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
