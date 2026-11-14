/**
 * `proxy.ts` y los cambios de sesión (plans/plan-buenas-practicas-v0, 3.12 y 3.13). La etapa 4 suma acá los de la
 * revisión de la cookie en las pantallas.
 */
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({
  getSrsSession: async () => ({ token: 't', user: { legacyOrigin: 'https://main.srssuite.com' } }),
  buildClearSessionCookies: () => [],
}))

import { proxy } from '../proxy'
import { isAllowedOrigin } from '@/lib/security/same-origin'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { allowedLegacyOrigins, resolveLegacyPublicUrl } from '@/lib/legacy-origin'
import { GET as logoutGET, POST as logoutPOST } from '@/app/api/auth/logout/route'
import { GET as toPhpGET } from '@/app/api/sso/to-php/route'

const env = { PAYROLL_PUBLIC_URL: 'https://pro.srssuite.com' } as unknown as NodeJS.ProcessEnv

afterEach(() => {
  delete process.env.SRS_LEGACY_ORIGINS
  delete process.env.PAYROLL_PUBLIC_URL
})

describe('chequeo de origen (proxy.ts)', () => {
  it('un POST desde el legacy (otro subdominio) → no', () => {
    expect(isAllowedOrigin('POST', new Headers({ origin: 'https://main.srssuite.com' }), env)).toBe(false)
  })
  it('un POST desde PRO → sí; sin Origin → sí; un GET de cualquier lado → sí', () => {
    expect(isAllowedOrigin('POST', new Headers({ origin: 'https://pro.srssuite.com' }), env)).toBe(true)
    expect(isAllowedOrigin('DELETE', new Headers(), env)).toBe(true)
    expect(isAllowedOrigin('GET', new Headers({ origin: 'https://evil.com' }), env)).toBe(true)
  })
  it('sin PAYROLL_PUBLIC_URL compara con el host del pedido (dev: http://pro.srs.com)', () => {
    const h = new Headers({ origin: 'http://pro.srs.com', host: 'pro.srs.com' })
    expect(isAllowedOrigin('POST', h, {} as NodeJS.ProcessEnv)).toBe(true)
  })
  it('proxy() responde 403 a un POST a /api/srs desde otro origen y deja pasar el propio', () => {
    process.env.PAYROLL_PUBLIC_URL = 'https://pro.srssuite.com'
    const bad = proxy(new NextRequest('https://pro.srssuite.com/api/srs/x', { method: 'POST', headers: { origin: 'https://main.srssuite.com' } }))
    expect(bad.status).toBe(403)
    const ok = proxy(new NextRequest('https://pro.srssuite.com/api/srs/x', { method: 'POST', headers: { origin: 'https://pro.srssuite.com' } }))
    expect(ok.status).toBe(200)
  })
})

describe('clear-session', () => {
  it('solo /login y /login?error=forbidden; lo demás va a /login', () => {
    expect(safeRedirectPath('/login?error=forbidden')).toBe('/login?error=forbidden')
    expect(safeRedirectPath('/\\evil.com')).toBe('/login')
    expect(safeRedirectPath('//evil.com')).toBe('/login')
    expect(safeRedirectPath('/billing')).toBe('/login')
    expect(safeRedirectPath(null)).toBe('/login')
  })
})

describe('logout y vuelta al legacy por POST', () => {
  it('GET → 405', async () => {
    expect(logoutGET().status).toBe(405)
    expect(toPhpGET().status).toBe(405)
  })
  it('POST /api/auth/logout → 303 al logout.php del legacy', async () => {
    process.env.SRS_LEGACY_ORIGINS = 'https://main.srssuite.com'
    process.env.PAYROLL_PUBLIC_URL = 'https://pro.srssuite.com'
    const res = await logoutPOST(new NextRequest('https://pro.srssuite.com/api/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toMatch(/^https:\/\/main\.srssuite\.com\/logout\.php\?next=/)
  })
})

describe('origen del legacy (cookie sin firma)', () => {
  const e = { SRS_LEGACY_ORIGINS: 'https://main.srssuite.com, https://mooi.srssuite.com/', SRS_PUBLIC_URL: 'https://main.srssuite.com' } as unknown as NodeJS.ProcessEnv
  it('lee la lista', () => {
    expect(allowedLegacyOrigins(e)).toEqual(['https://main.srssuite.com', 'https://mooi.srssuite.com'])
  })
  it('uno de la lista se respeta; otro cae en SRS_PUBLIC_URL', () => {
    expect(resolveLegacyPublicUrl('https://mooi.srssuite.com', e)).toBe('https://mooi.srssuite.com')
    expect(resolveLegacyPublicUrl('https://evil.com', e)).toBe('https://main.srssuite.com')
  })
})
