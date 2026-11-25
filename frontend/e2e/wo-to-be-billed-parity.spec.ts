/**
 * Certificación de paridad entre los dos motores de «generar» (plans/plan-wo-to-be-billed-v0, T11): para cada caso de
 * una tabla fija, genera en **PRO**, lo elimina como «Delete invoice» de Invoices (las WO vuelven a quedar pendientes),
 * genera lo mismo en **legacy** y compara lo que cada uno dejó en la base (pedido de Ignacio del 25/11/2026). Fuera del gate:
 * corre contra http://srs.com y http://pro.srs.com locales y la copia local de la base, con el usuario de
 * `.env.e2e.local` (Admin Company de Auto Wax). Solo en el proyecto `desktop`: no mira pantalla.
 *
 * - Legacy: el mismo pedido que manda la solapa Work Order to be Billed al confirmar (`doGenerateInv`,
 *   `public/modulos/billing/js/app.binvoice_main.js:1266-1290`) a `api.billing.php` (`tipo=updatecreate`), con la sesión
 *   de legacy del navegador.
 * - PRO: `POST /api/srs-kpis/billing/wo-to-be-billed/generate`, el que manda la pantalla.
 * - Al terminar cada caso, todo lo creado (también lo que PRO dio de baja) se borra de la base, con sus líneas,
 *   servicios elegidos y log: la copia queda como estaba.
 * - Status: legacy lo respeta al generar (`InvoiceStatementHelperService::generateInv`, con la regla de Completed solo).
 *   Approved, WO #, Stock, Price, RO# y PO# no: PRO factura lo que la lista muestra (§3 del plan), así que no entran.
 *
 * Se compara: cantidad de invoices; por invoice, tipo, department, servicio, fechas, autor y servicios elegidos; el
 * conjunto de (WO, servicio); y el total. Los casos usan solo filtros que legacy respeta al generar y no tocan D9 (tope
 * de 100 servicios) ni D10 (legacy crea una invoice vacía si lo único pendiente de un servicio vale cero y no se incluye
 * el cero: por eso «by Services» sin servicio va con «Include Zero Value», porque Lot Wash solo tiene líneas en $0).
 *
 * El resultado, caso por caso, queda en `test-results/wo-to-be-billed-parity.md` y se copia a AVANCE.md del plan.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { E2E_MISSING_USER, E2E_MISSING_USER_REASON, LEGACY, legacyLogin, login } from './helpers'
import { exec, ids, localDbMissing, query, scalar } from './local-db'

test.skip(E2E_MISSING_USER, E2E_MISSING_USER_REASON)
const dbMissing = localDbMissing()
test.skip(dbMissing != null, dbMissing ?? '')

const PROVIDER = 79
/** Dealer con muchas WO pendientes en el rango (todas Completed). */
const D408 = { id: 408, from: '2026-11-09', to: '2026-11-12' }
/** Dealer con WO In Transit y Completed pendientes: para los casos de Status. */
const D169 = { id: 169, from: '2026-11-09', to: '2026-11-12' }
const DEP_845 = 845
const DEP_846 = 846
const PDI = 11339
const FULL_DETAIL = 11340
const FULL_DETAIL_SERVICE = 11345
const IN_TRANSIT = 15
const COMPLETED = 7

type Dealer = { id: number; from: string; to: string }
type Case = {
  name: string
  dealer: Dealer
  invoiceType: 2 | 3 | 4
  department?: number
  services?: number[]
  includeZero: boolean
  /** Índices de las WO pendientes (por id) que se tildan. */
  ticked?: number[]
  status?: number[]
}

const CASES: Case[] = [
  { name: '2 by Services, con servicio (PDI)', dealer: D408, invoiceType: 2, department: DEP_845, services: [PDI], includeZero: false },
  { name: '2 by Services, con servicio (PDI), con Include Zero Value', dealer: D408, invoiceType: 2, department: DEP_845, services: [PDI], includeZero: true },
  { name: '2 by Services, sin servicio, con Include Zero Value', dealer: D408, invoiceType: 2, includeZero: true },
  { name: '2 by Services, sin servicio, con dos WO tildadas', dealer: D408, invoiceType: 2, includeZero: true, ticked: [1, 3] },
  { name: '3 Multi-Services, sin servicio', dealer: D408, invoiceType: 3, includeZero: false },
  { name: '3 Multi-Services, sin servicio, con Include Zero Value', dealer: D408, invoiceType: 3, includeZero: true },
  { name: '3 Multi-Services, con servicio (Full Detail (Service))', dealer: D408, invoiceType: 3, department: DEP_846, services: [FULL_DETAIL_SERVICE], includeZero: false },
  { name: '3 Multi-Services con tres WO tildadas', dealer: D408, invoiceType: 3, includeZero: false, ticked: [0, 2, 4] },
  { name: '4 Selected Services (Full Detail y Full Detail (Service))', dealer: D408, invoiceType: 4, services: [FULL_DETAIL, FULL_DETAIL_SERVICE], includeZero: false },
  { name: '4 Selected Services, un servicio (PDI), con Include Zero Value', dealer: D408, invoiceType: 4, services: [PDI], includeZero: true },
  { name: '4 Selected Services con dos WO tildadas', dealer: D408, invoiceType: 4, services: [FULL_DETAIL, FULL_DETAIL_SERVICE, PDI], includeZero: false, ticked: [0, 1] },
  { name: 'Status In Transit, 3 Multi-Services', dealer: D169, invoiceType: 3, includeZero: true, status: [IN_TRANSIT] },
  { name: 'Status Completed solo (fecha de paso a Completed), 3 Multi-Services', dealer: D169, invoiceType: 3, includeZero: true, status: [COMPLETED] },
  { name: 'Status In Transit y Completed, 2 by Services sin servicio', dealer: D169, invoiceType: 2, includeZero: true, status: [IN_TRANSIT, COMPLETED] },
  { name: 'Otro dealer, 3 Multi-Services, sin servicio', dealer: D169, invoiceType: 3, includeZero: false },
]

