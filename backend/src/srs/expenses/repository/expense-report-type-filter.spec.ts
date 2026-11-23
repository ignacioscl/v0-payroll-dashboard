import { DataSource } from 'typeorm'

import { ExpenseReportRepository, IS_PIECEWORK_SQL } from './expense-report.repository'
import type { ExpenseListFilter } from '../expense-list-filter'

/** Tarjetas All / Regular / Piecework de Expenses List (Ignacio, 22/11): el WHERE común de lista, summary y export. */
const filter = (type?: 'regular' | 'piecework'): ExpenseListFilter => ({
  idDealerProvider: 79,
  idUsuario: 76,
  skipDealerRestriction: true,
  dealerIds: [627],
  includeRemovedDealers: false,
  from: '2026-11-01',
  to: '2026-11-30',
  deleted: false,
  type,
})

describe('ExpenseReportRepository.buildExpenseWhere — tipo de gasto', () => {
  const repo = new ExpenseReportRepository({} as DataSource)

  it('All: no filtra por tipo', () => {
    expect(repo.buildExpenseWhere(filter()).sql).not.toContain('EXP_EXPENSE_PIECEWORK_WO')
  })

  it('Piecework: solo las que tienen o tuvieron WO', () => {
    expect(repo.buildExpenseWhere(filter('piecework')).sql).toContain(` AND ${IS_PIECEWORK_SQL}`)
  })

  it('Regular: las que no tienen WO, sin parámetros de más', () => {
    const where = repo.buildExpenseWhere(filter('regular'))
    expect(where.sql).toContain(` AND NOT ${IS_PIECEWORK_SQL}`)
    expect((where.sql.match(/\?/g) ?? []).length).toBe(where.params.length)
  })
})

describe('IS_PIECEWORK_SQL — qué es una expense Piecework', () => {
  it('cuentan también las WO liberadas (T5b: una expense sin WO sigue siendo Piecework)', () => {
    expect(IS_PIECEWORK_SQL).not.toContain('deleted_at')
  })

  it('por grupo (CODE-review-T5 R2): una fila que quedó sin WO por un cambio de dealer sigue siendo Piecework', () => {
    expect(IS_PIECEWORK_SQL).toContain('pe.id = e.id OR (e.id_exp_group IS NOT NULL AND pe.id_exp_group = e.id_exp_group)')
  })
})
