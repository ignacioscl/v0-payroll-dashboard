/**
 * Expenses en Pro — el camino entero de F7 (plans/plan-expenses-pro/PLAN.md, T10.7), en 375×812 y
 * 1280×800 (los dos proyectos de playwright.config.ts). Contra http://pro.srs.com local, con un
 * usuario de Auto Wax de `.env.e2e.local` (E2E_USER / E2E_PASSWORD; Admin o con 110/111/117/118).
 *
 * Lo que recorre: menú → lista → Add Expense single con un campo faltante (la pantalla va al primer
 * campo con error y queda con el foco) → grupo By percentage con «Use a recurring expense's split»
 * → la lista muestra «All dealers» y expandido N filas → Analytics da el mismo Total → Recurring:
 * alta, Add dealers, cambiar un porcentaje sin que el scroll se mueva y con el foco en el campo
 * siguiente, un porcentaje rechazado vuelve al valor grabado con el error debajo, Export dealers
 * (archivo con la hoja Dealers) → Settings muestra la última categoría de la compañía usada → Add
 * Expense la precarga. Al final borra lo creado: el grupo se borra, se restaura desde «Show deleted»
 * (Restore de la fila de grupo) y se vuelve a borrar. Sin scroll horizontal de la página en 375.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  login,
  noHorizontalScroll,
  openMobileMenuIfNeeded,
  pickDatePreset,
} from './helpers'

/** «Show deleted» vive en el panel de filtros, que arranca cerrado. */
async function clickShowDeleted(page: Page) {
  const toggle = page.locator('#exp-show-deleted')
  if (!(await toggle.isVisible())) await page.getByRole('button', { name: /^Filters/ }).click()
  await toggle.click()
}

const STAMP = `e2e-${Date.now()}`
const COMPANY = `${STAMP} Co`
const CATEGORY = `${STAMP} Cat`
const RULE = `${STAMP} rule`

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

async function pickCombobox(page: Page, fieldName: string, text: string, create = false) {
  const field = page.locator(`[data-field="${fieldName}"]`)
  await field.getByRole('combobox').click()
  const input = page.locator('[cmdk-input]').last()
  await input.fill(text)
  if (create) {
    await page.getByRole('option', { name: `Create "${text}"` }).click()
  } else {
    await page.getByRole('option', { name: new RegExp(text, 'i') }).first().click()
  }
}

/**
 * Marca los primeros `count` dealers del combo. Por defecto, el de «Multiple dealers» del alta de gasto; en una regla
 * recurrente el combo no es un campo del form (recurring-dealers-table.tsx) y se pasa el suyo.
 */
async function pickDealers(page: Page, count: number, trigger?: Locator): Promise<string[]> {
  await (trigger ?? page.locator('[data-field="branchIds"] button[role="combobox"]')).click()
  const items = page.locator('[cmdk-item]')
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    const item = items.nth(i)
    names.push((await item.innerText()).trim())
    await item.click()
  }
  await page.keyboard.press('Escape')
  return names
}

/** All Dealers y «Last 30 days» en el encabezado (compu) o en la hoja de filtros (celular). */
async function pickAllDealersAndLast30Days(page: Page) {
  const openFilters = page.getByRole('button', { name: 'Open filters' })
  const mobile = await openFilters.isVisible()
  if (mobile) await openFilters.click()
  const scope = mobile ? page.getByRole('dialog') : page.locator('header')
  const dealers = scope.getByRole('combobox').filter({ hasText: /Dealers/ })
  await expect(dealers).toBeVisible()
  if (!(await dealers.innerText()).includes('All Dealers')) {
    await dealers.click()
    await page.getByRole('button', { name: /^All Dealers$/ }).click()
    await page.keyboard.press('Escape')
  }
  await pickDatePreset(page, scope, 'Last 30 days')
  if (mobile) {
    await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  }
}

