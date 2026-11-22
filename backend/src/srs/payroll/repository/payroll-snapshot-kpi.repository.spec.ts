import { DataSource } from 'typeorm'

import type { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PayrollSnapshotKpiRepository } from './payroll-snapshot-kpi.repository'

/**
 * Los dos métodos del Monthly Closing ya no sacan a nadie (reunión con Juan 18/11, tema 4): los vendors cuentan en
 * Payroll como cualquier empleado y el cierre les resta lo que está en una expense Piecework
 * (ExpenseReportRepository.pieceworkInExpenses). Antes, plans/plan-monthly-closing-vendors T5 los sacaba con NOT IN.
 * La suma real contra la copia está en monthly-closing-integration.spec.ts.
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

describe('PayrollSnapshotKpiRepository — el closing no saca empleados (tema 4)', () => {
  it('amountsByDealerPeriodType: sin NOT IN en ninguna rama, params en orden', async () => {
    const { repo, query } = repoWithSpy()
    await repo.amountsByDealerPeriodType(filter(), PERIODS, true)
    const [sql, params] = query.mock.calls[0]
    expect(sql).not.toContain('NOT IN')
    expect(params).toEqual([79, ...PERIODS, 627, 301, 79, ...PERIODS])
    expect(placeholders(sql)).toBe(params.length)
  })

  it('amountsByDealerPeriodType: con employeeIds (tinteros), solo el IN', async () => {
    const { repo, query } = repoWithSpy()
    await repo.amountsByDealerPeriodType(filter(), PERIODS, false, [5439, 3958])
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('AND p.id_usuario IN (?,?)')
    expect(sql).not.toContain('NOT IN')
    expect(params).toEqual([79, ...PERIODS, 5439, 3958, 627, 301])
    expect(placeholders(sql)).toBe(params.length)
  })

  it('amountsByDealerEmployeeForPeriods: sin NOT IN, para un dealer, all y none', async () => {
    for (const dealer of [627, 'all', 'none'] as const) {
      const { repo, query } = repoWithSpy()
      await repo.amountsByDealerEmployeeForPeriods(filter(), PERIODS, dealer)
      const [sql, params] = query.mock.calls[0]
      expect(sql).not.toContain('NOT IN')
      expect(params.slice(0, 3)).toEqual([79, ...PERIODS])
      expect(placeholders(sql)).toBe(params.length)
    }
  })
})
