/**
 * Reunión con Juan 18/11, temas 1 y 9 (plans/plan-reunion-juan-18-11/PLAN.md, T4), el camino entero en 375×812 y
 * 1280×800. Contra http://pro.srs.com local con el usuario de `.env.e2e.local` (Admin o con 110/111/117/118).
 *
 * Tema 1: una regla mensual que empezó hace unos meses → se le cargan 2 dealers → Save abre «Past periods» con una
 * fila por período y dealer → «Generate N expenses» → los gastos del día 1 de este mes se ven en la lista → «Generate
 * past expenses» del menú ya no tiene nada que generar (confirmar dos veces no duplica).
 *
 * Tema 9: un gasto con un adjunto → «Duplicate» → Add Expense cargado con la fecha vacía (no deja grabar sin ella) y
 * «Copy attachments (1)» tildado → se elige la fecha y se graba → el gasto nuevo tiene su adjunto.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  login,
  noHorizontalScroll,
  filterExpensesByCompany,
  pickAllDealersAndDatePreset,
} from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const STAMP = `e2e-past-${Date.now()}`
const COMPANY = `${STAMP} Co`
const CATEGORY = `${STAMP} Cat`
const RULE = `${STAMP} rule`
const SINGLE = `${STAMP} single`

/** PNG de 1×1, para el adjunto. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Hoy en New York, `YYYY-MM-DD` (el corte que usan el Nest y el form). */
function todayNy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

/** El 15 de hace tres meses y cuántos días 1 hay entre esa fecha y ayer (las corridas pasadas de una regla mensual). */
function startAndPastRuns(): { start: string; runs: number } {
  const [y, m, d] = todayNy().split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1 - 3, 15))
  const ymd = (dt: Date) => dt.toISOString().slice(0, 10)
  const today = ymd(new Date(Date.UTC(y, m - 1, d)))
  let runs = 0
  for (let i = 1; i <= 3; i++) {
    const first = ymd(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)))
    if (first < today) runs++
  }
  return { start: ymd(start), runs }
}

async function pickCombobox(page: Page, fieldName: string, text: string, create = false) {
  await page.locator(`[data-field="${fieldName}"]`).getByRole('combobox').click()
  await page.locator('[cmdk-input]').last().fill(text)
  if (create) await page.getByRole('option', { name: `Create "${text}"` }).click()
  else await page.getByRole('option', { name: new RegExp(text, 'i') }).first().click()
}

async function pickDealers(page: Page, count: number, trigger: Locator) {
  await trigger.click()
  for (let i = 0; i < count; i++) await page.locator('[cmdk-item]').nth(i).click()
  await page.keyboard.press('Escape')
}

/** La lista pagina de a 25: se filtra por la compañía de este archivo. */
const filterByCompany = (page: Page) => filterExpensesByCompany(page, COMPANY)

async function rowActions(page: Page, text: string) {
  await page.getByRole('row').filter({ hasText: text }).first().getByRole('button', { name: 'Actions' }).click()
}