test.describe.serial('Expenses — full path (F7)', () => {
  let groupTotal = ''

  test('menu → Expenses List', async ({ page }) => {
    await login(page)
    await openMobileMenuIfNeeded(page)
    await page.getByRole('button', { name: 'Expenses', exact: true }).click()
    await page.getByRole('link', { name: 'Expenses List', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Expenses List' })).toBeVisible()
    await expect(page.getByText('Total Expenses')).toBeVisible()
    await noHorizontalScroll(page)
  })

  test('Add rule: the empty Description gets the focus (not the page <meta name="description">)', async ({ page }) => {
    await login(page)
    await page.goto('/expenses/recurring')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await expect(page.getByRole('heading', { name: 'Add rule' })).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter a description.')).toBeVisible()
    await expect(page.locator('#rule-description')).toBeFocused()
  })

  test('Add Expense single: a missing field gets focus and the screen scrolls to it', async ({ page }) => {
    await login(page)
    await page.goto('/expenses')
    await page.getByRole('button', { name: 'Add Expense' }).click()
    await expect(page.getByRole('heading', { name: 'Add Expense' })).toBeVisible()
    // Dealers va primero (mail de Juan «Temas», 04/11): con el dealer elegido, el primer campo con error es Company.
    await page.locator('[data-field="idDealer"] button[role="combobox"]').click()
    await page.locator('[cmdk-item]').first().click()
    await page.locator('#exp-total').fill('10.50')
    // Modal: encabezado y pie fijos, scrollea solo el cuerpo.
    await page.locator('[data-slot="form-dialog-body"]').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(page.getByRole('heading', { name: 'Add Expense' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Save' })).toBeInViewport()
    // El botón flotante «volver arriba» no puede tapar Save con la página scrolleada.
    const saveBox = await page.getByRole('button', { name: 'Save' }).boundingBox()
    const saveHit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.innerText.trim() ?? '',
      [saveBox!.x + saveBox!.width / 2, saveBox!.y + saveBox!.height / 2],
    )
    expect(saveHit).toBe('Save')
    // Company empty → submit → the first invalid field in DOM order (Company) is focused and visible.
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Choose a company.')).toBeVisible()
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
    const inField = await focused.evaluate((el) => Boolean(el.closest('[data-field="company"]')))
    expect(inField).toBe(true)
    await expect(focused).toBeInViewport({ ratio: 1 })

    await pickCombobox(page, 'company', COMPANY, true)
    await pickCombobox(page, 'category', CATEGORY, true)
    await page.locator('#exp-description').fill(`${STAMP} single`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Expense saved.')).toBeVisible()
    await expect(page).toHaveURL(/\/expenses(\?|$)/)
    await noHorizontalScroll(page)
  })

  test('Recurring: add rule, add dealers, edit a percent in place, rejected percent returns, export', async ({ page }) => {
    await login(page)
    await page.goto('/expenses/recurring')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.locator('#rule-description').fill(RULE)
    await pickCombobox(page, 'company', COMPANY)
    await pickCombobox(page, 'category', CATEGORY)
    // By percent: switch off «Split by fixed amount», set the Amount.
    await page.locator('#rule-split-fixed').click()
    await page.locator('#rule-amount').fill('100.00')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Rule saved.')).toBeVisible()

    // Un combobox no toma el nombre de su texto: se busca por lo que muestra.
    await pickDealers(page, 3, page.getByRole('combobox').filter({ hasText: 'Select dealers…' }))
    await page.getByRole('button', { name: 'Add dealers' }).click()
    const rows = page.locator('tr[data-assign]')
    await expect(rows).toHaveCount(3)

    // Every dealer enters Automatic: switch the first one to Manual (confirm dialog, no reload).
    await rows.nth(0).getByRole('switch').click()
    await page.getByRole('button', { name: 'Yes, change it' }).click()
    await expect(rows.nth(0).getByText('Manual')).toBeVisible()

    // Change its percent: scroll does not move and the focus goes to the next field.
    const firstInput = rows.nth(0).getByRole('textbox')
    await firstInput.scrollIntoViewIfNeeded()
    const body = page.locator('[data-slot="form-dialog-body"]')
    const scrollBefore = await body.evaluate((el) => el.scrollTop)
    await firstInput.fill('50')
    await page.keyboard.press('Tab')
    await expect(rows.nth(0).getByRole('textbox')).toHaveValue('50.00')
    // Automatic ones recalculated in place: 25.00 each.
    await expect(rows.nth(1).getByRole('textbox')).toHaveValue('25.00')
    const scrollAfter = await body.evaluate((el) => el.scrollTop)
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(2)
    const focusedAssign = await page.locator(':focus').evaluate((el) => el.closest('tr')?.getAttribute('data-assign') ?? '')
    // El foco sigue en la tabla (el control siguiente), no se pierde en el body mientras se graba.
    expect(focusedAssign).not.toBe('')

    // A rejected percent (over 100) returns to the saved value with the error under the field.
    await rows.nth(0).getByRole('textbox').fill('150')
    await page.keyboard.press('Enter')
    await expect(rows.nth(0).getByText('Enter a percent between 0 and 100 (up to 2 decimals).')).toBeVisible()
    await expect(rows.nth(0).getByRole('textbox')).toHaveValue('50.00')

    // Export dealers: an .xlsx with the Dealers sheet.
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export dealers' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/)
    await noHorizontalScroll(page)
  })

  test('Add Expense By amount: amounts typed by hand keep the cents and the Total adds what was entered', async ({ page }) => {
    // Mail de Juan (04/11): «75» quedaba sin centavos y, con un dealer sin monto, el Total mostraba «—».
    await login(page)
    await page.goto('/expenses')
    await page.getByRole('button', { name: 'Add Expense' }).click()
    await expect(page.getByRole('heading', { name: 'Add Expense' })).toBeVisible()
    // Dealers va antes que los datos del gasto, con el empleado junto al dealer.
    const dealerTop = await page.getByText('Assign to employee').boundingBox()
    const dateTop = await page.getByText('Receipt date').boundingBox()
    expect(dealerTop!.y).toBeLessThan(dateTop!.y)

    await page.getByRole('button', { name: /Multiple dealers/ }).click()
    const [, second, third] = await pickDealers(page, 3)
    await page.locator('#exp-total').fill('450')
    await page.locator('#exp-total').blur()
    await expect(page.locator('#exp-total')).toHaveValue('450.00')
    await page.getByRole('button', { name: /By amount/ }).click()

    await page.getByRole('textbox', { name: `${second} Amount` }).fill('75')
    await page.getByRole('textbox', { name: `${third} Amount` }).fill('')
    await page.getByRole('textbox', { name: `${third} Amount` }).blur()
    await expect(page.getByRole('textbox', { name: `${second} Amount` })).toHaveValue('75.00')
    const foot = page.locator('form#expense-form tfoot')
    await expect(foot).toContainText('$225.00')
    await expect(foot).toContainText('1 dealer(s) without amount')

    await page.getByRole('textbox', { name: `${third} Amount` }).fill('140')
    await page.getByRole('textbox', { name: `${third} Amount` }).blur()
    await expect(foot).toContainText('$365.00')
    await expect(foot).not.toContainText('without amount')

    // Con dealers elegidos, la lista de empleados se ve entera sin tipear.
    await page.locator('[data-field="author"]').getByRole('combobox').click()
    await expect(page.locator('[cmdk-item]').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await noHorizontalScroll(page)
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('Add Expense: Multiple dealers By percentage from the rule → list shows «All dealers»', async ({ page }) => {
    await login(page)
    await page.goto('/expenses/recurring')
    await page.getByRole('row').filter({ hasText: RULE }).first().getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Generate expense from this recurring expense' }).click()
    await expect(page.getByRole('heading', { name: 'Add Expense' })).toBeVisible()
    // Preloaded from the rule: By percentage selected, 3 dealers, company and category.
    await expect(page.getByRole('button', { name: /By percentage/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-field="company"]')).toContainText(COMPANY)
    await page.locator('#exp-total').fill('100.00')
    await page.locator('#exp-description').fill(`${STAMP} group`)
    groupTotal = '$100.00'
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Expense saved.')).toBeVisible()
    await page.goto('/expenses')

    const groupRow = page.getByRole('row').filter({ hasText: `${STAMP} group` }).first()
    await expect(groupRow.getByText(/All dealers \(3\)/)).toBeVisible()
    await groupRow.getByRole('button', { name: 'Show dealers' }).click()
    await expect(page.locator('table table tbody tr')).toHaveCount(3)
    await noHorizontalScroll(page)
  })

  test('Analytics shows the same Total as the list, and a row filters the list', async ({ page }) => {
    await login(page)
    await page.goto('/expenses')
    // Analytics lee los dealers y las fechas del encabezado: All Dealers y «Last 30 days», que incluye hoy (la fecha
    // de los gastos que crea este archivo). Sin eso el test dependía de lo que hubiera quedado en la cookie y del día.
    // Las fechas no se guardan: de acá en adelante se navega por el menú, sin recargar.
    await pickAllDealersAndLast30Days(page)
    const listTotal = (await page.getByText('Total Expenses').locator('..').locator('..').innerText()).trim()
    await openMobileMenuIfNeeded(page)
    const analyticsLink = page.getByRole('link', { name: 'Analytics', exact: true })
    if (!(await analyticsLink.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Expenses', exact: true }).click()
    }
    await analyticsLink.click()
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: CATEGORY }).first()).toBeVisible()
    const analyticsTotal = (await page.getByText('Total Expenses').locator('..').locator('..').innerText()).trim()
    const money = (s: string) => /\$[\d,]+\.\d{2}/.exec(s)?.[0]
    expect(money(analyticsTotal)).toBe(money(listTotal))
    await page.getByRole('row').filter({ hasText: CATEGORY }).first().click()
    await expect(page).toHaveURL(/\/expenses/)
    await expect(page.getByRole('row').filter({ hasText: `${STAMP} group` }).first()).toBeVisible()
    expect(groupTotal).toBeTruthy()
    await noHorizontalScroll(page)
  })

  test('Settings shows the last category of the company and Add Expense preloads it', async ({ page }) => {
    await login(page)
    await page.goto('/expenses/settings')
    await page.getByRole('tab', { name: 'Companies' }).click()
    await page.getByPlaceholder(/search/i).fill(COMPANY)
    const row = page.getByRole('row').filter({ hasText: COMPANY }).first()
    await expect(row).toContainText(CATEGORY)

    await page.goto('/expenses')
    await page.getByRole('button', { name: 'Add Expense' }).click()
    await pickCombobox(page, 'company', COMPANY)
    await expect(page.locator('[data-field="category"]')).toContainText(CATEGORY)
    await noHorizontalScroll(page)
  })

  test('cleanup: delete the group, restore it from «Show deleted», delete everything', async ({ page }) => {
    await login(page)
    await page.goto('/expenses')
    const deleteRow = async (text: string): Promise<boolean> => {
      const row = page.getByRole('row').filter({ hasText: text }).first()
      if (!(await row.isVisible().catch(() => false))) return false
      await row.getByRole('button', { name: 'Actions' }).click()
      await page.getByRole('menuitem', { name: 'Delete' }).click()
      await page.getByRole('button', { name: 'Yes, delete' }).click()
      await expect(page.getByText('Expense deleted.')).toBeVisible()
      return true
    }

    // The group: delete → Show deleted → Restore (group row, with its confirmation) → delete again.
    if (await deleteRow(`${STAMP} group`)) {
      await clickShowDeleted(page)
      const deleted = page.getByRole('row').filter({ hasText: `${STAMP} group` }).first()
      await expect(deleted).toBeVisible()
      await deleted.getByRole('button', { name: 'Actions' }).click()
      await page.getByRole('menuitem', { name: 'Restore' }).click()
      await expect(page.getByText(/Restore this expense in all \d+ dealers\?/)).toBeVisible()
      await page.getByRole('button', { name: 'Yes, restore' }).click()
      await expect(page.getByText('Expense restored.')).toBeVisible()
      await clickShowDeleted(page)
      await deleteRow(`${STAMP} group`)
    }
    await deleteRow(`${STAMP} single`)
    {
      await page.goto('/expenses/recurring')
      const row = page.getByRole('row').filter({ hasText: RULE }).first()
      if (await row.isVisible().catch(() => false)) {
        await row.getByRole('button', { name: 'Actions' }).click()
        await page.getByRole('menuitem', { name: 'Delete' }).click()
        await page.getByRole('button', { name: 'Yes, delete' }).click()
        await expect(page.getByText('Rule deleted.')).toBeVisible()
      }
    }
    await page.goto('/expenses/settings')
    for (const [tab, name] of [
      ['Companies', COMPANY],
      ['Categories', CATEGORY],
    ] as const) {
      await page.getByRole('tab', { name: tab }).click()
      await page.getByPlaceholder(/search/i).fill(name)
      const row = page.getByRole('row').filter({ hasText: name }).first()
      if (await row.isVisible().catch(() => false)) {
        await row.getByRole('switch').click()
        await page.getByRole('button', { name: 'Yes, change it' }).click()
      }
    }
  })
})
