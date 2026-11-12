/**
 * Etapa 1 del plan de buenas prácticas (plans/plan-buenas-practicas-v0, 1.3 a 1.6): el camino entero, en 375×812 y
 * 1280×800 (los dos proyectos de playwright.config.ts, Chromium de Playwright). Contra http://pro.srs.com local con el
 * usuario de `.env.e2e.local` (Admin o «Reports › Production Report»).
 *
 * Lo que recorre, con el sistema operativo en modo oscuro: menú sin las pantallas de muestra → Business KPIs, cada
 * solapa trae su gráfico (recharts se baja al abrirla) → Income by Dealer → Export «Income by dealer» (exceljs se baja
 * al exportar): el archivo abre con sus hojas y el aviso de éxito se ve en claro. En todo el camino la consola no
 * avisa de diálogos sin descripción ni de un `motion` fuera de `LazyMotion`.
 */
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, test, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, login, noHorizontalScroll, openMobileMenuIfNeeded } from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

/** Entradas del menú que salieron con las pantallas de muestra (1.3). */
const REMOVED_MENU = ['Schedule Violations', 'Overtime', 'Trends', 'Employee Ranking', 'Costs by Dealer', 'Data Table']

/** Lo que la consola no puede decir en ningún momento del camino. */
const FORBIDDEN_CONSOLE = [/Missing `Description` or `aria-describedby/, /LazyMotion/, /motion component/i]

function watchConsole(page: Page): string[] {
  const bad: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (FORBIDDEN_CONSOLE.some((re) => re.test(text))) bad.push(`${msg.type()}: ${text.slice(0, 200)}`)
  })
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message.slice(0, 200)}`))
  return bad
}

async function openMenuLink(page: Page, group: RegExp | null, name: string) {
  await openMobileMenuIfNeeded(page)
  const link = page.getByRole('link', { name, exact: true })
  if (group && !(await link.isVisible().catch(() => false))) await page.getByRole('button', { name: group }).click()
  await link.click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

/** All Dealers en el encabezado (compu) o en la hoja de filtros (celular), como monthly-closing.spec.ts. */
async function pickAllDealers(page: Page) {
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
  if (mobile) await page.getByRole('button', { name: 'Apply' }).click()
}

test.describe.serial('Etapa 1 — pantallas de muestra fuera y lo pesado al usarse', () => {
  test('menú, gráficos de Business KPIs, export con exceljs, avisos claros y consola limpia', async ({ page, isMobile }) => {
    test.setTimeout(360_000)
    await page.emulateMedia({ colorScheme: 'dark' })
    const bad = watchConsole(page)
    await login(page)

    // 1. El menú ya no tiene las pantallas de muestra.
    await openMobileMenuIfNeeded(page)
    const nav = page.locator('aside, [role="dialog"]').first()
    for (const name of REMOVED_MENU) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0)
    }
    if (isMobile) {
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
    }

    // 2. Business KPIs: cada solapa con gráfico lo trae al abrirla.
    await openMenuLink(page, /^Reports$/, 'Business KPIs')
    const main = page.locator('main')
    const tabs = main.getByRole('tab')
    const count = await tabs.count()
    let charts = 0
    for (let i = 0; i < count; i += 1) {
      await tabs.nth(i).click()
      const panel = main.locator('[role="tabpanel"][data-state="active"]')
      await expect(panel).toBeVisible()
      // Las solapas con gráfico muestran el esqueleto y después el svg de recharts (o el «sin datos» del gráfico).
      const chart = panel.locator('svg.recharts-surface')
      if ((await chart.count()) > 0 || (await panel.locator('[aria-busy="true"]').count()) > 0) {
        await expect(chart.first()).toBeVisible({ timeout: 60_000 })
        charts += 1
      }
    }
    expect(charts, 'al menos una solapa con gráfico').toBeGreaterThan(0)
    if (isMobile) await noHorizontalScroll(page)

    // 3. Income by Dealer con All Dealers → Export «Income by dealer»: el archivo abre con exceljs.
    await openMenuLink(page, /^Reports$/, 'Income by Dealer')
    await pickAllDealers(page)
    const exportButton = main.getByRole('button', { name: 'Export' })
    await expect(exportButton).toBeEnabled({ timeout: 120_000 })
    await exportButton.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Income by dealer/ }).click()
    const download = page.waitForEvent('download', { timeout: 120_000 })
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^income-by-dealer-\d.*\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await readFile((await file.path())!))
    expect(wb.worksheets.map((w) => w.name)).toContain('Report Info')
    expect(wb.worksheets.length).toBeGreaterThan(1)

    // 4. El aviso de éxito, en claro aunque el sistema esté en oscuro (PRO no tiene tema oscuro).
    const toaster = page.locator('[data-sonner-toaster]')
    await expect(toaster).toHaveCount(1)
    await expect(toaster).toHaveAttribute('data-theme', 'light')

    // 5. Celular: la hoja de filtros (SheetContent sin descripción) abre sin aviso en la consola.
    if (isMobile) {
      await page.getByRole('button', { name: 'Open filters' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
    }

    expect(bad).toEqual([])
  })
})
