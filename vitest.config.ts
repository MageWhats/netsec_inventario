import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Las pruebas de la base de datos cargan todas las migraciones en un PostgreSQL embebido
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
