/**
 * Billing › WO to be Billed (plans/plan-wo-to-be-billed-v0, T11, «e2e de la pantalla»), en 1280×800 y 375×812 (los dos
 * proyectos de playwright.config.ts), contra http://pro.srs.com local y la copia local de la base, con el usuario de
 * `.env.e2e.local` (Admin Company de Auto Wax).
 *
 * Datos de la copia (Auto Wax):
 * - Tesla Orange Park Mall Pop-Up (897), alta el 11/10/2026: TOPWO352, 353 y 354 (Detail, $30) y TOPWO355 ($15).
 *   TOPWO277, del mismo dealer, está pagada.
 * - Napleton Northlake Kia (728): KNNWO2077, alta el 11/10 y Completed el 11/12 (el caso de la WO 4389862).
 * - North Fort Lauderdale Subaru (874): NFLSWO13627, alta el 11/08, solo servicios en $0.
 * - Mercedes-Benz of Cutler Bay (204): MBCW4685, alta el 08/26, en $0, con un servicio que pide RO#.
 * - Una WO de otra empresa (4416276, de la 232) para los 403.
 *
 * **No deja datos:** antes de empezar se guarda `estado`, `ro`, `po`, `approved` y las tres marcas de cada WO que se
 * toca; al terminar se devuelven, se borran sus líneas nuevas de `LOG_CHANGE` y las invoices que creó la corrida (la del
 * camino entero se borra además por Invoices, como lo haría una persona). La copia la comparten otras sesiones.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  E2E_MISSING_USER,
  E2E_MISSING_USER_REASON,
  E2E_MISSING_USER_REPORTS,
  E2E_PASSWORD_REPORTS,
  E2E_USER_REPORTS,
  login,
  noHorizontalScroll,
  filtersScope,
  openMobileMenuIfNeeded,
  pickDealerAndRange,
} from './helpers'
import { exec, ids, localDbMissing, query, scalar, sqlText } from './local-db'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
const dbMissing = localDbMissing()
test.skip(dbMissing != null, dbMissing ?? '')

const ROUTE = '/billing/wo-to-be-billed'
const API = '/api/srs-kpis/billing'
const WO_PDF = '/api/srs/php/api/payroll/wo-pdf.php'

const TESLA = 'Tesla Orange Park Mall Pop-Up'
const KIA = 'Napleton Northlake Kia'
const SUBARU = 'North Fort Lauderdale Subaru'
const MERCEDES = 'Mercedes-Benz of Cutler Bay'
const DAY = '11/10/2026'

const WO = {
  t352: { id: 4419885, nro: 'TOPWO352' },
  t353: { id: 4419888, nro: 'TOPWO353' },
  t354: { id: 4419889, nro: 'TOPWO354' },
  t355: { id: 4419893, nro: 'TOPWO355' },
  billed: { id: 4302089, nro: 'TOPWO277' },
  kia: { id: 4423029, nro: 'KNNWO2077' },
  zero: { id: 4416209, nro: 'NFLSWO13627' },
  roRequired: { id: 4294534, nro: 'MBCW4685' },
} as const
const FOREIGN_WO = 4416276
const FOREIGN_DEPARTMENT = 980
const FOREIGN_SERVICE = 13910
const TOUCHED = Object.values(WO).map((w) => w.id)
const COLUMNS = ['id', 'estado', 'ro', 'po', 'approved', 'ro_semi_req', 'po_semi_req', 'stock_semi_req']

test.describe.configure({ mode: 'serial' })

let snapshot: Array<Record<string, string | null>> = []
let maxStatement = 0
let maxLog = 0

/** Las invoices que tocan nuestras WO y se crearon en esta corrida. */
function createdStatements(): number[] {
  return query(
    `SELECT DISTINCT id_statement FROM INVOICE_STATEMENT_INV_REL WHERE id_statement > ${maxStatement} AND id_invoice IN (${ids(TOUCHED)});`,
    ['id'],
  ).map((r) => Number(r.id))
}

