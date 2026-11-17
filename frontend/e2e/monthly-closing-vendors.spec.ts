/**
 * Marca «Vendor» — el camino entero (plans/plan-monthly-closing-vendors P8), en 375×812 y 1280×800 (los dos proyectos de
 * playwright.config.ts, Chromium de Playwright). Contra la copia local de PROD: legacy en http://srs.com y PRO en
 * http://pro.srs.com, con el usuario de `.env.e2e.local` (Admin Company de Auto Wax).
 *
 * Lo que recorre: PRO › Monthly Closing de octubre 2026, el Payroll de Land Rover Ft Lauderdale sin la marca → legacy,
 * ficha de Francol Services LLC, Applications & Notifications › «Vendor» › Save → la ficha muestra el cartel → Users ›
 * Filters › «Vendors only» lo trae con la etiqueta «Vendor» → PRO: el Payroll del dealer bajó lo de Francol y su fila
 * no está en la solapa Payroll → legacy: se desmarca (el dato queda como estaba).
 */
import { expect, test, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, E2E_PASSWORD, E2E_USER, login, noHorizontalScroll, openMobileMenuIfNeeded } from './helpers'

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

/** Tilda o destilda «Vendor» y guarda la ficha (vuelve a la lista). */
async function setVendor(page: Page, value: boolean) {
  await openUserForm(page, VENDOR_ID)
  await page.getByRole('link', { name: 'Applications & Notifications' }).click()
  const box = page.locator('#is_vendor')
  if ((await box.isChecked()) !== value) {
    await page.locator('label[for="is_vendor"]').click()
    // Al tildar, la ficha le pregunta al servidor si tiene otros tipos de pago; Francol solo tiene Piecework.
    await expect(page.locator('#is_vendor_error')).toBeHidden()
    await expect(box).toBeChecked({ checked: value })
  }
  await page.locator('#btn_submit').click()
  await page.waitForURL(/usuarios\.php/, { timeout: 30_000 })
}

/** PRO › Monthly Closing de octubre con All Dealers; devuelve el Payroll del dealer. */
async function dealerPayroll(page: Page): Promise<number> {
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
  await expect(page.locator('main').getByText(/^Pay periods: /)).toBeVisible({ timeout: 90_000 })

  const row = page.locator('main tbody tr').filter({ hasText: DEALER })
  const cells = (await row.locator('td').allInnerTexts()).map((c) => c.trim())
  return money(cells[2])
}

async function payrollTabEmployees(page: Page): Promise<string> {
  await page.locator('main tbody tr').filter({ hasText: DEALER }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: 'Payroll' }).click()
  const panel = dialog.locator('[role="tabpanel"][data-state="active"]')
  // Mientras carga, la tabla muestra «No records» con la ruedita: se espera el Total.
  await expect(panel).toContainText(/Total\s*\$[\d,]+\.\d{2}/, { timeout: 90_000 })
  return panel.innerText()
}

test.describe.serial('Vendor mark — full path', () => {
  test('mark in the legacy form, find it in Users, and the Monthly Closing payroll leaves it out', async ({ page }) => {
    // Dos cierres de octubre con All Dealers: cada uno tarda 1–2 min contra la copia local (tarea monthly-closing-lento).
    test.setTimeout(900_000)
    await legacyLogin(page)
    await setVendor(page, false) // punto de partida: sin la marca
    const before = await dealerPayroll(page)
    expect(await payrollTabEmployees(page)).toContain(VENDOR_NAME)

    await legacyLogin(page)
    await setVendor(page, true)
    await openUserForm(page, VENDOR_ID)
    await expect(page.locator('#vendor_banner')).toBeVisible()
    await expect(page.locator('#vendor_banner')).toContainText('it does not count in the Monthly Closing payroll')

    // Users › Filters › «Vendors only»: lo trae con la etiqueta. (Las pantallas del legacy no son responsive: el control
    // de scroll lateral queda para las de PRO.)
    await page.goto(`${LEGACY}/modulos/usuarios/php/usuarios.php`)
    await page.locator('button:has(.fa-filter)').first().click()
    await page.locator('label[for="only_vendors"]').click()
    await expect(page.locator('#count_filters')).toHaveText('1')
    await page.locator('#modal-filters').getByRole('button', { name: 'Close', exact: true }).click()
    const vendorRow = page.locator('table tbody tr').filter({ hasText: VENDOR_NAME })
    await expect(vendorRow).toBeVisible({ timeout: 30_000 })
    await expect(vendorRow.locator('[data-vendor-badge]')).toHaveText('Vendor')

    const after = await dealerPayroll(page)
    // Francol cobró $14,161.00 de piecework en Land Rover Ft Lauderdale en octubre 2026 (copia de PROD del 12/11).
    expect(Math.round((before - after) * 100) / 100).toBe(14161)
    expect(await payrollTabEmployees(page)).not.toContain(VENDOR_NAME)
    await noHorizontalScroll(page)

    await legacyLogin(page)
    await setVendor(page, false)
  })
})
