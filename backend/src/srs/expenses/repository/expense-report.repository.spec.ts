import { DataSource } from 'typeorm'

import type { ExpenseListFilter } from '../expense-list-filter'
import { EXPENSE_IDENTITY_SQL, ExpenseReportRepository } from './expense-report.repository'

function filter(partial: Partial<ExpenseListFilter> = {}): ExpenseListFilter {
  return {
    idDealerProvider: 79,
    idUsuario: 76,
    skipDealerRestriction: false,
    dealerIds: [408, 86],
    includeRemovedDealers: false,
    from: '2026-11-01',
    to: '2026-11-30',
    deleted: false,
    ...partial,
  }
}

function placeholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length
}

describe('ExpenseReportRepository.buildExpenseWhere (una sola definición de Total Expenses)', () => {
  const repo = new ExpenseReportRepository({ query: jest.fn() } as unknown as DataSource)

  it('siempre acota por empresa y estado, con BETWEEN de puntas incluidas y RESTRICTION_DEALER_V2', () => {
    const { sql, params } = repo.buildExpenseWhere(filter())
    expect(sql).toContain('e.id_detailer = ?')
    expect(sql).toContain('e.estado = ?')
    expect(sql).toContain('e.ticket_date BETWEEN ? AND ?')
    expect(sql).toContain('RESTRICTION_DEALER_V2(?, c.id) = 1')
    expect(params).toEqual([79, 1, '2026-11-01', '2026-11-30', 76, 408, 86])
    expect(placeholders(sql)).toBe(params.length)
  })

  it('Admin: sin RESTRICTION_DEALER_V2; Show deleted = estado 0', () => {
    const { sql, params } = repo.buildExpenseWhere(filter({ skipDealerRestriction: true, deleted: true }))
    expect(sql).not.toContain('RESTRICTION_DEALER_V2')
    expect(sql).toContain('c.id IN (?,?)')
    expect(params).toEqual([79, 0, '2026-11-01', '2026-11-30', 408, 86])
  })

  it('status: pending → IS NULL, approved → 1, rejected → 0; montos normalizados a dos decimales', () => {
    expect(repo.buildExpenseWhere(filter({ status: 'pending' })).sql).toContain('e.is_approved IS NULL')
    expect(repo.buildExpenseWhere(filter({ status: 'approved' })).sql).toContain('e.is_approved = 1')
    expect(repo.buildExpenseWhere(filter({ status: 'rejected' })).sql).toContain('e.is_approved = 0')
    const { sql, params } = repo.buildExpenseWhere(filter({ amountMin: '10', amountMax: '99.5', idCompany: 3, idAuthor: 4 }))
    expect(sql).toContain('e.amount >= ?')
    expect(sql).toContain('e.amount <= ?')
    expect(params.slice(-4)).toEqual([3, 4, '10.00', '99.50'])
    expect(placeholders(sql)).toBe(params.length)
  })

  it('exige al menos un dealer', () => {
    expect(() => repo.buildExpenseWhere(filter({ dealerIds: [] }))).toThrow('At least one dealer id is required')
  })

  it('«Include removed dealers» solo para Admin: suma DEALER_REL_REMOVED del provider de la sesión', () => {
    const { sql, params } = repo.buildExpenseWhere(filter({ skipDealerRestriction: true, includeRemovedDealers: true }))
    expect(sql).toContain('DEALER_REL_REMOVED')
    expect(params).toEqual([79, 1, '2026-11-01', '2026-11-30', 408, 86, 79, 79])
    const restricted = repo.buildExpenseWhere(filter({ includeRemovedDealers: true }))
    expect(restricted.sql).not.toContain('DEALER_REL_REMOVED')
  })
})

