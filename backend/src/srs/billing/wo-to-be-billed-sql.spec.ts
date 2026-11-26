import {
  billableLineSql,
  buildWoToBeBilledWhere,
  isCompletedOnly,
  isEmptyByDefinition,
  totalExpr,
  WoToBeBilledFilter,
} from './wo-to-be-billed-sql'
import { buildWoInvoicePlan } from './wo-invoice-plan'
import type { PendingLine } from './repository/wo-to-be-billed.repository'

/** WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): el armado del filtro (T4) y el plan de invoices (T3). */

const base: WoToBeBilledFilter = {
  idDealerProvider: 232,
  idDealer: 594,
  dateFrom: '2026-10-01',
  dateTo: '2026-11-12',
  status: [],
  departments: [],
  services: [],
  invoiceType: null,
  includeZero: false,
  approved: '',
  wo: null,
  stock: null,
  price: null,
  ro: null,
  po: null,
  woIds: [],
}

const where = (patch: Partial<WoToBeBilledFilter>) => buildWoToBeBilledWhere({ ...base, ...patch })
const marks = (sql: string) => (sql.match(/\?/g) ?? []).length

describe('buildWoToBeBilledWhere', () => {
  it('fijos: empresa, dealer, activas, no importadas, rango sobre la fecha de alta', () => {
    const w = where({})
    expect(w.sql).toContain('AND i.id_dealer_provider = ?')
    expect(w.sql).toContain('AND dpto.id_dealer = ?')
    expect(w.sql).toContain('AND i.estado = 1')
    expect(w.sql).toContain('AND i.wo_imported = 0')
    expect(w.sql).toContain('AND i.fecha_alta >= ?')
    expect(w.sql).toContain('AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)') // semiabierto (R1)
    expect(w.params).toEqual(expect.arrayContaining([232, 594, '2026-10-01', '2026-11-12']))
  })

  it('sin rango: toda la historia del dealer, sin fecha de alta ni de Completed (como legacy al entrar)', () => {
    const w = where({ dateFrom: null, dateTo: null })
    expect(w.sql).not.toContain('fecha_alta')
    expect(w.sql).toContain('AND dpto.id_dealer = ?')
    const completed = where({ dateFrom: null, dateTo: null, status: [7] })
    expect(completed.sql).toContain('AND i.id_workflow = ?')
    expect(completed.sql).not.toContain('date_last_chg_workflow')
  })

  it('sin «Include Zero Value»: NO_CEROS + total > 0 + líneas con precio; con él, WO_IS_FULL_INVOICED', () => {
    const off = where({ includeZero: false })
    expect(off.sql).toContain('WO_IS_FULL_INVOICED_NO_CEROS(i.id) = 0')
    expect(off.sql).toContain('GET_TOTAL_BY_INVOICE(i.id, 0) > 0')
    expect(off.sql).toContain('isr.price > 0')
    const on = where({ includeZero: true })
    expect(on.sql).toContain('WO_IS_FULL_INVOICED(i.id) = 0')
    expect(on.sql).not.toContain('NO_CEROS')
    expect(on.sql).not.toContain('isr.price > 0')
  })

  it('Completed como único Status: contra date_last_chg_workflow y sin la fecha de alta (D8)', () => {
    expect(isCompletedOnly({ ...base, status: [7] })).toBe(true)
    const w = where({ status: [7] })
    expect(w.sql).toContain('AND i.id_workflow = ?')
    expect(w.sql).toContain('AND i.date_last_chg_workflow BETWEEN ? AND ?')
    expect(w.sql).not.toContain('i.fecha_alta >=')
  })

  it('Completed + Pause no dispara la regla de Completed (D8)', () => {
    expect(isCompletedOnly({ ...base, status: [7, 16] })).toBe(false)
    const w = where({ status: [7, 16] })
    expect(w.sql).toContain('AND i.id_workflow IN (?,?)')
    expect(w.sql).toContain('AND i.fecha_alta >= ?')
    expect(w.sql).not.toContain('date_last_chg_workflow')
  })

  it("Approved '0' filtra (no se confunde con vacío); '' no filtra", () => {
    expect(where({ approved: '0' }).sql).toContain('AND i.approved = ?')
    expect(where({ approved: '0' }).params).toContain(0)
    expect(where({ approved: '' }).sql).not.toContain('i.approved')
  })

  it('cada filtro por columna con su rama de legacy', () => {
    const w = where({ wo: '87', stock: 'S1', price: 85.5, ro: 'R1', po: 'P1', departments: [492], woIds: [1, 2] })
    expect(w.sql).toContain('AND i.full_nro LIKE ?')
    expect(w.params).toContain('%87%')
    expect(w.sql).toContain('AND c.stock_number = ?')
    expect(w.sql).toContain('AND EQUAL_INVOICE_PRICE(i.id, ?)')
    expect(w.sql).toContain('AND i.ro = ?')
    expect(w.sql).toContain('AND i.po = ?')
    expect(w.sql).toContain('AND i.id_department IN (?)')
    expect(w.sql).toContain('AND i.id IN (?,?)')
  })

  it('con servicios: los dos EXISTS de legacy, el total por los servicios y la línea facturable', () => {
    const w = where({ services: [10, 11], invoiceType: 4 })
    expect(w.sql).toContain('IS_WO_SERVICE_INVOICED(isr.id_service_invoice,i.id)=0')
    expect(w.sql).toContain('GET_TOTAL_BY_INVOICE_IN(i.id, ?) > 0')
    expect(w.params).toContain('10,11')
    expect(totalExpr({ ...base, services: [10, 11] }).params).toEqual(['10,11'])
    expect(billableLineSql({ ...base, services: [10, 11] }).sql).toContain('isr.id_service_invoice IN (?,?)')
  })

  it('«by Services» sin servicio: la línea es del department de la WO y con nombre', () => {
    expect(billableLineSql({ ...base, invoiceType: 2 }).sql).toContain("i.id_department = _is.id_department AND _is.nombre <> ''")
    expect(billableLineSql({ ...base, invoiceType: 3 }).sql).not.toContain('_is.id_department')
  })

  it('«Selected Services» sin servicios: vacía sin consultar', () => {
    expect(isEmptyByDefinition({ ...base, invoiceType: 4 })).toBe(true)
    expect(isEmptyByDefinition({ ...base, invoiceType: 4, services: [1] })).toBe(false)
  })

  it('ningún valor del pedido queda dentro del texto del SQL: un ? por valor', () => {
    const evil = "x' OR 1=1 -- "
    const w = where({ wo: evil, stock: evil, ro: evil, po: evil, status: [15, 5], departments: [1, 2], services: [3], invoiceType: 2, woIds: [9], approved: '1', price: 1 })
    expect(w.sql).not.toContain('OR 1=1')
    expect(w.sql).not.toContain('2026-10-01')
    expect(marks(w.sql)).toBe(w.params.length)
  })
})

