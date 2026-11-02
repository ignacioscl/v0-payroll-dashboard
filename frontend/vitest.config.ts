import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Unit tests (`pnpm vitest run`): hoy solo la pareja de reglas de Expenses. Falta `pnpm add -D vitest`. */
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
})
