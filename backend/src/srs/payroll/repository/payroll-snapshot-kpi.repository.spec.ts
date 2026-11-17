import { DataSource } from 'typeorm'

import type { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PayrollSnapshotKpiRepository } from './payroll-snapshot-kpi.repository'

/**
 * `excludeEmployeeIds` de los dos métodos del Monthly Closing (plans/plan-monthly-closing-vendors T5): el NOT IN va en
 * cada rama (también la de `p.id_dealer IS NULL`), con sus params en el orden de los `?`; vacío = la consulta de antes.
 * La suma real contra la copia está en monthly-closing-integration.spec.ts (P4).
 */
function filter(partial: Partial<SrsKpiFilter> = {}): SrsKpiFilter {
  return {
    idDealerProvider: 79,
    idUsuario: 76,
    dealerIds: [627, 301],
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-31',
    filterDateDone: false,
    includeZero: true,
    skipDealerRestriction: true,
    includeRemovedDealers: false,
    ...partial,
  }
}

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length

function repoWithSpy() {
  const query = jest.fn().mockResolvedValue([])
  return { repo: new PayrollSnapshotKpiRepository({ query } as unknown as DataSource), query }
}

const PERIODS = ['2026-10-01', '2026-10-16']

describe('PayrollSnapshotKpiRepository — excludeEmployeeIds (vendors del closing)', () => {
  it('amountsByDealerPeriodType: NOT IN en la rama con dealer y en la de Without dealer, params en orden', async () => {
    const { repo, query } = repoWithSpy()
    await repo.amountsByDealerPeriodType(filter(), PERIODS, true, null, [6985, 7653])
    const [sql, params] = query.mock.calls[0]
    expect((sql.match(/AND p\.id_usuario NOT IN \(\?,\?\)/g) ?? []).length).toBe(2)
    expect(params).toEqual([79, ...PERIODS, 6985, 7653, 627, 301, 79, ...PERIODS, 6985, 7653])
    expect(placeholders(sql)).toBe(params.length)
  })

  it('amountsByDealerPeriodType: con employeeIds (tinteros) y vendors, los dos filtros y en orden', async () => {
    const { repo, query } = repoWithSpy()
    await repo.amountsByDealerPeriodType(filter(), PERIODS, false, [5439, 3958], [5439])
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('AND p.id_usuario IN (?,?) AND p.id_usuario NOT IN (?)')
    expect(params).toEqual([79, ...PERIODS, 5439, 3958, 5439, 627, 301])
    expect(placeholders(sql)).toBe(params.length)
  })

  it('amountsByDealerPeriodType: sin vendors (o lista vacía) la consulta es la de antes', async () => {
    const a = repoWithSpy()
    const b = repoWithSpy()
    await a.repo.amountsByDealerPeriodType(filter(), PERIODS, true)
    await b.repo.amountsByDealerPeriodType(filter(), PERIODS, true, null, [])
    expect(a.query.mock.calls[0][0]).not.toContain('NOT IN')
    expect(b.query.mock.calls[0]).toEqual(a.query.mock.calls[0])
  })

  it('amountsByDealerEmployeeForPeriods: NOT IN antes del filtro de dealer, para un dealer, all y none', async () => {
    for (const dealer of [627, 'all', 'none'] as const) {
      const { repo, query } = repoWithSpy()
      await repo.amountsByDealerEmployeeForPeriods(filter(), PERIODS, dealer, null, [6985])
      const [sql, params] = query.mock.calls[0]
      expect(sql).toContain('AND p.id_usuario NOT IN (?)')
      expect(params.slice(0, 4)).toEqual([79, ...PERIODS, 6985])
      expect(placeholders(sql)).toBe(params.length)
    }
  })

  it('amountsByDealerEmployeeForPeriods: sin vendors la consulta es la de antes', async () => {
    const a = repoWithSpy()
    const b = repoWithSpy()
    await a.repo.amountsByDealerEmployeeForPeriods(filter(), PERIODS, 'all')
    await b.repo.amountsByDealerEmployeeForPeriods(filter(), PERIODS, 'all', null, [])
    expect(a.query.mock.calls[0][0]).not.toContain('NOT IN')
    expect(b.query.mock.calls[0]).toEqual(a.query.mock.calls[0])
  })
})
