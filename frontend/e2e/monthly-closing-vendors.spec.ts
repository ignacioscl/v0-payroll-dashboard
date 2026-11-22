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
  login,
  noHorizontalScroll,
  openMobileMenuIfNeeded,
} from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const LEGACY = process.env.E2E_LEGACY_URL ?? 'http://srs.com'
const VENDOR_ID = '6985' // Francol Services LLC (empresa 79), solo Piecework
const VENDOR_NAME = 'Francol Services LLC'
const DEALER = 'AutoNation Land Rover Ft Lauderdale'
const MONTH = 'October 2026'

function money(text: string): number {
  return Number(text.replace(/[$,]/g, ''))
}

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
async function closing(page: Page): Promise<{ payroll: number; expenses: number; periods: string }> {
  // La segunda vez ya hay sesión de PRO y /login no muestra el formulario.
  await page.goto('/')
  if (new URL(page.url()).pathname.startsWith('/login')) await login(page)
  const reports = page.getByRole('button', { name: /^Reports$/ })
  const link = page.getByRole('link', { name: 'Monthly Closing', exact: true })
  // En celular, un clic en la hamburguesa antes de que la página termine de cargar se pierde: se reintenta.
  await expect(async () => {
    await openMobileMenuIfNeeded(page)
    await expect(reports.or(link).first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
  if (!(await link.isVisible().catch(() => false))) await reports.click()
  await link.click()
  await expect(page.getByRole('heading', { name: 'Monthly Closing' })).toBeVisible()

  const openFilters = page.getByRole('button', { name: 'Open filters' })
  const mobile = await openFilters.isVisible()
  if (mobile) await openFilters.click()
  const scope = mobile ? page.getByRole('dialog') : page.locator('header')
  const dealers = scope.getByRole('combobox').filter({ hasText: /Dealers/ })
  if (!(await dealers.innerText()).includes('All Dealers')) {
    await dealers.click()
    await page.getByRole('button', { name: /^All Dealers$/ }).click()
    await page.keyboard.press('Escape')
  }
  await scope.getByRole('combobox').filter({ hasText: /\b20\d\d\b|month/i }).click()
  await page.locator('[cmdk-input]').last().fill(MONTH)
  await page.getByRole('option', { name: MONTH, exact: true }).click()
  if (mobile) await page.getByRole('button', { name: 'Apply' }).click()
  const periodsLine = page.locator('main').getByText(/^Pay periods: /)
  await expect(periodsLine).toBeVisible({ timeout: 90_000 })

  const row = page.locator('main tbody tr').filter({ hasText: DEALER })
  const cells = (await row.locator('td').allInnerTexts()).map((c) => c.trim())
  return { payroll: money(cells[2]), expenses: money(cells[3]), periods: (await periodsLine.innerText()).replace(/^Pay periods: /, '') }
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
    await form.locator('#exp-kind').click()
    await page.getByRole('option', { name: 'Piecework' }).click()
    await form.locator('[data-field="pieceworkVendorId"]').getByRole('combobox').click()
    await page.locator('[cmdk-input]').last().fill('Francol')
    await page.getByRole('option', { name: VENDOR_NAME }).click()
    await form.locator('#exp-date').fill('2026-10-31')

    // El texto de arriba de la tabla dice los mismos pay periods que el cierre de octubre (D5).
    await expect(form.getByTestId('piecework-periods')).toHaveText(`Work orders from pay periods ${before.periods}`, { timeout: 60_000 })
    const rows = form.locator('tbody tr').filter({ hasText: DEALER })
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })
    await rows.nth(0).getByRole('checkbox').click()
    await rows.nth(1).getByRole('checkbox').click()
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