/** Las WO del dealer con algo pendiente en el rango (las que puede tocar la prueba). */
function pendingWos(d: Dealer): number[] {
  return query(
    `SELECT DISTINCT i.id FROM INVOICE i JOIN DEPARTMENT dp ON dp.id = i.id_department
      WHERE i.id_dealer_provider = ${PROVIDER} AND dp.id_dealer = ${d.id} AND i.estado = 1 AND i.wo_imported = 0
        AND i.fecha_alta >= '${d.from}' AND i.fecha_alta <= DATE_ADD('${d.to}', INTERVAL 1 DAY) AND WO_IS_FULL_INVOICED(i.id) = 0
      ORDER BY i.id;`,
    ['id'],
  ).map((r) => Number(r.id))
}

let maxStatement = 0
const before = new Map<number, number[]>()

/** Las invoices activas que creó esta corrida para el dealer. */
function createdActive(d: Dealer): number[] {
  return query(
    `SELECT id FROM INVOICE_STATEMENT WHERE id > ${maxStatement} AND id_dealer = ${d.id} AND id_dealer_provider = ${PROVIDER} AND estado = 1 ORDER BY id;`,
    ['id'],
  ).map((r) => Number(r.id))
}

/** Lo que dejó un motor: cada invoice nueva y activa del dealer, ordenada por servicio y department. */
function snapshot(d: Dealer) {
  const invoices = query(
    `SELECT id, statement_type, IFNULL(id_department, ''), IFNULL(id_invoice_service, ''), id_author,
            DATE_FORMAT(fecha_desde, '%Y-%m-%d'), DATE_FORMAT(fecha_hasta, '%Y-%m-%d'), IFNULL(invoice_service_sel_rel, ''), IFNULL(po, '')
       FROM INVOICE_STATEMENT WHERE id > ${maxStatement} AND id_dealer = ${d.id} AND id_dealer_provider = ${PROVIDER} AND estado = 1
      ORDER BY id;`,
    ['id', 'type', 'department', 'service', 'author', 'from', 'to', 'selRel', 'po'],
  )
  const out = invoices.map((inv) => {
    const lines = query(
      `SELECT r.id_invoice, r.id_invoice_service, isr.price FROM INVOICE_STATEMENT_INV_REL r
         JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = r.id_invoice AND isr.id_service_invoice = r.id_invoice_service
        WHERE r.id_statement = ${Number(inv.id)} ORDER BY r.id_invoice, r.id_invoice_service;`,
      ['wo', 'service', 'price'],
    )
    const selected = query(`SELECT id_inv_service FROM INVOICE_STATEMENT_SEL_SER_REL WHERE id_statement = ${Number(inv.id)} ORDER BY id;`, ['s']).map(
      (r) => r.s,
    )
    return {
      type: inv.type,
      department: inv.department,
      service: inv.service,
      author: inv.author,
      from: inv.from,
      to: inv.to,
      selRel: inv.selRel,
      po: inv.po,
      selected,
      lines: lines.map((l) => `${l.wo}/${l.service}`),
      cents: lines.reduce((a, l) => a + Math.round(Number(l.price) * 100), 0),
    }
  })
  return out.sort((a, b) => `${a.service}|${a.department}`.localeCompare(`${b.service}|${b.department}`))
}

/** Borra de la base todo lo que creó la corrida (también las que PRO dio de baja): la copia queda como estaba. */
function purge() {
  const created = query(`SELECT id FROM INVOICE_STATEMENT WHERE id > ${maxStatement} AND id_dealer_provider = ${PROVIDER};`, ['id']).map((r) =>
    Number(r.id),
  )
  if (!created.length) return
  const list = ids(created)
  exec(
    `DELETE FROM LOG_CHANGE WHERE id_invoice_statement IN (${list});
     DELETE FROM INVOICE_STATEMENT_SEL_SER_REL WHERE id_statement IN (${list});
     DELETE FROM INVOICE_STATEMENT_INV_REL WHERE id_statement IN (${list});
     DELETE FROM INVOICE_STATEMENT WHERE id IN (${list});`,
  )
}

