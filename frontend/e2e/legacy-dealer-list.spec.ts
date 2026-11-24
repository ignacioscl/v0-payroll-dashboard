/**
 * Dealer List del legacy (plans/plan-dealers-lista-goal-due-geofence, T5): las columnas «Goal Production report»,
 * «Payment Due On» y «Geofense radio» y el filtro «Geofense TTK» (switch de tres opciones), el camino entero, en 1280×800 y 375×812 (los dos proyectos de
 * playwright.config.ts, Chromium de Playwright). Contra la copia local de PROD: legacy en http://srs.com, con el
 * usuario de `.env.e2e.local` (Admin Company de Auto Wax, que es un detailer).
 *
 * Lo que recorre: Dealer List → están las dos columnas → lo que dicen coincide con Config Billing → se cambia Payment
 * Due On y la celda cambia sin recargar → el filtro: With + Without = All → con «Without geofense» se le carga un
 * geofence a un dealer, al cerrar el modal la lista se recarga y el dealer ya no está → se le borra → el CSV trae las
 * dos columnas y termina con el bloque de contexto → «Sucursales», que usa el mismo JS, sigue armando su tabla.
 *
 * Deja la copia como estaba: restaura el Payment Due On y borra el geofence que agrega.
 *
 * En 375 px las dos columnas y el menú de la fila están en la fila desplegable de DataTables.
 */
import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, LEGACY, legacyLogin } from './helpers'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)

const LIST = `${LEGACY}/modulos/dealers_cust/php/dealercust_main.php`
const LIST_SP = `${LEGACY}/modulos/dealers_cust/php/dealercust_main_sp.php`
const TEST_GEOFENCE = { lat: '26.1000000', lng: '-80.2000000', radio: '250' }

// La página tiene otra tabla con el mismo id dentro del modal de Reminders: la lista es siempre la primera.
const info = (page: Page) => page.locator('#dt-basic-example_info').first()

/** «Showing 1 to 10 of 98 entries» → 98. */
async function total(page: Page): Promise<number> {
  await expect(info(page)).toContainText(/of [\d,]+ entries/)
  const m = /of ([\d,]+) entries/.exec(await info(page).innerText())
  return Number(m![1].replace(/,/g, ''))
}

async function openList(page: Page) {
  await page.goto(LIST)
  await expect(info(page)).toContainText('entries')
}

const GEOFENCE_OPTION = { '': 'All', '1': 'With geofense', '0': 'Without geofense' } as const