function purgeStatements() {
  const created = createdStatements()
  if (!created.length) return
  const list = ids(created)
  exec(
    `DELETE FROM LOG_CHANGE WHERE id_invoice_statement IN (${list});
     DELETE FROM INVOICE_STATEMENT_SEL_SER_REL WHERE id_statement IN (${list});
     DELETE FROM INVOICE_STATEMENT_INV_REL WHERE id_statement IN (${list});
     DELETE FROM INVOICE_STATEMENT WHERE id IN (${list});`,
  )
}

/** La invoice activa de una WO creada en esta corrida (o null). */
function activeInvoiceOf(idWo: number): { id: number; nro: string; type: number } | null {
  const [row] = query(
    `SELECT s.id, s.full_nro, s.statement_type FROM INVOICE_STATEMENT s JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id
      WHERE r.id_invoice = ${Number(idWo)} AND s.estado = 1 AND s.id > ${maxStatement} ORDER BY s.id DESC LIMIT 1;`,
    ['id', 'nro', 'type'],
  )
  return row ? { id: Number(row.id), nro: String(row.nro), type: Number(row.type) } : null
}

test.beforeAll(() => {
  maxStatement = Number(scalar('SELECT COALESCE(MAX(id), 0) FROM INVOICE_STATEMENT;'))
  maxLog = Number(scalar('SELECT COALESCE(MAX(id), 0) FROM LOG_CHANGE;'))
  snapshot = query(`SELECT ${COLUMNS.join(', ')} FROM INVOICE WHERE id IN (${ids(TOUCHED)});`, COLUMNS)
  const pending = query(`SELECT id, estado, WO_HAVE_INVOICE(id) FROM INVOICE WHERE id IN (${ids(TOUCHED.filter((id) => id !== WO.billed.id))});`, [
    'id',
    'estado',
    'inv',
  ])
  for (const r of pending) {
    expect(`${r.id}: estado ${r.estado}, invoice ${r.inv}`).toBe(`${r.id}: estado 1, invoice 0`)
  }
})

test.afterAll(() => {
  purgeStatements()
  const restore = snapshot
    .map(
      (r) =>
        `UPDATE INVOICE SET estado = ${Number(r.estado)}, ro = ${sqlText(r.ro)}, po = ${sqlText(r.po)}, approved = ${
          r.approved == null ? 'NULL' : Number(r.approved)
        }, ro_semi_req = ${Number(r.ro_semi_req)}, po_semi_req = ${Number(r.po_semi_req)}, stock_semi_req = ${Number(
          r.stock_semi_req,
        )} WHERE id = ${Number(r.id)};`,
    )
    .join('\n')
  exec(`${restore}\nDELETE FROM LOG_CHANGE WHERE id > ${maxLog} AND id_invoice IN (${ids(TOUCHED)});`)
  const after = query(`SELECT ${COLUMNS.join(', ')} FROM INVOICE WHERE id IN (${ids(TOUCHED)});`, COLUMNS)
  expect(after).toEqual(snapshot)
})

// ------------------------------------------------------------------ ayudas de pantalla

const rowOf = (page: Page, nro: string) => page.locator('main tbody tr').filter({ hasText: nro })

