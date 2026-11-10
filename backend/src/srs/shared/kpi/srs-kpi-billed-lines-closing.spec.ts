import { billedBaseOpts, woBilledLinesSql } from './srs-kpi-billed-lines'

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
