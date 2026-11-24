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
  // Si se escribe antes de que la página termine de hidratar, el formulario se vacía y el clic no hace nada (pasaba en
  // la paridad, con la primera visita a PRO después de entrar a legacy): se reintenta hasta salir de /login.
  await expect(async () => {
    await page.locator('#email').fill(user)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: /sign in|log in|ingresar|entrar/i }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 })
  }).toPass({ timeout: 90_000 })
}

/** El legacy (PHP) de la copia local, para los e2e que recorren una pantalla de `public/modulos`. */
export const LEGACY = env.E2E_LEGACY_URL ?? 'http://srs.com'

/** Login del legacy con el mismo usuario de `.env.e2e.local`. Si ya hay sesión, `login.php` no muestra el formulario. */
export async function legacyLogin(page: Page, user = E2E_USER, password = E2E_PASSWORD) {
  await page.goto(`${LEGACY}/login.php`)
  if (await page.locator('#username').isVisible().catch(() => false)) {
    await page.locator('#username').fill(user)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Secure Sign In' }).click()
    await expect(page).not.toHaveURL(/login\.php/, { timeout: 30_000 })
  }
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

/** Encabezado (compu) u hoja de filtros (celular). `apply` confirma la hoja en celular; en compu no hace nada. */
export async function filtersScope(page: Page): Promise<{ scope: Locator; apply: () => Promise<void> }> {
  const openFilters = page.getByRole('button', { name: 'Open filters' })
  const mobile = await openFilters.isVisible()
  if (mobile) await openFilters.click()
  // La hoja se llama «Filters»; el combo de dealers abre otro `dialog` (su popover) adentro.
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  return {
    scope: mobile ? sheet : page.locator('header'),
    apply: async () => {
      if (!mobile) return
      await sheet.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(sheet).toBeHidden()
    },
  }
}

/** El combo de dealers del encabezado (`DealerMultiSelect`): dice «All Dealers», «N dealers» o el nombre de uno. */
export function dealersCombo(scope: Locator): Locator {
  return scope.locator('button[role="combobox"][class*="min-w-[200px]"]').first()
}

/** El combo ya cargó la lista (mientras carga está deshabilitado y dice «Loading…»). */
export async function dealersComboReady(scope: Locator): Promise<Locator> {
  const combo = dealersCombo(scope)
  await expect(combo).toBeEnabled({ timeout: 30_000 })
  await expect(combo).not.toContainText(/loading/i, { timeout: 30_000 })
  return combo
}

/**
 * Abre el combo de dealers y deja todos destildados o todos tildados. «All Dealers» (la primera fila) alterna:
 * con todos tildados los destilda; si no, los tilda.
 */
export async function setAllDealers(page: Page, scope: Locator, checked: boolean) {
  await (await dealersComboReady(scope)).click()
  const all = page.locator('[data-slot="popover-content"] button').filter({ hasText: /All Dealers/i }).first()
  await expect(all).toBeVisible()
  const isChecked = async () => (await all.locator('svg.lucide-check').count()) > 0
  if ((await isChecked()) !== checked) await all.click()
  if ((await isChecked()) !== checked) await all.click()
}

/** Elige un solo dealer en el combo ya abierto en `scope` (por nombre, o el primero de la lista). */
async function chooseOneDealer(page: Page, scope: Locator, name?: string) {
  await setAllDealers(page, scope, false)
  const popover = page.locator('[data-slot="popover-content"]')
  // Con uno elegido, «All Dealers» primero tilda todos y después destilda: se espera a que no quede ninguno tildado
  // (leer el ícono justo después del clic, antes de que se redibuje, dejaba el dealer anterior: «2 dealers»).
  const all = popover.locator('button').filter({ hasText: /All Dealers/i }).first()
  await expect(async () => {
    if ((await popover.locator('[cmdk-item] svg.lucide-check').count()) > 0) await all.click()
    await expect(popover.locator('[cmdk-item] svg.lucide-check')).toHaveCount(0, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  if (name) {
    await popover.locator('[cmdk-input]').fill(name)
    await popover.locator('[cmdk-item]').filter({ hasText: name }).first().click()
  } else {
    await popover.locator('[cmdk-item]').first().click()
  }
  await page.keyboard.press('Escape')
  await expect(dealersCombo(scope)).not.toContainText(/All Dealers|\d+ dealers/i)
  if (name) await expect(dealersCombo(scope)).toContainText(name)
}

/** Un solo dealer en el encabezado (compu) o en la hoja de filtros (celular): `name` o el primero de la lista. */
export async function pickOneDealer(page: Page, name?: string) {
  const { scope, apply } = await filtersScope(page)
  await chooseOneDealer(page, scope, name)
  await apply()
}

/**
 * Un rango de días a mano en el calendario del encabezado (`from`/`to` como `MM/DD/YYYY`, en el mes que abre el
 * calendario o el siguiente). Dos clics en el primer día dejan el rango en ese día, sea cual sea el rango anterior
 * (`addToRange` de react-day-picker 9); un clic en el último lo extiende. Los días se ubican por `data-day`
 * (`components/ui/calendar.tsx`, la fecha en el formato del navegador, `en-US`).
 */
export async function pickDateRange(page: Page, scope: Locator, from: string, to: string = from) {
  const trigger = scope.getByRole('button', { name: /\d{2}\/\d{2}\/\d{4}|Select dates/ }).first()
  if ((await trigger.innerText()).trim() === `${from} – ${to}`) return
  await trigger.click()
  const picker = page.locator('[data-slot="popover-content"]').last()
  // Solo los días del mes (los de afuera, `rdp-outside`, repiten fechas del mes de al lado).
  const inMonth = 'td:not(.rdp-outside) > button[data-day]'
  const day = (mdy: string) =>
    picker.locator(`td:not(.rdp-outside) > button[data-day="${mdy.replace(/^0/, '').replace(/\/0/, '/')}"]`)
  /** Va mes por mes hasta que el día está en pantalla (atrás si es anterior a lo que se ve, si no adelante). */
  const reveal = async (mdy: string) => {
    const [m, , y] = mdy.split('/').map(Number)
    for (let i = 0; i < 36 && (await day(mdy).count()) === 0; i++) {
      const shown = await picker.locator(inMonth).first().getAttribute('data-day')
      const [sm, , sy] = (shown ?? '').split('/').map(Number)
      const back = y * 12 + m < sy * 12 + sm
      await picker.getByRole('button', { name: back ? /previous month/i : /next month/i }).click()
    }
  }
  await reveal(from)
  await day(from).click()
  await day(from).click()
  if (to !== from) {
    await reveal(to)
    await day(to).click()
  }
  await picker.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(picker).toHaveCount(0)
  await expect(trigger).toHaveText(`${from} – ${to}`)
}

/** Un dealer y un rango de días a mano, en el encabezado (compu) o en la hoja de filtros (celular). */
export async function pickDealerAndRange(page: Page, dealer: string, from: string, to: string = from) {
  const { scope, apply } = await filtersScope(page)
  const combo = await dealersComboReady(scope)
  if ((await combo.innerText()).trim() !== dealer) await chooseOneDealer(page, scope, dealer)
  await pickDateRange(page, scope, from, to)
  await apply()
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