/** Menú › Billing › WO to be Billed, sin pedir un documento nuevo. */
async function openFromMenu(page: Page) {
  await login(page)
  await page.goto('/billing/invoices')
  await expect(page.locator('main')).toBeVisible()
  let documents = 0
  page.on('request', (r) => {
    if (r.resourceType() === 'document' && r.frame() === page.mainFrame()) documents += 1
  })
  const link = page.getByRole('link', { name: 'WO to be Billed', exact: true })
  await expect(async () => {
    await openMobileMenuIfNeeded(page)
    if (!(await link.isVisible().catch(() => false))) {
      const billing = page.getByRole('button', { name: /^Billing$/ })
      if ((await billing.getAttribute('aria-expanded')) === 'false') await billing.click()
    }
    await expect(link).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
  await link.click()
  await page.waitForURL((url) => url.pathname === ROUTE)
  await expect(page.getByRole('heading', { name: 'Work Orders Without Invoice' })).toBeVisible()
  expect(documents, 'the menu click requested a new document').toBe(0)
}

/** Abre el panel de filtros de la pantalla si está cerrado. */
async function openFilterPanel(page: Page) {
  const type = page.locator('#wo-filter-invoice-type')
  if (!(await type.isVisible().catch(() => false))) await page.locator('main').getByRole('button', { name: /^Filters/ }).click()
  await expect(type).toBeVisible()
}

async function chooseInvoiceType(page: Page, label: string) {
  await openFilterPanel(page)
  await page.locator('#wo-filter-invoice-type').click()
  await page.getByRole('option', { name: label }).click()
}

async function includeZero(page: Page) {
  await openFilterPanel(page)
  const sw = page.locator('#wo-filter-include-zero')
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click()
}

async function onlyCompleted(page: Page) {
  await openFilterPanel(page)
  const field = page.locator('main div.space-y-1').filter({ has: page.getByText('Status', { exact: true }) }).first()
  await field.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Completed' }).click()
  await page.keyboard.press('Escape')
}

/** Una acción de la fila: el menú «⋯» (Actions) y el ítem, como en Invoices. */
async function rowAction(page: Page, nro: string, item: string) {
  await rowOf(page, nro).getByRole('button', { name: 'Actions', exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

async function tick(page: Page, nro: string) {
  await rowOf(page, nro).getByRole('checkbox', { name: 'Select work order' }).check()
}

/**
 * La pestaña nueva que abre el clic recibe el PDF; la pantalla no descarga nada (descargar desde la pantalla es el
 * respaldo de la app cuando la pestaña no se pudo abrir). Chromium sin pantalla no tiene visor de PDF: ahí el PDF que
 * llega a la pestaña nueva se baja **en esa pestaña** y su URL queda en `about:blank`; con visor, la URL es el `blob:`.
 */
async function expectPdfTab(page: Page, click: () => Promise<void>) {
  const fromScreen: string[] = []
  const onDownload = (d: { suggestedFilename(): string }) => fromScreen.push(d.suggestedFilename())
  page.on('download', onDownload)
  try {
    const [tab] = await Promise.all([page.context().waitForEvent('page'), click()])
    let inTab: string | null = null
    tab.on('download', (d) => (inTab = d.suggestedFilename()))
    await expect
      .poll(() => (inTab ? `download ${inTab}` : tab.url()), { timeout: 60_000, message: 'the PDF reaches the new tab' })
      .toMatch(/^blob:|^download .*\.pdf$/)
    await tab.close()
    expect(fromScreen, 'the screen itself downloaded the PDF').toEqual([])
  } finally {
    page.off('download', onDownload)
  }
}

// ------------------------------------------------------------------ 1. el camino entero

test('el camino entero: generar dos WO tildadas, verlas en Invoices, borrar la invoice ahí y volver', async ({ page }) => {
  await openFromMenu(page)
  await pickDealerAndRange(page, TESLA, DAY)
  for (const w of [WO.t352, WO.t353, WO.t354, WO.t355]) await expect(rowOf(page, w.nro)).toBeVisible({ timeout: 60_000 })
  await chooseInvoiceType(page, 'Invoice Multi-Services')
  await tick(page, WO.t352.nro)
  await tick(page, WO.t353.nro)
  await page.getByRole('button', { name: 'Generate Invoice', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('wo-generate-count')).toHaveText('2 work orders will be included in 1 invoice')
  await dialog.getByRole('button', { name: 'Generate Invoices' }).click()
  await expect(page.getByText('1 invoice created')).toBeVisible()
  await expect(rowOf(page, WO.t352.nro)).toHaveCount(0)
  await expect(rowOf(page, WO.t353.nro)).toHaveCount(0)
  await expect(rowOf(page, WO.t354.nro)).toBeVisible()

  const invoice = activeInvoiceOf(WO.t352.id)
  expect(invoice).not.toBeNull()
  expect(activeInvoiceOf(WO.t353.id)?.id).toBe(invoice!.id)
  expect(invoice!.type).toBe(3)

  await page.getByRole('link', { name: 'View in Invoices' }).click()
  await page.waitForURL((url) => url.pathname === '/billing/invoices')
  const invoiceRow = page.locator('main tbody tr').filter({ hasText: invoice!.nro })
  await expect(invoiceRow).toBeVisible({ timeout: 60_000 })
  await invoiceRow.getByRole('button', { name: 'Actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete invoice' }).click()
  await page.getByRole('button', { name: 'Yes, deactivate it' }).click()
  await expect(page.getByText('Invoice deleted')).toBeVisible()

  await page.goBack()
  await page.waitForURL((url) => url.pathname === ROUTE)
  await expect(rowOf(page, WO.t352.nro)).toBeVisible({ timeout: 60_000 })
  await expect(rowOf(page, WO.t353.nro)).toBeVisible()
})

// ------------------------------------------------------------------ 2. cuenta = generado

test('cuenta = generado: con Approved = No, el número del diálogo es el de la lista y la invoice tiene esas WO', async ({ page }) => {
  // En la copia no hay WO pendientes con precio y Approved = No: se marcan dos y se devuelven al terminar.
  exec(`UPDATE INVOICE SET approved = 0 WHERE id IN (${ids([WO.t352.id, WO.t353.id])});`)
  try {
    await login(page)
    await page.goto(ROUTE)
    await pickDealerAndRange(page, TESLA, DAY)
    await openFilterPanel(page)
    await page.getByTestId('wo-approved-filter').getByText('No', { exact: true }).click()
    await expect(rowOf(page, WO.t352.nro)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('main tbody tr')).toHaveCount(2)
    await chooseInvoiceType(page, 'Invoice Multi-Services')
    // Cambiar el tipo no cambia la lista.
    await expect(page.locator('main tbody tr')).toHaveCount(2)
    await page.getByRole('button', { name: 'Generate Invoice', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('wo-generate-count')).toHaveText('2 work orders will be included in 1 invoice')
    await dialog.getByRole('button', { name: 'Generate Invoices' }).click()
    await expect(page.getByText('1 invoice created')).toBeVisible()
    const invoice = activeInvoiceOf(WO.t352.id)
    const wos = query(`SELECT DISTINCT id_invoice FROM INVOICE_STATEMENT_INV_REL WHERE id_statement = ${invoice!.id} ORDER BY id_invoice;`, ['id'])
    expect(wos.map((r) => Number(r.id))).toEqual([WO.t352.id, WO.t353.id])
  } finally {
    purgeStatements()
    exec(`UPDATE INVOICE SET approved = NULL WHERE id IN (${ids([WO.t352.id, WO.t353.id])});`)
  }
})

// ------------------------------------------------------------------ 3. individual y Print WO

test('individual: el PDF se abre en una pestaña nueva, la WO sale de la lista y Invoices la muestra como Individual', async ({ page }) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, TESLA, DAY)
  await expect(rowOf(page, WO.t355.nro)).toBeVisible({ timeout: 60_000 })
  // Print WO también abre pestaña.
  await expectPdfTab(page, () => rowAction(page, WO.t355.nro, 'Print WO'))

  await rowAction(page, WO.t354.nro, 'Generate Individual Invoice')
  await expect(page.getByRole('alertdialog').getByText(`An invoice will be generated from work order #${WO.t354.nro}.`)).toBeVisible()
  await expectPdfTab(page, () => page.getByRole('button', { name: 'Yes, invoice it' }).click())
  await expect(rowOf(page, WO.t354.nro)).toHaveCount(0)
  const invoice = activeInvoiceOf(WO.t354.id)
  expect(invoice?.type).toBe(1)
  await page.getByRole('link', { name: 'View in Invoices' }).click()
  await page.waitForURL((url) => url.pathname === '/billing/invoices')
  const invoiceRow = page.locator('main tbody tr').filter({ hasText: invoice!.nro })
  await expect(invoiceRow).toBeVisible({ timeout: 60_000 })
  await expect(invoiceRow).toContainText('Individual')
})

test('individual con Completed como único Status y alta anterior al rango: «View in Invoices» igual la muestra', async ({ page }) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, KIA, '11/12/2026')
  await onlyCompleted(page)
  await expect(rowOf(page, WO.kia.nro)).toBeVisible({ timeout: 60_000 })
  await rowAction(page, WO.kia.nro, 'Generate Individual Invoice')
  await expectPdfTab(page, () => page.getByRole('button', { name: 'Yes, invoice it' }).click())
  const invoice = activeInvoiceOf(WO.kia.id)
  await page.getByRole('link', { name: 'View in Invoices' }).click()
  await page.waitForURL((url) => url.pathname === '/billing/invoices')
  await expect(page.locator('main tbody tr').filter({ hasText: invoice!.nro })).toBeVisible({ timeout: 60_000 })
})

test('individual de subtotal cero con «Include Zero Value»: «View in Invoices» la muestra', async ({ page }) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, SUBARU, '11/08/2026')
  await includeZero(page)
  await expect(rowOf(page, WO.zero.nro)).toBeVisible({ timeout: 60_000 })
  await rowAction(page, WO.zero.nro, 'Generate Individual Invoice')
  await expectPdfTab(page, () => page.getByRole('button', { name: 'Yes, invoice it' }).click())
  const invoice = activeInvoiceOf(WO.zero.id)
  expect(invoice).not.toBeNull()
  await page.getByRole('link', { name: 'View in Invoices' }).click()
  await page.waitForURL((url) => url.pathname === '/billing/invoices')
  await expect(page.locator('main tbody tr').filter({ hasText: invoice!.nro })).toBeVisible({ timeout: 60_000 })
})

// ------------------------------------------------------------------ 4. RO# / PO#

test('RO# / PO#: edita y se ve; guardar lo mismo no suma Log; con RO# obligatorio, vacío marca el campo', async ({ page }) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, TESLA, DAY)
  const row = rowOf(page, WO.t355.nro)
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.getByRole('button', { name: 'Edit RO#' }).click()
  const dialog = page.getByRole('dialog')
  await page.locator('#wo-ro-po-value').fill('e2e-ro1')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect(row).toContainText('E2E-RO1')
  const logs = () => Number(scalar(`SELECT COUNT(*) FROM LOG_CHANGE WHERE id_invoice = ${WO.t355.id};`))
  const before = logs()
  await row.getByRole('button', { name: 'Edit RO#' }).click()
  await page.locator('#wo-ro-po-value').fill('E2E-RO1')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  expect(logs()).toBe(before)

  await pickDealerAndRange(page, MERCEDES, '08/26/2026')
  await includeZero(page)
  const required = rowOf(page, WO.roRequired.nro)
  await expect(required).toBeVisible({ timeout: 60_000 })
  await required.getByRole('button', { name: 'Edit RO#' }).click()
  await page.locator('#wo-ro-po-value').fill('')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByText('RO# is required for this work order')).toBeVisible()
  await expect(page.locator('#wo-ro-po-value')).toBeFocused()
  await expect(page.locator('#wo-ro-po-value')).toBeInViewport({ ratio: 1 })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

