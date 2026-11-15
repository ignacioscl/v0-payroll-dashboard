/**
 * Encabezados de seguridad y la página que no existe (plans/plan-buenas-practicas-v0, 2.13.9), en compu y en
 * celular (375 px), con el Chromium de Playwright. Contra el dev local: la CSP de dev permite 'unsafe-eval' (la de
 * producción se controla con `scripts/check-security-headers.sh` sobre el build).
 */
import { expect, test } from '@playwright/test'

import { E2E_MISSING_USER, login, noHorizontalScroll, openMobileMenuIfNeeded } from './helpers'

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

  test('/login lleva noindex, nofollow', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  })

  test('sin sesión, una dirección que no existe lleva al login (el proxy no sabe qué pantallas hay)', async ({ page }) => {
    await page.goto('/esta-pagina-no-existe')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('con sesión, una dirección que no existe muestra «Page not found» y vuelve al panel', async ({ page }) => {
    test.skip(E2E_MISSING_USER, 'Set E2E_USER and E2E_PASSWORD in frontend/.env.e2e.local')
    await login(page)
    const res = await page.goto('/esta-pagina-no-existe')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByText('The address you opened does not exist.')).toBeVisible()
    await noHorizontalScroll(page)
    await page.getByRole('link', { name: 'Back to dashboard' }).click()
    await expect(page).not.toHaveURL(/esta-pagina-no-existe/)
  })

  test('Log out (POST) pasa por el legacy, termina en /login y recarga el documento', async ({ page }) => {
    test.skip(E2E_MISSING_USER, 'Set E2E_USER and E2E_PASSWORD in frontend/.env.e2e.local')
    await login(page)
    await openMobileMenuIfNeeded(page)
    const trigger = page.locator('button[aria-haspopup="menu"]').filter({ has: page.locator('[data-slot="avatar"]') }).last()
    await trigger.click()
    const postLogout = page.waitForRequest((r) => r.url().endsWith('/api/auth/logout') && r.method() === 'POST')
    const loginDocument = page.waitForRequest((r) => r.isNavigationRequest() && /\/login(\?|$)/.test(r.url()))
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await postLogout
    await loginDocument
    await expect(page).toHaveURL(/\/login/)
    // Sin sesión: el panel manda otra vez al login.
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('«Back to SRS Legacy» (POST) llega al legacy sin errores de CSP', async ({ page }) => {
    test.skip(E2E_MISSING_USER, 'Set E2E_USER and E2E_PASSWORD in frontend/.env.e2e.local')
    const csp: string[] = []
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text())
    })
    await login(page)
    const proHost = new URL(page.url()).host
    await openMobileMenuIfNeeded(page)
    await page.locator('button[aria-haspopup="menu"]').filter({ has: page.locator('[data-slot="avatar"]') }).last().click()
    // El SSO tiene que llegar a consume.php con un código (si adopt.php falla, salta directo a index.php). Lo que pase
    // después depende del rol en el legacy: el usuario e2e no tiene pantallas ahí y el legacy lo manda al login.
    const consume = page.waitForResponse((r) => /\/php\/api\/sso\/consume\.php\?code=[0-9a-f]{16,}/.test(r.url()), { timeout: 30_000 })
    await page.getByRole('menuitem', { name: 'Back to SRS Legacy' }).click()
    expect((await consume).status()).toBe(302)
    await expect.poll(() => new URL(page.url()).host, { timeout: 30_000 }).not.toBe(proHost)
    expect(csp).toEqual([])
  })
})

