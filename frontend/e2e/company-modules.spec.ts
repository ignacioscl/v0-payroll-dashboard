/**
 * Checks por empresa «Expenses» y «Closing reports» (antes «Window Tint Closing»; desde D17 de
 * plans/plan-reunion-juan-18-11 abre Monthly Closing, Window Tint Closing y Open Invoices) — el camino entero
 * (plans/plan-checks-expenses-tint, F5 y T9),
 * en 375×812 y 1280×800 (los dos proyectos de playwright.config.ts). Contra http://pro.srs.com local, con la
 * migration 021 aplicada y dos usuarios de `.env.e2e.local`:
 *
 * - E2E_USER: de Auto Wax (los dos checks prendidos), con permiso de Expenses y de Closing (o Admin).
 * - E2E_USER_NO_MODULES: de una empresa con los dos checks apagados (p. ej. Mooi), con los mismos permisos.
 *
 * Lo que recorre: con la empresa sin checks, el menú no muestra Expenses ni los tres reportes de cierre, `/expenses` y
 * los tres reportes por URL muestran «Access denied» dentro del marco, y la API responde 403. Con Auto Wax, se ven y abren.
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
    if (!(await menuLinkVisible(page, 'Business KPIs'))) await reports.click()
  }
}

test.describe('empresa sin los checks', () => {
  test.skip(E2E_MISSING_USER_NO_MODULES, E2E_MISSING_USER_NO_MODULES_REASON)

  test('el menú no los muestra, la URL directa da «Access denied» y la API da 403', async ({ page }) => {
    await login(page, E2E_USER_NO_MODULES, E2E_PASSWORD_NO_MODULES)
    await openReportsGroup(page)

    await expect(page.getByRole('link', { name: 'Business KPIs', exact: true })).toBeVisible()
    for (const name of ['Monthly Closing', 'Window Tint Closing', 'Open Invoices']) {
      expect(await menuLinkVisible(page, name), name).toBe(false)
    }
    await expect(page.getByRole('button', { name: /^Expenses$/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Expenses/ })).toHaveCount(0)
    await noHorizontalScroll(page)

    // Sin saltar a otra pantalla: «Access denied» dentro del marco y la dirección igual (plans/plan-buenas-practicas-v0, 4.6, D11).
    for (const path of [
      '/expenses',
      '/expenses/recurring',
      '/reports/monthly-closing',
      '/reports/window-tint-closing',
      '/reports/open-invoices',
    ]) {
      await page.goto(path)
      await expect(page.locator('main').getByText('Access denied')).toBeVisible()
      expect(new URL(page.url()).pathname).toBe(path)
    }

    const expenses = await page.request.get('/api/srs-kpis/expenses')
    expect(expenses.status()).toBe(403)
    const month = new Date().toISOString().slice(0, 7)
    for (const scope of ['all', 'tint']) {
      const closing = await page.request.get(`/api/srs-kpis/reports/monthly-closing?month=${month}&idDealer=1&scope=${scope}`)
      expect(closing.status(), scope).toBe(403)
    }
    const openInvoices = await page.request.get('/api/srs-kpis/kpis/billing/open-invoices/snapshots?page=1&pageSize=10')
    expect(openInvoices.status()).toBe(403)
  })
})

test.describe('Auto Wax, con los dos checks', () => {
  test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

  test('el menú los muestra y las pantallas abren', async ({ page }) => {
    await login(page)
    await openReportsGroup(page)
    for (const name of ['Monthly Closing', 'Window Tint Closing', 'Open Invoices']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
    }

    await page.goto('/reports/window-tint-closing')
    await expect(page.getByRole('heading', { name: 'Window Tint Closing' })).toBeVisible()

    await page.goto('/expenses')
    await expect(page).toHaveURL(/\/expenses$/)
    await expect(page.getByRole('heading', { name: /Expenses/ }).first()).toBeVisible()
    await noHorizontalScroll(page)
  })
})
