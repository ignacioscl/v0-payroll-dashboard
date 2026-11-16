/**
 * Un error de tipos no llega a producción (plans/plan-buenas-practicas-v0, 3.1): `next build` valida los tipos.
 */
import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'

describe('next.config', () => {
  it('no ignora los errores de tipos en el build', () => {
    expect(nextConfig.typescript?.ignoreBuildErrors ?? false).toBe(false)
  })
})