const results: string[] = []

test.describe('paridad PRO ↔ legacy al generar', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Parity does not depend on the screen size')
    maxStatement = Number(scalar('SELECT COALESCE(MAX(id), 0) FROM INVOICE_STATEMENT;'))
    for (const d of [D408, D169]) before.set(d.id, pendingWos(d))
    expect(before.get(D408.id)!.length, 'dealer 408 has pending work orders in the range').toBeGreaterThan(10)
    expect(before.get(D169.id)!.length, 'dealer 169 has pending work orders in the range').toBeGreaterThan(3)
  })

  test.afterAll(({}, testInfo) => {
    if (testInfo.project.name !== 'desktop') return
    purge()
    for (const d of [D408, D169]) expect(pendingWos(d), `dealer ${d.id}: the work orders are pending again, as before`).toEqual(before.get(d.id))
    const file = resolve(__dirname, '../test-results/wo-to-be-billed-parity.md')
    mkdirSync(resolve(file, '..'), { recursive: true })
    writeFileSync(
      file,
      [
        `Paridad PRO ↔ legacy — empresa ${PROVIDER}, ${new Date().toISOString().slice(0, 10)}`,
        '',
        '| Caso | Dealer y rango | Invoices PRO | Invoices legacy | (WO, servicio) PRO / legacy | Total PRO / legacy | Resultado |',
        '|---|---|---|---|---|---|---|',
        ...results,
        '',
      ].join('\n'),
    )
  })

  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      const d = c.dealer
      const ticked = (c.ticked ?? []).map((i) => before.get(d.id)![i])
      expect(ticked.every((id) => id != null), 'the ticked work orders exist').toBe(true)

      // 1. PRO: lo que manda la pantalla al confirmar «Generate Invoices».
      await login(page)
      const body = {
        idDealer: d.id,
        dateFrom: d.from,
        dateTo: d.to,
        invoiceType: c.invoiceType,
        includeZero: c.includeZero,
        ...(c.status ? { status: c.status } : {}),
        ...(c.department ? { departments: [c.department] } : {}),
        ...(c.services ? { services: c.services } : {}),
        ...(ticked.length ? { woIds: ticked } : {}),
      }
      const proRes = await page.request.post('/api/srs-kpis/billing/wo-to-be-billed/generate', { data: body, timeout: 120_000 })
      expect(proRes.status(), await proRes.text()).toBe(200)
      const pro = snapshot(d)

      // 2. Se eliminan en PRO, como «Delete invoice» de Invoices: las WO vuelven a quedar pendientes.
      const created = createdActive(d)
      expect(created.length, 'PRO created invoices').toBeGreaterThan(0)
      const del = await page.request.post('/api/srs/php/api/payroll/invoice-statement-delete.php', {
        data: { ids_statement: created },
        timeout: 120_000,
      })
      expect(del.status(), await del.text()).toBe(200)
      expect(createdActive(d), 'the PRO invoices are deleted').toEqual([])
      expect(pendingWos(d), 'after deleting, the work orders are pending again').toEqual(before.get(d.id))

      // 3. Legacy: el mismo pedido que manda la solapa al confirmar (`doGenerateInv`), con la sesión de legacy.
      await legacyLogin(page)
      const form: Record<string, string> = {
        'data[tipo]': 'updatecreate',
        'data[id_dealer]': String(d.id),
        'data[id_dealer_provider]': String(PROVIDER),
        'data[fecha_desde]': d.from,
        'data[fecha_hasta]': d.to,
        'data[type_invoice]': String(c.invoiceType),
        'data[id_inv_service]': c.invoiceType !== 4 ? String(c.services?.[0] ?? '') : (c.services ?? []).join(','),
        'data[id_department]': c.invoiceType !== 4 ? String(c.department ?? '') : '',
        'data[exclude_cero]': c.includeZero ? '1' : '',
        'data[ids_wo]': ticked.join(','),
        'data[id_status_in]': (c.status ?? []).join(','),
      }
      const legacyRes = await page.request.post(`${LEGACY}/modulos/billing/api/api.billing.php`, { form, timeout: 120_000 })
      expect(legacyRes.status()).toBe(200)
      const legacy = snapshot(d)
      purge()

      const pairs = (s: ReturnType<typeof snapshot>) => s.flatMap((i) => i.lines).length
      const cents = (s: ReturnType<typeof snapshot>) => s.reduce((a, i) => a + i.cents, 0)
      const same = JSON.stringify(legacy) === JSON.stringify(pro)
      results.push(
        `| ${c.name} | ${d.id}, ${d.from} … ${d.to} | ${pro.length} | ${legacy.length} | ${pairs(pro)} / ${pairs(legacy)} | $${(cents(pro) / 100).toFixed(2)} / $${(cents(legacy) / 100).toFixed(2)} | ${same ? 'igual' : '**distinto**'} |`,
      )
      expect(pro.length, 'PRO created invoices').toBeGreaterThan(0)
      expect(pro).toEqual(legacy)
    })
  }
})
