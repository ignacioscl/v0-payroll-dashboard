/**
 * Monthly Closing y Window Tint Closing — el camino entero (plans/plan-monthly-closing T7 y plans/plan-reporte-tint
 * T6), en 375×812 y 1280×800 (los dos proyectos de playwright.config.ts). Contra http://pro.srs.com local, con un
 * usuario de Auto Wax de `.env.e2e.local` que tenga «Los de Monthly Closing» (o Admin).
 *
 * Lo que recorre: menú → el reporte → All Dealers y el mes en el encabezado → la tabla con Total, Without dealer y la
 * línea de quincenas → el cartel de ayuda → el detalle de un dealer, donde cada solapa suma lo mismo que su columna
 * en la fila → Without dealer abre solo Payroll → Export baja el Excel con el nombre del reporte y el mes. En celular:
 * ninguna columna fija, el nombre del dealer entero (sin «…») y la página sin scroll de costado.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  login,
  noHorizontalScroll,
  openMobileMenuIfNeeded,
} from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

/** All Dealers y el mes, en el encabezado (compu) o en la hoja de filtros (celular). */
async function pickDealersAndMonth(page: Page, month: string) {
  const openFilters = page.getByRole('button', { name: 'Open filters' })
  const mobile = await openFilters.isVisible()
  if (mobile) await openFilters.click()
  const scope = mobile ? page.getByRole('dialog') : page.locator('header')

  const dealers = scope.getByRole('combobox').filter({ hasText: /Dealers/ })
  await expect(dealers).toBeVisible()
  if (!(await dealers.innerText()).includes('All Dealers')) {
    await dealers.click()
    // «All Dealers» es un botón arriba de la lista, no una opción (igual que en income-by-dealer-services.spec.ts).
    await page.getByRole('button', { name: /^All Dealers$/ }).click()
    await page.keyboard.press('Escape')
  }

  await scope.getByRole('combobox').filter({ hasText: /\b20\d\d\b|month/i }).click()
  await page.locator('[cmdk-input]').last().fill(month)
  await page.getByRole('option', { name: month, exact: true }).click()

  if (mobile) await page.getByRole('button', { name: 'Apply' }).click()
}

/**
 * Espera los datos del reporte: la línea de quincenas sale recién con la respuesta. Con All Dealers la consulta de lo
 * facturado (srs-kpi-billed-lines.ts) tarda ~10-30 s contra la copia local de PROD, más que los 15 s de cada `expect`
 * (tarea `monthly-closing-lento-local`, 12/11/2026). La fila de «cargando» también es un `tbody tr`: no sirve de señal.
 */
async function waitForClosingData(page: Page) {
  await expect(page.locator('main').getByText(/^Pay periods: /)).toBeVisible({ timeout: 90_000 })
}

async function openReport(page: Page, menuLabel: string) {
  await login(page)
  await openMobileMenuIfNeeded(page)
  const reports = page.getByRole('button', { name: /^Reports$/ })
  const link = page.getByRole('link', { name: menuLabel, exact: true })
  if (!(await link.isVisible().catch(() => false))) await reports.click()
  await link.click()
  await expect(page.getByRole('heading', { name: menuLabel })).toBeVisible()
}

/** El importe del Total de la solapa activa del detalle. */
async function tabTotal(dialog: Locator): Promise<string> {
  const text = await dialog.locator('[role="tabpanel"][data-state="active"]').innerText()
  return /Total\s+(-?\$[\d,]+\.\d{2})/.exec(text)?.[1] ?? 'no total'
}

async function openTab(dialog: Locator, name: string) {
  await dialog.getByRole('tab', { name }).click()
  // Cargado: con líneas trae «Total $…» (no alcanza la palabra sola: la tabla vacía mientras carga ya la tiene en los
  // encabezados); sin líneas, «No … in this month.».
  await expect(dialog.locator('[role="tabpanel"][data-state="active"]')).toContainText(
    /Total\s*-?\$[\d,]+\.\d{2}|No \w+ in this month/,
  )
}

/** En celular: ninguna celda fija a un costado y el nombre del dealer entero. */
async function mobileTableRules(page: Page, isMobile: boolean) {
  if (!isMobile) return
  const pinnedCells = await page.evaluate(
    () =>
      [...document.querySelectorAll('main td, main th')].filter((el) => {
        const s = getComputedStyle(el)
        return s.position === 'sticky' && (s.left !== 'auto' || s.right !== 'auto')
      }).length,
  )
  expect(pinnedCells, 'no pinned column on a phone').toBe(0)
  const cutNames = await page.evaluate(
    () =>
      [...document.querySelectorAll('main tbody tr td:first-child span')].filter(
        (s) => (s as HTMLElement).scrollWidth > (s as HTMLElement).clientWidth,
      ).length,
  )
  expect(cutNames, 'dealer names are not cut with «…» on a phone').toBe(0)
  await noHorizontalScroll(page)
}

