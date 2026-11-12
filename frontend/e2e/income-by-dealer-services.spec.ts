/**
 * Income by Dealer por servicio — el camino entero (plans/plan-income-by-dealer-por-servicio T6), en 375×812 y
 * 1280×800 (los dos proyectos de playwright.config.ts, Chromium de Playwright). Contra http://pro.srs.com local con el
 * usuario de `.env.e2e.local` (Admin o «Reports › Production Report»). El dealer se elige con E2E_INCOME_DEALER
 * (por defecto el de Auto Wax que usa monthly-closing.spec.ts).
 *
 * Lo que recorre: menú → Income by Dealer → un dealer y fechas en el encabezado → abre el dealer con la flecha: Work
 * Orders y «Total ‹dealer›» igual al Income de la fila → Vehicles ≤ Qty → cierra y abre sin otro pedido → con la fila
 * abierta prende y apaga «Filter by completion date» y la fila sigue abierta → «By year» 2026 → Export con las dos
 * tarjetas: «By dealer and service» (se abre con exceljs) e «Income by dealer» como hoy. En celular: ninguna celda fija,
 * el nombre del dealer entero y la página sin scroll de costado.
 */
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  login,
  noHorizontalScroll,
  openMobileMenuIfNeeded,
  pickDatePreset,
} from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const DEALER = process.env.E2E_INCOME_DEALER ?? 'AutoNation Lexus of Palm Beach'
const SERVICES_URL = /\/api\/srs-kpis\/kpis\/billing\/income-by-dealer\/services\?/

/** Abre el encabezado (compu) o la hoja de filtros (celular); devuelve dónde buscar y cómo cerrar. */
async function filtersScope(page: Page): Promise<{ scope: Locator; apply: () => Promise<void> }> {
  const openFilters = page.getByRole('button', { name: 'Open filters' })
  const mobile = await openFilters.isVisible()
  if (mobile) await openFilters.click()
  return {
    scope: mobile ? page.getByRole('dialog') : page.locator('header'),
    apply: async () => {
      if (!mobile) return
      await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
    },
  }
}

/** Un solo dealer en el combo de dealers. */
async function pickOneDealer(page: Page, scope: Locator, name: string) {
  // El combo de dealers dice «All Dealers», «N dealers» o el nombre del dealer elegido.
  const combo = scope.getByRole('combobox').filter({ hasText: new RegExp(`dealers|${name}`, 'i') }).first()
  await combo.click()
  const search = page.locator('[cmdk-input]').last()
  // Si están todos tildados, «All Dealers» los destilda; después se tilda el dealer.
  const all = page.getByRole('button', { name: /^All Dealers$/ })
  if ((await all.isVisible().catch(() => false)) && (await combo.innerText()).includes('All Dealers')) await all.click()
  await search.fill(name)
  await page.getByRole('option', { name, exact: true }).click()
  await page.keyboard.press('Escape')
}

async function openReport(page: Page) {
  await login(page)
  await openMobileMenuIfNeeded(page)
  const link = page.getByRole('link', { name: 'Income by Dealer', exact: true })
  if (!(await link.isVisible().catch(() => false))) await page.getByRole('button', { name: /^Reports$/ }).click()
  await link.click()
  await expect(page.getByRole('heading', { name: 'Income by Dealer' })).toBeVisible()
}

/** En celular: ninguna celda fija a un costado y el nombre del dealer entero. */
async function mobileTableRules(page: Page, isMobile: boolean) {
  if (!isMobile) return
  const pinned = await page.evaluate(
    () =>
      [...document.querySelectorAll('main td, main th')].filter((el) => {
        const s = getComputedStyle(el)
        return s.position === 'sticky' && (s.left !== 'auto' || s.right !== 'auto')
      }).length,
  )
  expect(pinned, 'no pinned column on a phone').toBe(0)
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll('main tbody td span, main [data-testid="income-dealer-services"] td')]
      .filter((s) => (s as HTMLElement).scrollWidth > (s as HTMLElement).clientWidth + 1)
      .map((s) => `${(s as HTMLElement).innerText.slice(0, 60)} [${(s as HTMLElement).className.slice(0, 80)}]`),
  )
  expect(cut, 'names are not cut with «…» on a phone').toEqual([])
  await noHorizontalScroll(page)
}

function dealerRow(main: Locator): Locator {
  return main.locator('tbody tr').filter({ has: main.page().getByRole('button', { name: /Show services|Hide services/ }) }).filter({ hasText: DEALER }).first()
}

async function rowIncome(row: Locator): Promise<string> {
  return (await row.locator('td').last().innerText()).trim()
}

async function totalDealer(main: Locator): Promise<string> {
  const text = await main.getByTestId('income-services-total-dealer').first().innerText()
  return /(-?\$[\d,]+\.\d{2})/.exec(text)?.[1] ?? 'no total'
}