// ------------------------------------------------------------------ 5. eliminar

test('eliminar una y varias; una WO pagada responde «is billed!» y no se elimina', async ({ page }) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, TESLA, DAY)
  await expect(rowOf(page, WO.t355.nro)).toBeVisible({ timeout: 60_000 })
  await rowAction(page, WO.t355.nro, 'Delete WO')
  await expect(page.getByRole('alertdialog').getByText(`WO# ${WO.t355.nro} will be deleted.`)).toBeVisible()
  await page.getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByText(`WO# ${WO.t355.nro} deleted`)).toBeVisible()
  await expect(rowOf(page, WO.t355.nro)).toHaveCount(0)

  await tick(page, WO.t352.nro)
  await tick(page, WO.t353.nro)
  await page.getByRole('button', { name: 'Delete selected (2)' }).click()
  await expect(page.getByRole('alertdialog').getByText('2 work orders will be deleted.')).toBeVisible()
  await page.getByRole('button', { name: 'Yes, delete it' }).click()
  await expect(page.getByText('2 work orders deleted')).toBeVisible()
  await expect(rowOf(page, WO.t352.nro)).toHaveCount(0)
  await expect(rowOf(page, WO.t353.nro)).toHaveCount(0)
  expect(scalar(`SELECT GROUP_CONCAT(estado ORDER BY id) FROM INVOICE WHERE id IN (${ids([WO.t352.id, WO.t353.id, WO.t355.id])});`)).toBe('0,0,0')

  const billed = await page.request.post(`${API}/work-orders/delete`, { data: { ids: [WO.billed.id], bulk: true } })
  expect(billed.status()).toBe(200)
  expect(await billed.json()).toEqual({ deleted: [], failed: [{ id: WO.billed.id, fullNro: WO.billed.nro, reason: `WO ${WO.billed.nro} is billed!` }] })
  expect(scalar(`SELECT estado FROM INVOICE WHERE id = ${WO.billed.id};`)).toBe('1')
  // Las tres vuelven para las pruebas que siguen (afterAll igual devuelve todo).
  exec(`UPDATE INVOICE SET estado = 1 WHERE id IN (${ids([WO.t352.id, WO.t353.id, WO.t355.id])});`)
})

