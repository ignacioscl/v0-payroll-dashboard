/**
 * Lo común de los e2e de SRS Suite Pro: el usuario de `.env.e2e.local` (E2E_USER / E2E_PASSWORD), el login y
 * los chequeos de pantalla que repiten todos los caminos.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'

function loadEnv(): Record<string, string> {
  const file = resolve(__dirname, '../.env.e2e.local')
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnv(), ...process.env }
export const E2E_USER = env.E2E_USER ?? ''
export const E2E_PASSWORD = env.E2E_PASSWORD ?? ''
export const E2E_MISSING_USER = !E2E_USER || !E2E_PASSWORD
export const E2E_MISSING_USER_REASON = 'Set E2E_USER and E2E_PASSWORD in frontend/.env.e2e.local'

/**
 * Un usuario con permiso de Expenses y de Closing (o Admin) de una empresa SIN los checks «Expenses» y «Window Tint
 * Closing» (p. ej. Mooi), para company-modules.spec.ts.
 */
export const E2E_USER_NO_MODULES = env.E2E_USER_NO_MODULES ?? ''
export const E2E_PASSWORD_NO_MODULES = env.E2E_PASSWORD_NO_MODULES ?? ''
export const E2E_MISSING_USER_NO_MODULES = !E2E_USER_NO_MODULES || !E2E_PASSWORD_NO_MODULES
export const E2E_MISSING_USER_NO_MODULES_REASON =
  'Set E2E_USER_NO_MODULES and E2E_PASSWORD_NO_MODULES in frontend/.env.e2e.local'

/**
 * Un usuario de Auto Wax que NO es admin, con un rol propio (sin template) que solo tiene Punch Report, para
 * report-permissions.spec.ts (tema 10 de plans/plan-reunion-juan-18-11). En la base local se crea y se borra con
 * `plans/plan-reunion-juan-18-11/usuario-e2e-reportes.php`.
 */
export const E2E_USER_REPORTS = env.E2E_USER_REPORTS ?? ''
export const E2E_PASSWORD_REPORTS = env.E2E_PASSWORD_REPORTS ?? ''
export const E2E_MISSING_USER_REPORTS = !E2E_USER_REPORTS || !E2E_PASSWORD_REPORTS
export const E2E_MISSING_USER_REPORTS_REASON =
  'Set E2E_USER_REPORTS and E2E_PASSWORD_REPORTS in frontend/.env.e2e.local (plans/plan-reunion-juan-18-11/usuario-e2e-reportes.php)'

export async function login(page: Page, user = E2E_USER, password = E2E_PASSWORD) {
  await page.goto('/login')
  await page.locator('#email').fill(user)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /sign in|log in|ingresar|entrar/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

export async function noHorizontalScroll(page: Page) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(ok, 'page must not scroll horizontally').toBe(true)
}

/**
 * Deja el menú lateral abierto y con los nombres a la vista. En celular abre la hamburguesa. En compu, si el menú
 * arrancó achicado (solo íconos), lo agranda con la flecha, que no tiene texto accesible. Sin esto, «Reports» y los
 * links por nombre no se encuentran (11/11/2026: monthly-closing.spec.ts se colgaba en compu).
 */
export async function openMobileMenuIfNeeded(page: Page) {
  const burger = page.getByRole('button', { name: /open menu|abrir men/i })
  if (await burger.isVisible().catch(() => false)) await burger.click()
  const expand = page.locator('aside').getByRole('button').filter({ has: page.locator('svg.lucide-chevron-right') })
  if (await expand.first().isVisible().catch(() => false)) await expand.first().click()
}

/**
 * Elige un atajo del calendario del encabezado («Last Month», «Last 30 days»…). `scope` es el encabezado (compu) o la
 * hoja de filtros (celular). En compu el atajo aplica y cierra solo; si el calendario sigue abierto (celular), se
 * confirma con su propio Apply. Antes los e2e apretaban siempre ese Apply y en compu esperaban un botón que ya no está.
 */
export async function pickDatePreset(page: Page, scope: Locator, preset: string) {
  await scope.getByRole('button', { name: /\d{2}\/\d{2}\/\d{4}|Select dates/ }).first().click()
  await page.getByRole('button', { name: preset, exact: true }).click()
  const picker = page.locator('[data-slot="popover-content"]')
  await picker.waitFor({ state: 'detached', timeout: 3_000 }).catch(async () => {
    await picker.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(picker).toHaveCount(0)
  })
}

/**
 * All Dealers y un atajo de fechas («Last 30 days», «Last Month»…) en el encabezado (compu) o en la hoja de filtros
 * (celular). Lo usan expenses.spec.ts y box-links.spec.ts.
 */
export async function pickAllDealersAndDatePreset(page: Page, preset: string) {
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
  await pickDatePreset(page, scope, preset)
  if (mobile) {
    await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  }
}

/**
 * Expenses List pagina de a 25 y ordena por fecha: lo que crea una prueba puede quedar en otra página. Se filtra por la
 * compañía (panel Filters, que arranca cerrado).
 */
export async function filterExpensesByCompany(page: Page, company: string) {
  const field = page.locator('div.space-y-1').filter({ has: page.getByText('Company', { exact: true }) }).getByRole('combobox')
  if (!(await field.isVisible())) await page.getByRole('button', { name: /^Filters/ }).click()
  await field.click()
  await page.locator('[cmdk-input]').last().fill(company)
  await page.getByRole('option', { name: company }).first().click()
}

/** `$1,234.50` → 1234.5. */
export function money(text: string): number {
  return Number(text.replace(/[$,]/g, ''))
}

/**
 * PRO › Monthly Closing de un mes («October 2026») con All Dealers: Payroll y Expenses de la fila del dealer y la línea
 * «Pay periods». Lo usan los e2e de la expense Piecework (monthly-closing-vendors y expense-piecework-changes). Cada
 * cierre tarda 1–2 min contra la copia local (tarea monthly-closing-lento).
 */
export async function monthlyClosingDealer(
  page: Page,
  month: string,
  dealer: string,
): Promise<{ payroll: number; expenses: number; periods: string }> {
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
  await page.locator('[cmdk-input]').last().fill(month)
  await page.getByRole('option', { name: month, exact: true }).click()
  if (mobile) await page.getByRole('button', { name: 'Apply' }).click()
  const periodsLine = page.locator('main').getByText(/^Pay periods: /)
  await expect(periodsLine).toBeVisible({ timeout: 90_000 })

  const row = page.locator('main tbody tr').filter({ hasText: dealer })
  const cells = (await row.locator('td').allInnerTexts()).map((c) => c.trim())
  return { payroll: money(cells[2]), expenses: money(cells[3]), periods: (await periodsLine.innerText()).replace(/^Pay periods: /, '') }
}
