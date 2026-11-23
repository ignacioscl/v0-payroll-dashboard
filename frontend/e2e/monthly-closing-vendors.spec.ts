/**
 * Expense Piecework — el camino entero (plans/plan-reunion-juan-18-11, temas 3 y 4; antes P8 de
 * plans/plan-monthly-closing-vendors), en 375×812 y 1280×800 (los dos proyectos de playwright.config.ts, Chromium de
 * Playwright). Contra la copia local de PROD: legacy en http://srs.com y PRO en http://pro.srs.com, con el usuario de
 * `.env.e2e.local` (Admin Company de Auto Wax). Francol Services LLC ya está marcado Vendor en la copia.
 *
 * Lo que recorre: legacy, la ficha de Francol dice que sus WO van en expenses Piecework → PRO › Monthly Closing de
 * octubre 2026: Payroll y Expenses de Land Rover Ft Lauderdale → Add Expense › Type Piecework › Francol, 10/31/2026 →
 * el texto de los pay periods dice lo mismo que la línea «Pay periods» del cierre → se marcan 2 WO → Save → el cierre:
 * Payroll bajó y Expenses subió el monto de la expense → se borra la expense.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  E2E_PASSWORD,
  E2E_USER,
  filterExpensesByCompany,
  money,
  monthlyClosingDealer,
  noHorizontalScroll,
} from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const LEGACY = process.env.E2E_LEGACY_URL ?? 'http://srs.com'
const VENDOR_ID = '6985' // Francol Services LLC (empresa 79), solo Piecework
const VENDOR_NAME = 'Francol Services LLC'
const DEALER = 'AutoNation Land Rover Ft Lauderdale'
const MONTH = 'October 2026'

async function legacyLogin(page: Page) {
  await page.goto(`${LEGACY}/login.php`)
  if (await page.locator('#username').isVisible().catch(() => false)) {
    await page.locator('#username').fill(E2E_USER)
    await page.locator('#password').fill(E2E_PASSWORD)
    await page.getByRole('button', { name: 'Secure Sign In' }).click()
    await expect(page).not.toHaveURL(/login\.php/, { timeout: 30_000 })
  }
}

/** La ficha se abre con un POST de `id_usuario`, como lo hace la lista de Users. */
async function openUserForm(page: Page, id: string) {
  await page.goto(`${LEGACY}/modulos/usuarios/php/usuarios.php`)
  await page.evaluate((idUsuario) => {
    const f = document.createElement('form')
    f.method = 'post'
    f.action = '/modulos/usuarios/php/usuario.php'
    const i = document.createElement('input')
    i.name = 'id_usuario'
    i.value = idUsuario
    f.appendChild(i)
    document.body.appendChild(f)
    f.submit()
  }, id)
  await page.waitForURL(/usuario\.php/)
  await expect(page.locator('#is_vendor')).toBeAttached()
}

/** PRO › Monthly Closing de octubre con All Dealers: Payroll y Expenses del dealer y la línea «Pay periods». */
const closing = (page: Page) => monthlyClosingDealer(page, MONTH, DEALER)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** «10/01/2026 – 10/15/2026, 10/16/2026 – 10/30/2026» (línea del cierre) → «Work orders from Oct 1 to Oct 30, 2026». */
function rangeText(periods: string): string {
  const dates = periods.match(/\d{2}\/\d{2}\/\d{4}/g) ?? []
  const [m1, d1] = dates[0].split('/').map(Number)
  const [m2, d2, y2] = dates[dates.length - 1].split('/').map(Number)
  return `Work orders from ${MONTHS[m1 - 1]} ${d1} to ${MONTHS[m2 - 1]} ${d2}, ${y2}`
}