test.describe.serial('Monthly Closing — full path', () => {
  test('table, help, dealer detail, Without dealer and Excel', async ({ page, isMobile }) => {
    await openReport(page, 'Monthly Closing')
    await pickDealersAndMonth(page, 'September 2026')
    await waitForClosingData(page)

    const main = page.locator('main')
    await expect(main.getByText('September 2026', { exact: false }).first()).toBeVisible()
    const rows = main.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    await expect(main.getByText(/^Pay periods: /)).toBeVisible()
    await expect(main.getByText('Total', { exact: true })).toBeVisible()
    await mobileTableRules(page, isMobile)

    await main.getByRole('button', { name: 'What each number counts' }).click()
    await expect(page.getByText(/^Expenses: every expense dated in the month/)).toBeVisible()
    await page.keyboard.press('Escape')

    // Detalle: cada solapa suma lo mismo que su columna en la fila (Dealer, Income, Payroll, Expenses, …).
    const row = rows.filter({ hasText: 'AutoNation Lexus of Palm Beach' })
    const [dealer, income, payroll, expenses] = (await row.locator('td').allInnerTexts()).map((c) => c.trim())
    await row.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: `${dealer} — September 2026` })).toBeVisible()
    await openTab(dialog, 'Income')
    expect(await tabTotal(dialog)).toBe(income)
    await openTab(dialog, 'Payroll')
    expect(await tabTotal(dialog)).toBe(payroll)
    await openTab(dialog, 'Expenses')
    if (expenses !== '$0.00') expect(await tabTotal(dialog)).toBe(expenses)
    await noHorizontalScroll(page)
    await dialog.getByRole('button', { name: 'Close' }).last().click()
    await expect(dialog).toBeHidden()

    const withoutDealer = main.getByRole('button', { name: /^Without dealer/ })
    if (await withoutDealer.isVisible()) {
      await withoutDealer.click()
      await expect(dialog.getByRole('tab')).toHaveCount(1)
      await expect(dialog.getByRole('tab', { name: 'Payroll' })).toBeVisible()
      await page.keyboard.press('Escape')
    }

    const download = page.waitForEvent('download')
    await main.getByRole('button', { name: 'Export' }).click()
    expect((await download).suggestedFilename()).toMatch(/^Monthly Closing 09-2026.*\.xlsx$/)
  })

  /**
   * plans/plan-window-tint-closing-tint-y-servicios P9: el dealer con servicios sin «tint» en rojo con ⚠ y la nota →
   * su detalle: Income con filas en rojo y By service con el mismo total que la fila → cerrar → Export.
   */
  test('Window Tint Closing: dealers in red, the note, By service in the detail and the Excel', async ({ page, isMobile }) => {
    await openReport(page, 'Window Tint Closing')
    await pickDealersAndMonth(page, 'October 2026')
    await waitForClosingData(page)

    const main = page.locator('main')
    await expect(main.getByRole('columnheader', { name: /Vehicles/i })).toBeVisible()
    await expect(main.getByRole('columnheader', { name: /Accident/i })).toHaveCount(0)
    await mobileTableRules(page, isMobile)

    await main.getByRole('button', { name: 'What each column counts' }).click()
    await expect(page.locator('[data-radix-popper-content-wrapper] li')).toHaveCount(7)
    await expect(page.getByText(/^Income: every service of the month's work orders assigned to a tinter/)).toBeVisible()
    await page.keyboard.press('Escape')

    // Fila en rojo con ⚠ y la nota debajo de la tabla.
    const redRow = main.locator('tbody tr').filter({ has: page.getByTestId('monthly-closing-non-tint-icon') }).first()
    await expect(redRow).toBeVisible()
    await expect(main.getByTestId('monthly-closing-non-tint-dealers-note')).toHaveText(
      'Dealers in red include services without «tint» in their name, from work orders assigned to tinters. Click the dealer to see them.',
    )
    const [dealer, , income] = (await redRow.locator('td').allInnerTexts()).map((c) => c.trim())
    await redRow.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: `${dealer} — October 2026` })).toBeVisible()
    await expect(dialog.getByRole('tab')).toHaveText(['Income', 'By service', 'Payroll', 'Expenses'])

    await openTab(dialog, 'Income')
    expect(await tabTotal(dialog)).toBe(income)
    const activePanel = dialog.locator('[role="tabpanel"][data-state="active"]')
    await expect(activePanel.locator('tbody tr.text-destructive').first()).toBeVisible()
    await expect(activePanel.getByTestId('monthly-closing-non-tint-rows-note')).toBeVisible()
    // «Rows in red first»: la primera fila pasa a ser una en rojo, y el total no cambia.
    await activePanel.getByRole('switch', { name: 'Rows in red first' }).click()
    await expect(activePanel.locator('tbody tr').first()).toHaveClass(/text-destructive/)
    expect(await tabTotal(dialog)).toBe(income)

    await openTab(dialog, 'By service')
    await expect(activePanel.getByRole('columnheader')).toHaveText([/Department/, /Service/, /Vehicles/, /Amount/])
    expect(await tabTotal(dialog)).toBe(income)
    await expect(activePanel.locator('tbody tr.text-destructive').first()).toBeVisible()
    await expect(activePanel.getByTestId('monthly-closing-non-tint-rows-note')).toBeVisible()
    await noHorizontalScroll(page)
    await dialog.getByRole('button', { name: 'Close' }).last().click()
    await expect(dialog).toBeHidden()

    const download = page.waitForEvent('download')
    await main.getByRole('button', { name: 'Export' }).click()
    expect((await download).suggestedFilename()).toMatch(/^Window Tint Closing 10-2026.*\.xlsx$/)
  })
})