/** El switch de tres opciones recarga la página, como los otros filtros de la pantalla. La elegida queda marcada. */
async function setGeofenceFilter(page: Page, value: '' | '1' | '0') {
  const option = page.locator('#geofence_switch').getByRole('button', { name: GEOFENCE_OPTION[value], exact: true })
  await Promise.all([page.waitForEvent('load'), option.click()])
  await expect(page.locator('#geofence')).toHaveValue(value)
  await expect(option).toHaveClass(/btn-primary/)
  await expect(page.locator('#geofence_switch .btn-primary')).toHaveCount(1)
  await expect(info(page)).toContainText('entries')
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768

/** La fila del DEALER_REL `id`. */
const rowOf = (page: Page, id: string) => page.locator('#dt-basic-example tbody tr').filter({ has: page.locator(`#check_dealer_${id}`) })

/**
 * Abre un ítem del menú de la fila. En compu el menú está en la fila; en celular, en la fila desplegable, que se abre
 * tocando la primera celda.
 */
async function openRowMenuItem(page: Page, id: string, item: string) {
  const row = rowOf(page, id)
  let scope: Locator = row
  if (isMobile(page)) {
    // DataTables marca con «parent» la fila que ya tiene abierta su fila desplegable.
    if (!(await row.evaluate((el) => el.classList.contains('parent')))) await row.locator('td').first().click()
    scope = row.locator('xpath=following-sibling::tr[1]')
    await expect(scope).toHaveClass(/child/)
  }
  await scope.locator('button[data-toggle="dropdown"]').first().click()
  await scope.locator('a.dropdown-item', { hasText: item }).first().click()
}

/** El texto de una de las dos columnas nuevas para la fila `id`: en la celda (compu) o en la fila desplegable (celular). */
async function cellText(page: Page, id: string, which: 'goal' | 'due_on'): Promise<string> {
  // En celular el id queda repetido (celda oculta + copia en la fila desplegable): el último es el que se ve.
  const span = page.locator(`#txt_${which}_${id}`)
  return (await (isMobile(page) ? span.last() : span.first()).innerText()).trim()
}

async function searchFor(page: Page, text: string) {
  await page.locator('#dt-basic-example_filter input').first().fill(text)
}

test('Dealer List: goal, due on y filtro de geofence, el camino entero', async ({ page }) => {
  const errors: string[] = []
  // Solo los errores de las dos pantallas de la lista: `login.php` del legacy ya tira dos errores propios (rgb2hex y
  // rolMaganer), que no son de este camino.
  page.on('pageerror', (e) => {
    const path = new URL(page.url()).pathname
    if (path.includes('/dealers_cust/')) errors.push(`${path} :: ${e.message}`)
  })

  await legacyLogin(page)
  await openList(page)
  const mobile = isMobile(page)

  // 1. Las dos columnas. En compu son títulos de la tabla; en celular están en la fila desplegable.
  const firstId = await page.locator('#dt-basic-example tbody input[name="check_dealer"]').first().inputValue()
  if (mobile) {
    await rowOf(page, firstId).locator('td').first().click()
    const child = rowOf(page, firstId).locator('xpath=following-sibling::tr[1]')
    await expect(child).toContainText('GOAL PRODUCTION REPORT')
    await expect(child).toContainText('PAYMENT DUE ON')
    await expect(child).toContainText('GEOFENSE RADIO')
    // Esta pantalla del legacy ya es más ancha que un celular (el panel entero se corre de costado): el switch no la
    // ensancha, entra en el mismo panel que el buscador y la tabla.
    const combo = (await page.locator('#geofence_switch').boundingBox())!
    const panel = (await page.locator('#panel-1 .panel-content').first().boundingBox())!
    expect(combo.x + combo.width).toBeLessThanOrEqual(panel.x + panel.width)
  } else {
    await expect(page.locator('#dt-basic-example thead th', { hasText: 'GOAL PRODUCTION REPORT' })).toBeVisible()
    await expect(page.locator('#dt-basic-example thead th', { hasText: 'PAYMENT DUE ON' })).toBeVisible()
    await expect(page.locator('#dt-basic-example thead th', { hasText: 'GEOFENSE RADIO' })).toBeVisible()
  }

  // En celular el menú de la fila queda dentro de la fila desplegable y sus ítems no responden (ya pasa sin este
  // cambio; tarea `bug-dealer-list-menu-fila-celular` de PLAN-GENERAL): los pasos que abren el menú corren solo en compu.
  if (!mobile) {
    // 2. Lo que dice la lista coincide con Config Billing.
    await openRowMenuItem(page, firstId, 'Config Billing')
    const modal = page.locator('#modal-config')
    await expect(modal).toBeVisible()
    const goal = await modal.locator('#goal_report').inputValue()
    const dueOn = await modal.locator('#due_on').inputValue()
    const goalText = goal === '' ? '' : '$' + Number(goal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    expect(await cellText(page, firstId, 'goal')).toBe(goalText)
    expect(await cellText(page, firstId, 'due_on')).toBe(dueOn)

    // 3. Se cambia Payment Due On: la celda cambia sin recargar la página.
    const otherDueOn = dueOn === '60' ? '30' : '60'
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true))
    await modal.locator('#due_on').selectOption(otherDueOn)
    await modal.getByRole('button', { name: 'Save' }).click()
    await expect(modal).toBeHidden()
    try {
      await expect.poll(() => cellText(page, firstId, 'due_on')).toBe(otherDueOn)
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
    } finally {
      // Se deja como estaba.
      await openRowMenuItem(page, firstId, 'Config Billing')
      await expect(modal).toBeVisible()
      await modal.locator('#due_on').selectOption(dueOn)
      await modal.getByRole('button', { name: 'Save' }).click()
      await expect(modal).toBeHidden()
    }
    await expect.poll(() => cellText(page, firstId, 'due_on')).toBe(dueOn)
  }

  // 4. El filtro: With + Without = All.
  const all = await total(page)
  await setGeofenceFilter(page, '1')
  const withGeo = await total(page)
  await setGeofenceFilter(page, '0')
  const withoutGeo = await total(page)
  expect(withGeo + withoutGeo).toBe(all)
  expect(withoutGeo).toBeGreaterThan(0)

  let dealerWithoutGeofence = ''
  if (!mobile) {
  // 5. Con «Without geofense»: el primer dealer no tiene ninguno; se le carga uno y, al cerrar el modal, la lista se
    //    recarga con el mismo filtro y ese dealer ya no está.
    const geoRelId = await page.locator('#dt-basic-example tbody input[name="check_dealer"]').first().inputValue()
    const dealerName = (await page.locator(`#txt_name_${geoRelId}`).first().innerText()).trim()
    dealerWithoutGeofence = dealerName
    const geoModal = page.locator('#modal-geofense')
    await openRowMenuItem(page, geoRelId, 'Geofense TTK')
    await expect(geoModal).toBeVisible()
    await expect(geoModal.locator('#dealer_geofense')).not.toHaveText('')
    await expect(geoModal.locator('#geofence_container #lat')).toBeVisible()
    await expect(geoModal.locator('#geofence_container input[disabled]')).toHaveCount(0)
    await geoModal.locator('#lat').fill(TEST_GEOFENCE.lat)
    await geoModal.locator('#lng').fill(TEST_GEOFENCE.lng)
    await geoModal.locator('#radio').fill(TEST_GEOFENCE.radio)
    await geoModal.getByRole('button', { name: 'Add' }).click()
    await expect(geoModal.locator('#geofence_container input[disabled]')).toHaveCount(3)
    try {
      await Promise.all([page.waitForEvent('load'), geoModal.getByRole('button', { name: 'Close' }).last().click()])
      await expect(page.locator('#geofence')).toHaveValue('0')
      expect(await total(page)).toBe(withoutGeo - 1)
      await searchFor(page, dealerName)
      await expect(page.locator(`#check_dealer_${geoRelId}`)).toHaveCount(0)
    } finally {
      // Se deja como estaba: con «With geofense» el dealer aparece; se le borra el geofence.
      await setGeofenceFilter(page, '1')
      await searchFor(page, dealerName)
      await expect(page.locator(`#check_dealer_${geoRelId}`)).toHaveCount(1)
      // Geofense radio muestra el radio del geofence recién cargado.
      await expect(rowOf(page, geoRelId).locator('[id^="txt_geo_radio_"]')).toHaveText(TEST_GEOFENCE.radio)
      await openRowMenuItem(page, geoRelId, 'Geofense TTK')
      await expect(geoModal).toBeVisible()
      await expect(geoModal.locator('#geofence_container input[disabled]')).toHaveCount(3)
      await geoModal.locator('[attach-type="deleteGeofense"]').first().click()
      await expect(geoModal.locator('#geofence_container input[disabled]')).toHaveCount(0)
      await Promise.all([page.waitForEvent('load'), geoModal.getByRole('button', { name: 'Close' }).last().click()])
    }
    expect(await total(page)).toBe(withGeo)
    await setGeofenceFilter(page, '0')
    expect(await total(page)).toBe(withoutGeo)
  }

  // 6. El CSV: el encabezado es la primera línea y trae las dos columnas; el archivo termina con el bloque de contexto.
  await setGeofenceFilter(page, '')

  // 5b. Con «All», cargar o borrar un geofence no recarga la página: cambia la celda Geofense radio de ese dealer.
  if (!mobile) {
    const geoModal = page.locator('#modal-geofense')
    // El mismo dealer del paso 5, que no tiene geofence.
    await searchFor(page, dealerWithoutGeofence)
    await expect(info(page)).toContainText('filtered from')
    const relId = await page.locator('#dt-basic-example tbody input[name="check_dealer"]').first().inputValue()
    const radioCell = rowOf(page, relId).locator('[id^="txt_geo_radio_"]')
    const before = (await radioCell.innerText()).trim()
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true))
    await openRowMenuItem(page, relId, 'Geofense TTK')
    await expect(geoModal).toBeVisible()
    await expect(geoModal.locator('#geofence_container #lat')).toBeVisible()
    const existing = await geoModal.locator('#geofence_container input[disabled]').count()
    await geoModal.locator('#lat').fill(TEST_GEOFENCE.lat)
    await geoModal.locator('#lng').fill(TEST_GEOFENCE.lng)
    await geoModal.locator('#radio').fill(before === TEST_GEOFENCE.radio ? '275' : TEST_GEOFENCE.radio)
    await geoModal.getByRole('button', { name: 'Add' }).click()
    await expect(geoModal.locator('#geofence_container input[disabled]')).toHaveCount(existing + 3)
    try {
      await geoModal.getByRole('button', { name: 'Close' }).last().click()
      await expect(geoModal).toBeHidden()
      // El dealer ya tenía geofence principal: el primero sigue siendo ese, y la celda no cambia. Si no tenía, pasa a
      // mostrar el que se cargó.
      await expect(radioCell).toHaveText(existing > 0 ? before : TEST_GEOFENCE.radio)
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
    } finally {
      // Se deja como estaba: se borra el que se agregó (el último de la lista del modal).
      await openRowMenuItem(page, relId, 'Geofense TTK')
      await expect(geoModal).toBeVisible()
      await expect(geoModal.locator('#geofence_container input[disabled]')).toHaveCount(existing + 3)
      await geoModal.locator('[attach-type="deleteGeofense"]').last().click()
      await expect(geoModal.locator('#geofence_container input[disabled]')).toHaveCount(existing)
      await geoModal.getByRole('button', { name: 'Close' }).last().click()
      await expect(geoModal).toBeHidden()
    }
    await expect(radioCell).toHaveText(before)
    await searchFor(page, '')
  }

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.buttons-csv').first().click()])
  const csv = readFileSync((await download.path())!, 'utf8')
  const header = csv.split('\n')[0]
  expect(header).toContain('"GOAL PRODUCTION REPORT","PAYMENT DUE ON","GEOFENSE RADIO"')
  expect(csv).toContain('\n\n"Field","Value"\n')
  const block = csv.slice(csv.lastIndexOf('"Field","Value"'))
  expect(block).toMatch(/"Screen","Dealer List/)
  expect(block).toMatch(/"Generated","\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} (AM|PM) ET"/)
  expect(block).toMatch(/"Generated by","[^"]+"/)
  expect(block).toContain('"Show Inactive","No"')
  expect(block).toContain('"Geofense TTK","All"')
  expect(block).toContain('"Search","All"')

  // 7. «Sucursales» usa el mismo JS sobre una tabla de 9 columnas: se sigue armando igual.
  await page.goto(LIST_SP)
  await expect(info(page)).toContainText('entries')
  const columns = await page.evaluate(() =>
    (window as unknown as { $: (s: string) => { DataTable: () => { columns: () => { count: () => number } } } })
      .$('#dt-basic-example')
      .DataTable()
      .columns()
      .count(),
  )
  expect(columns).toBe(9)
  await expect(page.locator('#geofence')).toHaveCount(0)

  expect(errors, 'no JS errors on the pages').toEqual([])
})