// ------------------------------------------------------------------ 6. permisos por API

/**
 * El 403 de las APIs de payroll en PHP: como todas (`invoice-statement-pdf.php`), contestan 200 con
 * `{"status":"fail","error":{"code":"403",…}}` (`ErrorManager`), y el proxy `/api/srs` lo pasa igual. Devuelve el código del cuerpo
 * (o el HTTP si no es 200) y comprueba que no llegó un PDF.
 */
async function phpStatus(p: Promise<{ status(): number; headers(): Record<string, string>; text(): Promise<string> }>): Promise<number> {
  const res = await p
  expect(res.headers()['content-type'] ?? '', 'no PDF').not.toContain('pdf')
  if (res.status() !== 200) return res.status()
  const body = JSON.parse(await res.text()) as { status?: string; error?: { code?: string } }
  return body.status === 'fail' ? Number(body.error?.code) : 200
}

const qs = new URLSearchParams({ idDealer: '897', dateFrom: '2026-11-10', dateTo: '2026-11-10' }).toString()

test('una WO o un servicio de otra empresa: 403 en la individual, RO# / PO#, el PDF y el generar; eliminar la deja en failed sin número', async ({ page }) => {
  await login(page)
  const statementsBefore = createdStatements()
  const statusOf = async (p: Promise<{ status(): number }>) => (await p).status()
  expect(await statusOf(page.request.post(`${API}/wo-to-be-billed/${FOREIGN_WO}/individual`, { data: { includeZero: false } }))).toBe(403)
  expect(await statusOf(page.request.put(`${API}/work-orders/${FOREIGN_WO}/ro-po`, { data: { field: 'ro', value: 'X' } }))).toBe(403)
  expect(await phpStatus(page.request.post(WO_PDF, { data: { idInvoice: FOREIGN_WO } }))).toBe(403)
  const body = { idDealer: 897, dateFrom: '2026-11-10', dateTo: '2026-11-10', invoiceType: 3 }
  expect(await statusOf(page.request.post(`${API}/wo-to-be-billed/generate`, { data: { ...body, departments: [FOREIGN_DEPARTMENT], services: [FOREIGN_SERVICE] } }))).toBe(403)
  const del = await page.request.post(`${API}/work-orders/delete`, { data: { ids: [FOREIGN_WO], bulk: true } })
  expect(del.status()).toBe(200)
  expect(await del.json()).toEqual({ deleted: [], failed: [{ id: FOREIGN_WO, reason: 'Forbidden' }] })
  expect(scalar(`SELECT estado FROM INVOICE WHERE id = ${FOREIGN_WO};`)).toBe('1')
  expect(createdStatements(), 'no invoice created').toEqual(statementsBefore)
})