test.describe.serial('Income by Dealer by service — full path', () => {
  test('open row, switches, by year and the two exports', async ({ page, isMobile }) => {
    await openReport(page)
    const main = page.locator('main')

    // 1. Un dealer y el mes pasado en el encabezado (el calendario se maneja con los atajos, no a mano).
    {
      const { scope, apply } = await filtersScope(page)
      const yearMode = scope.getByRole('switch', { name: 'By year' })
      if ((await yearMode.getAttribute('aria-checked')) === 'true') await yearMode.click()
      await pickOneDealer(page, scope, DEALER)
      await pickDatePreset(page, scope, 'Last Month')
      await apply()
    }

    // 2. La tabla carga; la flecha abre el dealer con Work Orders y «Total ‹dealer›» = Income de la fila.
    const row = dealerRow(main)
    await expect(row).toBeVisible()
    const firstOpen = page.waitForResponse(SERVICES_URL)
    await row.getByRole('button', { name: 'Show services' }).click()
    expect((await firstOpen).ok()).toBe(true)
    const services = main.getByTestId('income-dealer-services')
    await expect(services.getByText('Work Orders', { exact: true })).toBeVisible()
    expect(await totalDealer(main)).toBe(await rowIncome(row))
    expect(await main.getByTestId('income-services-total-dealer').innerText()).toContain(`Total ${DEALER}`)

    // 3. Total Work Orders: Vehicles ≤ Qty.
    const [, qty, vehicles] = (await services.getByTestId('income-services-total-wo').locator('td').allInnerTexts()).map(
      (c) => Number(c.replace(/[^\d.]/g, '')),
    )
    expect(vehicles).toBeLessThanOrEqual(qty)
    await mobileTableRules(page, isMobile)

    // 4. Cierra y abre sin otro pedido (la respuesta queda guardada).
    let calls = 0
    page.on('request', (r) => {
      if (SERVICES_URL.test(r.url())) calls += 1
    })
    await row.getByRole('button', { name: 'Hide services' }).click()
    await expect(services).toBeHidden()
    await row.getByRole('button', { name: 'Show services' }).click()
    await expect(main.getByTestId('income-dealer-services')).toBeVisible()
    expect(calls).toBe(0)

    // 4b. Con la fila abierta, «Filter by completion date»: sigue abierta y su total = el Income de la fila.
    const doneSwitch = main.getByRole('switch', { name: 'Filter by completion date' })
    const withDone = page.waitForResponse((r) => SERVICES_URL.test(r.url()) && r.url().includes('filterDateDone=true'), {
      timeout: 60_000,
    })
    await doneSwitch.click()
    await expect(row.getByRole('button', { name: 'Hide services' })).toBeVisible()
    // Recién con la respuesta nueva se compara: antes, los dos números son los de antes y daría igual sin probar nada.
    await withDone
    await expect(main.getByTestId('income-services-total-dealer')).toBeVisible({ timeout: 60_000 })
    await expect.poll(async () => (await totalDealer(main)) === (await rowIncome(row)), { timeout: 60_000 }).toBe(true)
    await doneSwitch.click()
    await expect(row.getByRole('button', { name: 'Hide services' })).toBeVisible()
    await expect.poll(async () => (await totalDealer(main)) === (await rowIncome(row)), { timeout: 60_000 }).toBe(true)

    // 4c. «By year» con 2026: abre el mismo dealer y su total es el de la fila.
    {
      const { scope, apply } = await filtersScope(page)
      await scope.getByRole('switch', { name: 'By year' }).click()
      const years = scope.getByRole('combobox').filter({ hasText: /years|20\d\d|Select years/i }).last()
      // Al prender «By year» ya se marcan los años del rango (Last Month → 2026): tocar 2026 otra vez lo destildaba.
      if ((await years.innerText()).trim() !== '2026') {
        await years.click()
        await page.locator('[cmdk-input]').last().fill('2026')
        await page.getByRole('option', { name: '2026', exact: true }).click()
        await page.keyboard.press('Escape')
      }
      await expect(years).toHaveText('2026')
      await apply()
    }
    const yearRow = dealerRow(main)
    await expect(main.getByText('2026 YTD', { exact: true }).first()).toBeVisible()
    await yearRow.getByRole('button', { name: 'Show services' }).click()
    await expect.poll(async () => (await totalDealer(main)) === (await rowIncome(yearRow)), { timeout: 60_000 }).toBe(true)

    // 5. Export → las dos tarjetas → «By dealer and service».
    await main.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: /^Income by dealer/ })).toBeVisible()
    await dialog.getByRole('button', { name: /^By dealer and service/ }).click()
    const download = page.waitForEvent('download', { timeout: 120_000 })
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^income-by-dealer-and-service-.*\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await readFile((await file.path())!))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', '2026 YTD', 'Vehicles'])
    const summary: unknown[][] = []
    wb.getWorksheet('Summary')!.eachRow((r) => summary.push((r.values as unknown[]).slice(1)))
    const screenIncome = Number((await rowIncome(yearRow)).replace(/[$,]/g, ''))
    expect(summary.find((r) => r[0] === DEALER)?.[5]).toBe(screenIncome)
    const total = summary.find((r) => String(r[0]).startsWith('Total 2026'))!
    const dealersRows = summary.filter((r) => r[0] !== 'Dealer' && typeof r[2] === 'number' && !String(r[0]).startsWith('Total'))
    expect(Number(total[2])).toBeLessThanOrEqual(dealersRows.reduce((a, r) => a + Number(r[2]), 0))
    expect(summary.find((r) => r[0] === 'Grand Total')?.slice(1, 3)).toEqual(['', ''])

    // 6. Export → «Income by dealer», como hoy.
    await main.getByRole('button', { name: 'Export' }).click()
    await dialog.getByRole('button', { name: /^Income by dealer/ }).click()
    const today = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    expect((await today).suggestedFilename()).toMatch(/^income-by-dealer-\d.*\.xlsx$/)

    // 7. Celular: nada fijo, nada cortado, sin scroll de costado.
    await mobileTableRules(page, isMobile)
  })
})
