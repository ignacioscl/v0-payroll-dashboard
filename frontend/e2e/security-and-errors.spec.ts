/**
 * Encabezados de seguridad y la página que no existe (plans/plan-buenas-practicas-v0, 2.13.9), en compu y en
 * celular (375 px), con el Chromium de Playwright. Contra el dev local: la CSP de dev permite 'unsafe-eval' (la de
 * producción se controla con `scripts/check-security-headers.sh` sobre el build).
 */
import { expect, test } from '@playwright/test'

import { noHorizontalScroll } from './helpers'

function expectSecurityHeaders(res: { headers(): Record<string, string> } | null) {
  expect(res).not.toBeNull()
  const h = res!.headers()
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['strict-transport-security']).toContain('max-age=')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBeTruthy()
  expect(h['permissions-policy']).toBeTruthy()
  expect(h['x-powered-by']).toBeUndefined()
}

test.describe('seguridad y errores', () => {
  test('/login y /api/auth/me traen los encabezados y no X-Powered-By', async ({ page, request }) => {
    const login = await page.goto('/login')
    expectSecurityHeaders(login)
    const me = await request.get('/api/auth/me')
    expectSecurityHeaders(me)
  })

  test('una dirección que no existe muestra «Page not found» y vuelve al panel', async ({ page }) => {
    const res = await page.goto('/esta-pagina-no-existe')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByText('The address you opened does not exist.')).toBeVisible()
    await noHorizontalScroll(page)
    await page.getByRole('link', { name: 'Back to dashboard' }).click()
    // Sin sesión, el panel manda al login; con sesión, al Dashboard. En los dos casos sale de la 404.
    await expect(page).not.toHaveURL(/esta-pagina-no-existe/)
  })
})
