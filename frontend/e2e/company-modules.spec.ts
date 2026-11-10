/**
 * Checks por empresa «Expenses» y «Window Tint Closing» — el camino entero (plans/plan-checks-expenses-tint, F5 y T9),
 * en 375×812 y 1280×800 (los dos proyectos de playwright.config.ts). Contra http://pro.srs.com local, con la
 * migration 021 aplicada y dos usuarios de `.env.e2e.local`:
 *
 * - E2E_USER: de Auto Wax (los dos checks prendidos), con permiso de Expenses y de Closing (o Admin).
 * - E2E_USER_NO_MODULES: de una empresa con los dos checks apagados (p. ej. Mooi), con los mismos permisos.
 *
 * Lo que recorre: con la empresa sin checks, el menú no muestra Expenses ni Window Tint Closing (Monthly Closing sí),
 * `/expenses` y `/reports/window-tint-closing` por URL lo sacan, y la API responde 403. Con Auto Wax, se ven y abren.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_NO_MODULES,
  E2E_MISSING_USER_NO_MODULES_REASON,
  E2E_MISSING_USER_REASON,
  E2E_PASSWORD_NO_MODULES,
  E2E_USER_NO_MODULES,
  login,
  noHorizontalScroll,
  openMobileMenuIfNeeded,
} from './helpers'

/** Abre el grupo Reports del menú (en celular, primero el menú) y devuelve si se ve el link pedido. */
async function menuLinkVisible(page: Page, name: string): Promise<boolean> {
  return page.getByRole('link', { name, exact: true }).isVisible().catch(() => false)
}

async function openReportsGroup(page: Page) {
  await openMobileMenuIfNeeded(page)
  const reports = page.getByRole('button', { name: /^Reports$/ })
  if (await reports.isVisible().catch(() => false)) {
    if (!(await menuLinkVisible(page, 'Monthly Closing'))) await reports.click()
  }
}

test.describe('empresa sin los checks', () => {
  test.skip(E2E_MISSING_USER_NO_MODULES, E2E_MISSING_USER_NO_MODULES_REASON)

  test('el menú no los muestra, la URL directa lo saca y la API da 403', async ({ page }) => {
    await login(page, E2E_USER_NO_MODULES, E2E_PASSWORD_NO_MODULES)
    await openReportsGroup(page)

    await expect(page.getByRole('link', { name: 'Monthly Closing', exact: true })).toBeVisible()
    expect(await menuLinkVisible(page, 'Window Tint Closing')).toBe(false)
    await expect(page.getByRole('button', { name: /^Expenses$/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Expenses/ })).toHaveCount(0)
    await noHorizontalScroll(page)

    for (const path of ['/expenses', '/expenses/recurring', '/reports/window-tint-closing']) {
      await page.goto(path)
      await page.waitForURL((url) => url.pathname !== path)
      expect(new URL(page.url()).pathname).not.toBe(path)
    }

    const expenses = await page.request.get('/api/srs-kpis/expenses')
    expect(expenses.status()).toBe(403)
    const month = new Date().toISOString().slice(0, 7)
    const tint = await page.request.get(`/api/srs-kpis/reports/monthly-closing?month=${month}&scope=tint`)
    expect(tint.status()).toBe(403)
  })
})

test.describe('Auto Wax, con los dos checks', () => {
  test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

  test('el menú los muestra y las pantallas abren', async ({ page }) => {
    await login(page)
    await openReportsGroup(page)
    await expect(page.getByRole('link', { name: 'Window Tint Closing', exact: true })).toBeVisible()

    await page.goto('/reports/window-tint-closing')
    await expect(page.getByRole('heading', { name: 'Window Tint Closing' })).toBeVisible()

    await page.goto('/expenses')
    await expect(page).toHaveURL(/\/expenses$/)
    await expect(page.getByRole('heading', { name: /Expenses/ }).first()).toBeVisible()
    await noHorizontalScroll(page)
  })
})