const line = (idInvoice: number, idServiceInvoice: number, serviceDepartment = 492): PendingLine => ({
  idInvoice,
  idServiceInvoice,
  price: 10,
  serviceDepartment,
  serviceName: `S${idServiceInvoice}`,
  useQty: 0,
})

describe('buildWoInvoicePlan (tabla de T3)', () => {
  const lines = [line(1, 100), line(2, 100), line(1, 200, 493), line(3, 300)]

  it('sin líneas: plan vacío (D10)', () => {
    expect(buildWoInvoicePlan({ invoiceType: 3, departments: [], services: [] }, [])).toEqual({ invoices: [], workOrders: 0 })
  })

  it('2 sin servicio: una invoice por servicio, en el orden de las líneas, con el department del servicio', () => {
    const plan = buildWoInvoicePlan({ invoiceType: 2, departments: [], services: [] }, lines)
    expect(plan.invoices.map((i) => [i.idInvoiceService, i.idDepartment, i.lines.length])).toEqual([
      [100, 492, 2],
      [200, 493, 1],
      [300, 492, 1],
    ])
    expect(plan.workOrders).toBe(3)
    expect(plan.invoices.every((i) => i.statementType === 2)).toBe(true)
  })

  it('2 con servicio: una, con el department y el servicio elegidos', () => {
    const plan = buildWoInvoicePlan({ invoiceType: 2, departments: [492], services: [100] }, [line(1, 100), line(2, 100)])
    expect(plan.invoices).toHaveLength(1)
    expect(plan.invoices[0]).toMatchObject({ statementType: 2, idDepartment: 492, idInvoiceService: 100 })
  })

  it('3 sin servicio: una con todo; department elegido o nulo', () => {
    const none = buildWoInvoicePlan({ invoiceType: 3, departments: [], services: [] }, lines)
    expect(none.invoices).toHaveLength(1)
    expect(none.invoices[0]).toMatchObject({ statementType: 3, idDepartment: null, idInvoiceService: null })
    expect(none.invoices[0].lines).toHaveLength(4)
    const dep = buildWoInvoicePlan({ invoiceType: 3, departments: [492], services: [] }, lines)
    expect(dep.invoices[0].idDepartment).toBe(492)
  })

  it('3 con servicio: una, con el servicio', () => {
    const plan = buildWoInvoicePlan({ invoiceType: 3, departments: [492], services: [100] }, [line(1, 100)])
    expect(plan.invoices[0]).toMatchObject({ statementType: 3, idDepartment: 492, idInvoiceService: 100 })
  })

  it('4: una, sin department ni servicio', () => {
    const plan = buildWoInvoicePlan({ invoiceType: 4, departments: [492], services: [100, 200] }, lines)
    expect(plan.invoices).toHaveLength(1)
    expect(plan.invoices[0]).toMatchObject({ statementType: 4, idDepartment: null, idInvoiceService: null })
  })
})
