/**
 * Encabezados de seguridad del front (plans/plan-buenas-practicas-v0, 2.13.7; regla global «Encabezados de seguridad
 * desde el primer deploy»). Lee `next.config.mjs` como lo lee Next.
 */
import { describe, expect, it } from 'vitest'

import nextConfig from '../next.config.mjs'

describe('next.config: encabezados de seguridad', () => {
  it('sin X-Powered-By', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it('todas las rutas llevan los seis encabezados', async () => {
    const rules = await nextConfig.headers!()
    const all = rules.find((r) => r.source === '/(.*)')
    expect(all).toBeDefined()
    const byKey = Object.fromEntries(all!.headers.map((h) => [h.key.toLowerCase(), h.value]))
    expect(Object.keys(byKey).sort()).toEqual(
      [
        'content-security-policy',
        'permissions-policy',
        'referrer-policy',
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
      ].sort(),
    )
    expect(byKey['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(byKey['x-frame-options']).toBe('DENY')
    expect(byKey['x-content-type-options']).toBe('nosniff')
    expect(byKey['strict-transport-security']).toContain('max-age=')
  })

  it("fuera de desarrollo la CSP no permite 'unsafe-eval'", async () => {
    // vitest corre con NODE_ENV=test: es la CSP de producción.
    const rules = await nextConfig.headers!()
    const csp = rules[0].headers.find((h) => h.key === 'Content-Security-Policy')!.value
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toMatch(/\*/)
  })
})
