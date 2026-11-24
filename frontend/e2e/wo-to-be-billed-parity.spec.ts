/**
 * Certificación de paridad entre los dos motores de «generar» (plans/plan-wo-to-be-billed-v0, T11): para cada caso de
 * una tabla fija, genera en **legacy** y en **PRO** lo mismo y compara lo que cada uno dejó en la base. Fuera del gate:
 * corre contra http://srs.com y http://pro.srs.com locales y la copia local de la base, con el usuario de
 * `.env.e2e.local` (Admin Company de Auto Wax). Solo en el proyecto `desktop`: no mira pantalla.
 *
 * - Legacy: el mismo pedido que manda la solapa Work Order to be Billed al confirmar (`doGenerateInv`,
 *   `public/modulos/billing/js/app.binvoice_main.js:1266-1290`) a `api.billing.php` (`tipo=updatecreate`), con la sesión
 *   de legacy del navegador.
 * - PRO: `POST /api/srs-kpis/billing/wo-to-be-billed/generate`, el que manda la pantalla.
 * - Entre uno y otro, las invoices creadas se borran de la base (con sus líneas, servicios elegidos y log): las WO
 *   vuelven a quedar pendientes y la copia queda como estaba.
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
const DEALER = 408
const FROM = '2026-11-09'
const TO = '2026-11-12'
const DEP_845 = 845
const DEP_846 = 846
const PDI = 11339
const FULL_DETAIL = 11340
const FULL_DETAIL_SERVICE = 11345

type Case = {
  name: string
  invoiceType: 2 | 3 | 4
  department?: number
  services?: number[]
  includeZero: boolean
  /** Índices de las WO pendientes (por id) que se tildan. */
  ticked?: number[]
}

const CASES: Case[] = [
  { name: '2 by Services, con servicio (PDI)', invoiceType: 2, department: DEP_845, services: [PDI], includeZero: false },
  { name: '2 by Services, sin servicio, con Include Zero Value', invoiceType: 2, includeZero: true },
  { name: '3 Multi-Services, sin servicio', invoiceType: 3, includeZero: false },
  { name: '3 Multi-Services, sin servicio, con Include Zero Value', invoiceType: 3, includeZero: true },
  { name: '3 Multi-Services, con servicio (Full Detail (Service))', invoiceType: 3, department: DEP_846, services: [FULL_DETAIL_SERVICE], includeZero: false },
  { name: '4 Selected Services (Full Detail y Full Detail (Service))', invoiceType: 4, services: [FULL_DETAIL, FULL_DETAIL_SERVICE], includeZero: false },
  { name: '3 Multi-Services con tres WO tildadas', invoiceType: 3, includeZero: false, ticked: [0, 2, 4] },
]

/** Las WO del dealer con algo pendiente en el rango (las que puede tocar la prueba). */
function pendingWos(): number[] {
  return query(
    `SELECT DISTINCT i.id FROM INVOICE i JOIN DEPARTMENT dp ON dp.id = i.id_department
      WHERE i.id_dealer_provider = ${PROVIDER} AND dp.id_dealer = ${DEALER} AND i.estado = 1 AND i.wo_imported = 0
        AND i.fecha_alta >= '${FROM}' AND i.fecha_alta <= DATE_ADD('${TO}', INTERVAL 1 DAY) AND WO_IS_FULL_INVOICED(i.id) = 0
      ORDER BY i.id;`,
    ['id'],
  ).map((r) => Number(r.id))
}

let maxStatement = 0
let wos: number[] = []