test('sin «Invoices > Create Invoice»: todas las rutas nuevas responden 403 (también wo-pdf.php)', async ({ browser }) => {
  test.skip(E2E_MISSING_USER_REPORTS, 'Set E2E_USER_REPORTS / E2E_PASSWORD_REPORTS (a user without Create Invoice)')
  test.skip(
    scalar(`SELECT COUNT(*) FROM usuarios WHERE login = ${sqlText(E2E_USER_REPORTS)} AND estado = 1;`) === '0',
    'E2E_USER_REPORTS is not in the local copy: create it with plans/plan-reunion-juan-18-11/usuario-e2e-reportes.php',
  )
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  const page = await context.newPage()
  try {
    await login(page, E2E_USER_REPORTS, E2E_PASSWORD_REPORTS)
    const body = { idDealer: 897, dateFrom: '2026-11-10', dateTo: '2026-11-10', invoiceType: 3 }
    const calls: Array<[string, () => Promise<{ status(): number }>]> = [
      ['list', () => page.request.get(`${API}/wo-to-be-billed?${qs}&page=1&pageSize=25`)],
      ['summary', () => page.request.get(`${API}/wo-to-be-billed/summary?${qs}`)],
      ['config', () => page.request.get(`${API}/wo-to-be-billed/config?idDealer=897`)],
      ['preview', () => page.request.post(`${API}/wo-to-be-billed/preview`, { data: body })],
      ['generate', () => page.request.post(`${API}/wo-to-be-billed/generate`, { data: body })],
      ['individual', () => page.request.post(`${API}/wo-to-be-billed/${WO.t354.id}/individual`, { data: {} })],
      ['delete', () => page.request.post(`${API}/work-orders/delete`, { data: { ids: [WO.t354.id], bulk: true } })],
      ['ro-po', () => page.request.put(`${API}/work-orders/${WO.t354.id}/ro-po`, { data: { field: 'ro', value: 'X' } })],
    ]
    for (const [name, call] of calls) expect([name, (await call()).status()]).toEqual([name, 403])
    expect(await phpStatus(page.request.post(WO_PDF, { data: { idInvoice: WO.t354.id } }))).toBe(403)
    expect(scalar(`SELECT estado FROM INVOICE WHERE id = ${WO.t354.id};`)).toBe('1')
  } finally {
    await context.close()
  }
})