test.describe.serial('Expenses — past periods of a recurring expense and Duplicate (Juan 18/11, temas 1 y 9)', () => {
  const { start, runs } = startAndPastRuns()

  test('Recurring: a rule that started months ago generates its past periods once', async ({ page }) => {
    test.skip(runs === 0, 'Today is the 1st right after the start: no past run day.')
    await login(page)
    await page.goto('/expenses/recurring')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.locator('#rule-description').fill(RULE)
    await pickCombobox(page, 'company', COMPANY, true)
    await pickCombobox(page, 'category', CATEGORY, true)
    await page.locator('#rule-start').fill(start)
    await page.locator('#rule-split-fixed').click()
    await page.locator('#rule-amount').fill('100.00')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Rule saved.')).toBeVisible()

    // Sin dealers no hay nada que generar; con dealers, Save abre «Past periods».
    await pickDealers(page, 2, page.getByRole('combobox').filter({ hasText: 'Select dealers…' }))
    await page.getByRole('button', { name: 'Add dealers' }).click()
    await expect(page.locator('tr[data-assign]')).toHaveCount(2)
    await page.getByRole('button', { name: 'Save' }).click()

    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Past periods' }) })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(new RegExp(`the ${runs} past periods .*: ${runs * 2} expenses`))).toBeVisible()
    await expect(dialog.locator('tbody tr')).toHaveCount(runs * 2)
    await expect(dialog).toContainText(`$${(runs * 100).toFixed(2)}`)
    await noHorizontalScroll(page)
    await dialog.getByRole('button', { name: `Generate ${runs * 2} expenses` }).click()
    await expect(page.getByText(`${runs * 2} expenses generated, pending approval.`)).toBeVisible()
    // Al cerrarse «Past periods» se cierra también el modal de la regla (como todo form después de grabar).
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Grabar otra vez la regla, sin nada que generar: el modal se cierra.
    await page.getByRole('row').filter({ hasText: RULE }).first().getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Rule saved.').first()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Otra vez desde el menú: ya no queda nada (no duplica).
    await page.goto('/expenses/recurring')
    await rowActions(page, RULE)
    await page.getByRole('menuitem', { name: 'Generate past expenses' }).click()
    await expect(dialog.getByText('There are no past periods without an expense of this recurring expense.').first()).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Generate \d+ expenses$/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Skip' }).click()

    // El del día 1 de este mes, en la lista (dentro de «Last 30 days» salvo los primeros días del mes).
    const firstOfMonth = `${todayNy().slice(0, 8)}01`
    if (firstOfMonth < todayNy()) {
      await page.goto('/expenses')
      await pickAllDealersAndDatePreset(page, 'Last 30 days')
      await filterByCompany(page)
      await expect(page.getByRole('row').filter({ hasText: COMPANY })).toHaveCount(2)
    }
  })

  test('Duplicate: date left blank, attachments copied', async ({ page }) => {
    await login(page)
    await page.goto('/expenses')
    await pickAllDealersAndDatePreset(page, 'Last 30 days')

    // Un gasto con un adjunto.
    await page.getByRole('button', { name: 'Add Expense' }).click()
    await page.locator('[data-field="idDealer"] button[role="combobox"]').click()
    await page.locator('[cmdk-item]').first().click()
    await page.locator('#exp-total').fill('12.34')
    // La compañía y la categoría las crea la prueba anterior (salvo que se haya salteado).
    await pickCombobox(page, 'company', COMPANY, runs === 0)
    await pickCombobox(page, 'category', CATEGORY, runs === 0)
    await page.locator('#exp-description').fill(SINGLE)
    await page.locator('input[type="file"]').setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: PNG_1PX })
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Expense saved.')).toBeVisible()
    await filterByCompany(page)

    // Duplicate: el form cargado, la fecha vacía y el check de adjuntos.
    await rowActions(page, SINGLE)
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()
    const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Add Expense' }) })
    await expect(form.getByText(/^Copy of the expense of /)).toBeVisible()
    await expect(page.locator('#exp-total')).toHaveValue('12.34')
    await expect(page.locator('#exp-description')).toHaveValue(SINGLE)
    await expect(page.locator('#exp-date')).toHaveValue('')
    const copy = form.getByRole('checkbox')
    await expect(form.getByText('Copy attachments (1)')).toBeVisible()
    await expect(copy).toBeChecked()
    await noHorizontalScroll(page)

    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('#exp-date')).toBeFocused()
    await page.locator('#exp-date').fill(todayNy())
    await page.locator('#exp-description').fill(`${SINGLE} copy`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Expense saved.')).toBeVisible()

    // El gasto nuevo con su adjunto.
    await rowActions(page, `${SINGLE} copy`)
    await page.getByRole('menuitem', { name: 'Attachment' }).click()
    const attachments = page.getByRole('dialog')
    await expect(attachments.getByText(/\.(jpe?g|png)$/i).first()).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')
  })

  test('cleanup: delete what this file created (the past-period expenses older than 30 days stay)', async ({ page }) => {
    await login(page)
    await page.goto('/expenses')
    await pickAllDealersAndDatePreset(page, 'Last 30 days')
    await filterByCompany(page)
    for (;;) {
      const row = page.getByRole('row').filter({ hasText: COMPANY }).first()
      if (!(await row.isVisible().catch(() => false))) break
      await row.getByRole('button', { name: 'Actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await page.getByRole('button', { name: 'Yes, delete' }).click()
      await expect(page.getByText('Expense deleted.')).toBeVisible()
      await expect(page.getByText('Expense deleted.')).toBeHidden()
    }
    // La regla existe (la crea la primera prueba): se espera a que la tabla la traiga. Con `isVisible()` solo, la tabla
    // todavía cargaba y la regla quedaba sin borrar.
    if (runs > 0) {
      await page.goto('/expenses/recurring')
      const rule = page.getByRole('row').filter({ hasText: RULE }).first()
      await expect(rule).toBeVisible({ timeout: 30_000 })
      await rule.getByRole('button', { name: 'Actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await page.getByRole('button', { name: 'Yes, delete' }).click()
      await expect(page.getByText('Rule deleted.')).toBeVisible()
      await expect(page.getByRole('row').filter({ hasText: RULE })).toHaveCount(0)
    }
  })
})