test.describe.serial('Piecework expense — full path', () => {
  test('the vendor form says where its work orders go', async ({ page }) => {
    await legacyLogin(page)
    await openUserForm(page, VENDOR_ID)
    await expect(page.locator('#is_vendor')).toBeChecked()
    await expect(page.locator('#vendor_banner')).toContainText('Its work orders go in Piecework expenses')
  })

  test('Add Expense › Piecework: Payroll goes down and Expenses up by the same amount in Monthly Closing', async ({ page }) => {
    // Dos cierres de octubre con All Dealers: cada uno tarda 1–2 min contra la copia local (tarea monthly-closing-lento).
    test.setTimeout(900_000)
    const before = await closing(page)

    await page.goto('/expenses')
    await page.getByRole('button', { name: 'Add Expense' }).click()
    const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add Expense' }) })
    // Tarjetas Regular / Piecework: Regular por defecto; con datos de un tipo, el otro queda deshabilitado.
    // Las tarjetas tienen aria-pressed (el título de la columna Piecework de la tabla, no).
    const regularTile = form.locator('button[aria-pressed]').filter({ hasText: /^Regular/ })
    const pieceworkTile = form.locator('button[aria-pressed]').filter({ hasText: /^Piecework/ })
    await expect(regularTile).toHaveAttribute('aria-pressed', 'true')
    await pieceworkTile.click()
    await expect(pieceworkTile).toHaveAttribute('aria-pressed', 'true')
    await form.locator('[data-field="pieceworkVendorId"]').getByRole('combobox').click()
    await page.locator('[cmdk-input]').last().fill('Francol')
    await page.getByRole('option', { name: VENDOR_NAME }).click()
    await form.locator('#exp-date').fill('2026-10-31')
    await expect(regularTile).toBeDisabled()

    // El texto de arriba de la tabla es un solo rango: del primer día del primer pay period del cierre de octubre al
    // último del último (D5; formato aprobado por Ignacio el 22/11, «Work orders from Oct 1 to Oct 30, 2026»).
    await expect(form.getByTestId('piecework-periods')).toHaveText(rangeText(before.periods), { timeout: 60_000 })
    const rows = form.locator('tbody tr').filter({ hasText: DEALER })
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })
    await rows.nth(0).getByRole('checkbox').click()
    // Toda la fila marca la WO: la segunda se marca tocando el VIN, no el check.
    await rows.nth(1).locator('td').nth(2).click()
    await expect(rows.nth(1).getByRole('checkbox')).toBeChecked()
    await expect(form.getByText(/^2 of \d+ work orders$/)).toBeVisible()
    const total = money(await form.getByTestId('piecework-total').innerText())
    expect(total).toBeGreaterThan(0)
    await noHorizontalScroll(page)
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/srs-kpis/expenses',
    )
    await form.getByRole('button', { name: 'Save' }).click()
    const detail = (await (await created).json()) as { kind: 'single' | 'group'; id?: number; groupId?: number }
    const deleteUrl =
      detail.kind === 'group' ? `/api/srs-kpis/expenses/groups/${detail.groupId}` : `/api/srs-kpis/expenses/${detail.id}`
    await expect(page.getByText('Expense saved.')).toBeVisible()

    // La expense en la lista: compañía = el vendor, categoría Piecework, sin «Duplicate».
    await filterExpensesByCompany(page, VENDOR_NAME)
    const row = page.getByRole('row').filter({ hasText: VENDOR_NAME }).filter({ hasText: 'Piecework' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.getByRole('button', { name: 'Actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // Filtro All / Regular / Piecework (Ignacio, 22/11): Regular la esconde, Piecework la muestra.
    const typeFilter = page.getByTestId('expense-type-filter')
    await typeFilter.getByRole('radio', { name: 'Regular', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: VENDOR_NAME })).toHaveCount(0)
    await typeFilter.getByRole('radio', { name: 'Piecework', exact: true }).click()
    await expect(row).toBeVisible()

    try {
      const after = await closing(page)
      expect(Math.round((before.payroll - after.payroll) * 100) / 100).toBe(total)
      expect(Math.round((after.expenses - before.expenses) * 100) / 100).toBe(total)
      await noHorizontalScroll(page)
    } finally {
      // Se borra lo creado (libera las WO), como Delete de la lista.
      const status = await page.evaluate((url) => fetch(url, { method: 'DELETE' }).then((r) => r.status), deleteUrl)
      expect(status).toBe(204)
    }
  })
})