// ------------------------------------------------------------------ 7, 8 y 9: celular, doble clic, quieta

test('celular y compu: sin scroll horizontal, la tabla sin columnas fijas en celular y la pantalla quieta cuando no pasa nada', async ({
  page,
  isMobile,
}) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, TESLA, DAY)
  await expect(rowOf(page, WO.t352.nro)).toBeVisible({ timeout: 60_000 })
  await noHorizontalScroll(page)
  if (isMobile) {
    const pinned = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main table td, main table th')].filter((c) => {
        const s = getComputedStyle(c)
        return s.position === 'sticky' && (s.left !== 'auto' || s.right !== 'auto')
      }).length,
    )
    expect(pinned, 'no pinned column on a phone').toBe(0)
  }
  // Quieta: sin mutaciones del DOM durante 2 s (el bucle de renders de T10 hacía miles).
  const mutations = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0
        const obs = new MutationObserver((list) => (n += list.length))
        obs.observe(document.querySelector('main') ?? document.body, { subtree: true, childList: true, attributes: true, characterData: true })
        setTimeout(() => {
          obs.disconnect()
          resolve(n)
        }, 2_000)
      }),
  )
  expect(mutations).toBe(0)
})

test('filtros: «Clear all» limpia todo de una vez, otro dealer arranca sin departments y «Clear» del calendario vuelve al rango por defecto (R8, R9, R11)', async ({
  page,
}) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, TESLA, DAY)
  await expect(rowOf(page, WO.t352.nro)).toBeVisible({ timeout: 60_000 })
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes(`${API}/wo-to-be-billed?`)) requests.push(r.url())
  })
  const chips = page.locator('main').getByRole('button', { name: /^Clear (?!all$|search$)/ })

  // R8: tipo + Approved = No, «Clear all» → ningún chip.
  await chooseInvoiceType(page, 'Invoice Multi-Services')
  await page.getByTestId('wo-approved-filter').getByText('No', { exact: true }).click()
  await expect(chips).toHaveCount(2)
  await page.locator('main').getByRole('button', { name: 'Clear all' }).click()
  await expect(chips).toHaveCount(0)
  await expect(page.locator('#wo-filter-invoice-type')).toContainText('Select Type')

  // R9: un department de Tesla y después otro dealer: el pedido nuevo no lleva el department de Tesla.
  await chooseInvoiceType(page, 'Invoice Multi-Services')
  const dept = page.locator('main div.space-y-1').filter({ has: page.getByText('Department', { exact: true }) }).first()
  await dept.getByRole('combobox').click()
  await page.getByRole('option').first().click()
  await expect(page.locator('main').getByRole('button', { name: /^Clear Department/ })).toHaveCount(1)
  requests.length = 0
  await pickDealerAndRange(page, SUBARU, DAY)
  await expect.poll(() => requests.length, { timeout: 30_000 }).toBeGreaterThan(0)
  expect(requests.every((u) => !new URL(u).searchParams.has('departments')), requests.join('\n')).toBe(true)
  await expect(page.locator('main').getByRole('button', { name: /^Clear Department/ })).toHaveCount(0)
  await expect(page.locator('main').getByText(/^work orders$|No work orders to be billed/).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('main').getByText('Select one dealer to see its work orders')).toHaveCount(0)

  // R11: «Clear» del calendario vuelve al rango por defecto: la lista sigue consultando.
  const { scope, apply } = await filtersScope(page)
  await scope.getByRole('button', { name: /\d{2}\/\d{2}\/\d{4}/ }).first().click()
  await page.locator('[data-slot="popover-content"]').last().getByRole('button', { name: 'Clear', exact: true }).click()
  await apply()
  // En celular la hoja se cerró con Apply: se vuelve a abrir para leer el rango.
  const after = await filtersScope(page)
  await expect(after.scope.getByRole('button', { name: /\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}/ }).first()).toBeVisible()
  await after.apply()
  await expect(page.locator('main').getByText(/^work orders$|No work orders to be billed|records/).first()).toBeVisible()
})

test('doble clic en «Generate Invoices» con la respuesta demorada manda un solo pedido', async ({ page }) => {
  await login(page)
  await page.goto(ROUTE)
  await pickDealerAndRange(page, TESLA, DAY)
  await expect(rowOf(page, WO.t352.nro)).toBeVisible({ timeout: 60_000 })
  await chooseInvoiceType(page, 'Invoice Multi-Services')
  await tick(page, WO.t352.nro)
  const statementsBefore = createdStatements().length
  let generates = 0
  await page.route(`**${API}/wo-to-be-billed/generate`, async (route) => {
    generates += 1
    await new Promise((r) => setTimeout(r, 1_500))
    await route.continue()
  })
  await page.getByRole('button', { name: 'Generate Invoice', exact: true }).click()
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'Generate Invoices' })
  await expect(page.getByRole('dialog').getByTestId('wo-generate-count')).toHaveText('1 work order will be included in 1 invoice')
  await confirm.dblclick()
  await expect(page.getByText('1 invoice created')).toBeVisible({ timeout: 30_000 })
  expect(generates).toBe(1)
  expect(createdStatements(), 'exactly one invoice more').toHaveLength(statementsBefore + 1)
})
