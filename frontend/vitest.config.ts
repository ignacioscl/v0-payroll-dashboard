import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Unit tests (`pnpm run test:unit`; `lib/infra/` aparte con `test:infra`, lee archivos que no están en la imagen).
 * `server-only` apunta a un archivo vacío: el paquete real tira error fuera de React Server, y el control lo hace
 * `next build` (plans/plan-buenas-practicas-v0, 3.15).
 */
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)),
    },
  },
})