describe('ExpenseReportRepository — cada query bindea tantos parámetros como «?» tiene', () => {
  function repoWith(answers: (sql: string) => unknown[]) {
    const calls: { sql: string; params: unknown[] }[] = []
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return answers(sql)
    })
    return { repo: new ExpenseReportRepository({ query } as unknown as DataSource), calls }
  }

  const rawRow = (id: number, group: number | null) => ({
    id,
    idExpGroup: group,
    ticketDate: '2026-11-02',
    idCompany: 1,
    companyName: 'C',
    idCategory: 2,
    categoryName: 'K',
    idDealer: 408,
    dealerName: 'D',
    amount: '10.00',
    idAuthor: 76,
    authorName: 'J',
    idCreatedBy: 76,
    createdByName: 'J',
    isApproved: null,
    idAuthorApproved: null,
    approvedByName: null,
    approvedDate: null,
    description: '',
    receiptNumber: '',
    notes: '',
    estado: 1,
    idExpRepetitive: null,
    hasLog: 0,
    hasAttachment: 0,
    groupSplitType: group ? 2 : null,
    groupAttachmentExpense: group ? id : null,
    inScope: 1,
  })

  it('list: count, identidades, filas y agregados del grupo', async () => {
    const { repo, calls } = repoWith((sql) => {
      if (sql.includes('COUNT(DISTINCT')) return [{ total: 2 }]
      if (sql.includes('AS ident')) return [{ ident: 'g5' }, { ident: 'e9' }]
      if (sql.includes('AS gid')) return [{ gid: 5, total: 2, approved: 0, rejected: 0, inScope: 2, hasLog: 0, totalAmount: '20.00' }]
      return [rawRow(9, null), rawRow(1, 5), rawRow(2, 5)]
    })
    const out = await repo.list(filter(), 0, 25, 'dealer', 'asc')
    expect(out.total).toBe(2)
    expect(out.rows.map((r) => r.kind)).toEqual(['group', 'single'])
    const group = out.rows[0]
    if (group.kind === 'group') {
      expect(group.visibleRows).toBe(2)
      expect(group.visibleTotal).toBe('20.00')
      expect(group.readOnly).toBe(false)
      expect(group.rows.map((r) => r.percentage)).toEqual(['50.00', '50.00'])
    }
    for (const c of calls) expect(placeholders(c.sql)).toBe(c.params.length)
    expect(calls.some((c) => c.sql.includes(EXPENSE_IDENTITY_SQL))).toBe(true)
  })

  it('summary, amountsBy, amountsByDealer, employees y logRows', async () => {
    const { repo, calls } = repoWith((sql) => {
      if (sql.includes('COALESCE(SUM(e.amount), 0) AS total')) return [{ total: '30.00', count: 2 }]
      // La lista de dealers eliminados (removedDealersOfProviderListSql) no toca EXP_EXPENSE.
      if (!sql.includes('EXP_EXPENSE')) return []
      return [{ id: 1, name: 'X', count: 1, total: '30.00', accidentTotal: '0.00', dealerId: 1, dealer: 'X' }]
    })
    const summary = await repo.summary(filter())
    expect(summary).toEqual({ total: '30.00', count: 2, average: '15.00', topCategory: { id: 1, name: 'X', total: '30.00' } })
    const analytics = await repo.amountsBy(filter({ skipDealerRestriction: true, includeRemovedDealers: true }), 'dealer')
    expect(analytics.rows[0]).toMatchObject({ id: 1, total: '30.00', prevTotal: '30.00' })
    await repo.amountsByDealer(filter())
    await repo.employees(79, 'an', [408, 86])
    await repo.employees(79, '', [])
    await repo.logRows(9, 5, filter())
    await repo.logRows(9, 5, filter({ skipDealerRestriction: true }))
    // Un usuario de alcance parcial no ve las líneas ni el nombre de los dealers fuera de su alcance (D8).
    const logCalls = calls.filter((c) => c.sql.includes('LOG_GENERIC'))
    expect(logCalls[0].sql.match(/RESTRICTION_DEALER_V2/g)).toHaveLength(2)
    expect(logCalls[1].sql).not.toContain('RESTRICTION_DEALER_V2')
    await repo.rowsByIds([1, 2], filter())
    await repo.rowsByGroup(5, 1, filter())
    await repo.exportRows(filter())
    for (const c of calls) expect(placeholders(c.sql)).toBe(c.params.length)
  })
})
