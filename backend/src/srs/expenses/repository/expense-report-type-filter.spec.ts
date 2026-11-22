import { DataSource } from 'typeorm'

import { ExpenseReportRepository } from './expense-report.repository'
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
  const PIECEWORK = 'EXISTS (SELECT 1 FROM EXP_EXPENSE_PIECEWORK_WO pw WHERE pw.id_expense = e.id AND pw.deleted_at IS NULL)'

  it('All: no filtra por tipo', () => {
    expect(repo.buildExpenseWhere(filter()).sql).not.toContain('EXP_EXPENSE_PIECEWORK_WO')
  })

  it('Piecework: solo las que tienen WO', () => {
    expect(repo.buildExpenseWhere(filter('piecework')).sql).toContain(` AND ${PIECEWORK}`)
  })

  it('Regular: las que no tienen WO, sin parámetros de más', () => {
    const where = repo.buildExpenseWhere(filter('regular'))
    expect(where.sql).toContain(` AND NOT ${PIECEWORK}`)
    expect((where.sql.match(/\?/g) ?? []).length).toBe(where.params.length)
  })
})