/** Lo que dejó un motor: cada invoice nueva del dealer, ordenada por servicio y department. */
function snapshot() {
  const invoices = query(
    `SELECT id, statement_type, IFNULL(id_department, ''), IFNULL(id_invoice_service, ''), id_author,
            DATE_FORMAT(fecha_desde, '%Y-%m-%d'), DATE_FORMAT(fecha_hasta, '%Y-%m-%d'), IFNULL(invoice_service_sel_rel, ''), IFNULL(po, '')
       FROM INVOICE_STATEMENT WHERE id > ${maxStatement} AND id_dealer = ${DEALER} AND id_dealer_provider = ${PROVIDER} AND estado = 1
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

function purge() {
  const created = query(
    `SELECT id FROM INVOICE_STATEMENT WHERE id > ${maxStatement} AND id_dealer = ${DEALER} AND id_dealer_provider = ${PROVIDER};`,
    ['id'],
  ).map((r) => Number(r.id))
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

test.describe('paridad legacy ↔ PRO al generar', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Parity does not depend on the screen size')
    maxStatement = Number(scalar('SELECT COALESCE(MAX(id), 0) FROM INVOICE_STATEMENT;'))
    wos = pendingWos()
    expect(wos.length, 'the dealer has pending work orders in the range').toBeGreaterThan(10)
  })

  test.afterAll(({}, testInfo) => {
    if (testInfo.project.name !== 'desktop') return
    purge()
    expect(pendingWos(), 'the work orders are pending again, as before').toEqual(wos)
    const file = resolve(__dirname, '../test-results/wo-to-be-billed-parity.md')
    mkdirSync(resolve(file, '..'), { recursive: true })
    writeFileSync(
      file,
      [
        `Paridad legacy ↔ PRO — dealer ${DEALER}, ${FROM} … ${TO}, ${new Date().toISOString().slice(0, 10)}`,
        '',
        '| Caso | Invoices legacy | Invoices PRO | (WO, servicio) | Total | Resultado |',
        '|---|---|---|---|---|---|',
        ...results,
        '',
      ].join('\n'),
    )
  })

  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      const ticked = (c.ticked ?? []).map((i) => wos[i])
      // 1. Legacy, con su sesión.
      await legacyLogin(page)
      const form: Record<string, string> = {
        'data[tipo]': 'updatecreate',
        'data[id_dealer]': String(DEALER),
        'data[id_dealer_provider]': String(PROVIDER),
        'data[fecha_desde]': FROM,
        'data[fecha_hasta]': TO,
        'data[type_invoice]': String(c.invoiceType),
        'data[id_inv_service]': c.invoiceType !== 4 ? String(c.services?.[0] ?? '') : (c.services ?? []).join(','),
        'data[id_department]': c.invoiceType !== 4 ? String(c.department ?? '') : '',
        'data[exclude_cero]': c.includeZero ? '1' : '',
        'data[ids_wo]': ticked.join(','),
        'data[id_status_in]': '',
      }
      const legacyRes = await page.request.post(`${LEGACY}/modulos/billing/api/api.billing.php`, { form, timeout: 120_000 })
      expect(legacyRes.status()).toBe(200)
      const legacy = snapshot()
      purge()

      // 2. PRO, con la sesión de PRO.
      await login(page)
      const body = {
        idDealer: DEALER,
        dateFrom: FROM,
        dateTo: TO,
        invoiceType: c.invoiceType,
        includeZero: c.includeZero,
        ...(c.department ? { departments: [c.department] } : {}),
        ...(c.services ? { services: c.services } : {}),
        ...(ticked.length ? { woIds: ticked } : {}),
      }
      const proRes = await page.request.post('/api/srs-kpis/billing/wo-to-be-billed/generate', { data: body, timeout: 120_000 })
      expect(proRes.status(), await proRes.text()).toBe(200)
      const pro = snapshot()
      purge()

      const pairs = (s: ReturnType<typeof snapshot>) => s.flatMap((i) => i.lines).length
      const cents = (s: ReturnType<typeof snapshot>) => s.reduce((a, i) => a + i.cents, 0)
      const same = JSON.stringify(legacy) === JSON.stringify(pro)
      results.push(
        `| ${c.name} | ${legacy.length} | ${pro.length} | ${pairs(legacy)} / ${pairs(pro)} | $${(cents(legacy) / 100).toFixed(2)} / $${(cents(pro) / 100).toFixed(2)} | ${same ? 'igual' : '**distinto**'} |`,
      )
      expect(legacy.length, 'legacy created invoices').toBeGreaterThan(0)
      expect(pro).toEqual(legacy)
    })
  }
})
