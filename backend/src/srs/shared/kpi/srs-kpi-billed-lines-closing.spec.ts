import { billedBaseOpts, woAssignedToSql, woBilledLinesSql } from './srs-kpi-billed-lines'

/**
 * groupBy 'closingLine' con y sin `withCar` (plans/plan-income-by-dealer-por-servicio T1): sin la opción el SQL del
 * Monthly Closing queda igual; con ella, la línea de WO trae el auto de la WO al final del SELECT.
 */
const BASE = {
  idDealerProvider: 188,
  idUsuario: 5,
  dealerIds: [196, 199],
  fechaDesde: '2026-01-01',
  fechaHasta: '2026-10-31',
  includeZero: false,
  skipDealerRestriction: true,
}

const countPlaceholders = (sql: string) => (sql.match(/\?/g) ?? []).length

describe("woBilledLinesSql groupBy 'closingLine' y withCar", () => {
  const { wo } = billedBaseOpts(BASE)
  const opts = { ...wo, groupBy: 'closingLine' as const, productionValue: true }

  it('sin withCar no trae el auto', () => {
    const q = woBilledLinesSql(opts)
    expect(q.sql).not.toContain('id_car')
    expect(q.sql).toContain("SELECT c.id AS dealerId, 'wo' AS kind, i.full_nro AS nro,")
  })

  it('con withCar agrega i.id_car AS idCar al final del SELECT y no cambia nada más', () => {
    const base = woBilledLinesSql(opts)
    const withCar = woBilledLinesSql({ ...opts, withCar: true })
    expect(withCar.params).toEqual(base.params)
    expect(countPlaceholders(withCar.sql)).toBe(withCar.params.length)
    const select = withCar.sql.slice(0, withCar.sql.indexOf('\nFROM '))
    expect(select.trim().endsWith(', i.id_car AS idCar')).toBe(true)
    expect(withCar.sql.replace(', i.id_car AS idCar', '')).toBe(base.sql)
  })

  it('withCar sin closingLine tira error', () => {
    expect(() => woBilledLinesSql({ ...wo, groupBy: 'dealer', productionValue: true, withCar: true })).toThrow()
    expect(() => woBilledLinesSql({ ...wo, withCar: true })).toThrow()
  })
})

/** assignedTo (plans/plan-window-tint-closing-tint-y-servicios T2): solo las WO asignadas a esos empleados. */
describe("woBilledLinesSql groupBy 'closingLine' y assignedTo", () => {
  const { wo } = billedBaseOpts(BASE)
  const opts = { ...wo, groupBy: 'closingLine' as const, productionValue: true }

  it('agrega una subconsulta escalar (no EXISTS: MariaDB la vuelve semi-join) sobre INVOICE_EMPLOYEE_REL, con los ids al final', () => {
    const base = woBilledLinesSql(opts)
    const q = woBilledLinesSql({ ...opts, assignedTo: [11, 22] })
    expect(q.sql).toContain('(SELECT 1 FROM INVOICE_EMPLOYEE_REL ier')
    expect(q.sql).toMatch(/LIMIT 1\) IS NOT NULL/)
    expect(q.sql).not.toMatch(/EXISTS \(SELECT 1 FROM INVOICE_EMPLOYEE_REL/)
    expect(q.sql).toContain('ier.id_invoice = i.id AND ier.id_usuario IN (?,?)')
    expect(q.params).toEqual([...base.params, 11, 22])
    expect(countPlaceholders(q.sql)).toBe(q.params.length)
  })

  it('woAssignedToSql sin empleados no agrega nada', () => {
    expect(woAssignedToSql('i', undefined)).toEqual({ sql: '', params: [] })
    expect(woAssignedToSql('i', [])).toEqual({ sql: '', params: [] })
  })

  it('assignedTo vacío o sin closingLine tira error', () => {
    expect(() => woBilledLinesSql({ ...opts, assignedTo: [] })).toThrow()
    expect(() => woBilledLinesSql({ ...wo, groupBy: 'dealer', productionValue: true, assignedTo: [1] })).toThrow()
  })
})
