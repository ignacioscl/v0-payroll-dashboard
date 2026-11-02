import { fromCents, splitAmount, toCents } from 'src/features/srs-expense/rules/expense-rules'
import { buildGroupRow, derivePercentages, groupStatus, toSingle, type RawExpenseRow } from './expense-row-assembler'

describe('derivePercentages', () => {
  const dealers = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const cases: [string, string[]][] = [
    ['100.01', ['33.33', '33.33', '33.34']],
    ['100.00', ['50.00', '25.00', '25.00']],
    ['0.50', ['33.33', '33.33', '33.34']],
    ['1234.57', ['10.00', '45.55', '44.45']],
    ['9999.99', ['33.34', '33.33', '33.33']],
  ]

  it.each(cases)('$%s: suma 100 y volver a grabar da los mismos montos', (total, pcts) => {
    const assigns = dealers.map((d, i) => ({ id: d.id, percentage: pcts[i] }))
    const amounts = splitAmount(total, assigns)
    const rows = dealers.map((d) => ({ id: d.id * 10, amount: amounts[String(d.id)], dealer: { id: d.id, name: '' } }))
    const out = derivePercentages(rows, { total: 3, totalCents: toCents(total) })
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(10000)
    const again = splitAmount(total, dealers.map((d) => ({ id: d.id, percentage: fromCents(out.get(d.id * 10) as number) })))
    expect(again).toEqual(amounts)
  })

  it('con parte del grupo a la vista no fuerza la suma', () => {
    const rows = [{ id: 10, amount: '25.00', dealer: { id: 1, name: '' } }]
    expect(derivePercentages(rows, { total: 3, totalCents: 10000 }).get(10)).toBe(2500)
  })
})

function raw(partial: Partial<RawExpenseRow>): RawExpenseRow {
  return {
    id: 1,
    idExpGroup: 5,
    ticketDate: '2026-11-02',
    idCompany: 10,
    companyName: 'Home Depot',
    idCategory: 20,
    categoryName: 'Tools',
    idDealer: 408,
    dealerName: 'Acura of Melbourne',
    amount: '33.33',
    idAuthor: 76,
    authorName: 'Javier',
    idCreatedBy: 76,
    createdByName: 'Javier',
    isApproved: null,
    idAuthorApproved: null,
    approvedByName: null,
    approvedDate: null,
    description: 'Rollos',
    receiptNumber: 'A-1',
    notes: '',
    estado: 1,
    idExpRepetitive: null,
    hasLog: 1,
    hasAttachment: 0,
    groupSplitType: 1,
    groupAttachmentExpense: 1,
    inScope: 1,
    ...partial,
  }
}

describe('expense-row-assembler (F2 / D8)', () => {
  it('toSingle mapea status, flags y montos con dos decimales', () => {
    const single = toSingle(raw({ amount: '12.5', isApproved: 1, idAuthorApproved: 9, approvedByName: 'Ana', approvedDate: '2026-11-02 10:00:00' }))
    expect(single.row.status).toBe('approved')
    expect(single.row.amount).toBe('12.50')
    expect(single.row.approvedBy).toEqual({ id: 9, name: 'Ana', date: '2026-11-02 10:00:00' })
    expect(single.row.hasLog).toBe(true)
    expect(single.row.deleted).toBe(false)
    expect(single.inScope).toBe(true)
    expect(toSingle(raw({ isApproved: 0 })).row.status).toBe('rejected')
    expect(toSingle(raw({ estado: 0 })).row.deleted).toBe(true)
  })

  it('groupStatus: Approved solo si todas; Rejected si todas; si no, Pending', () => {
    expect(groupStatus({ total: 3, approved: 3, rejected: 0 })).toBe('approved')
    expect(groupStatus({ total: 3, approved: 0, rejected: 3 })).toBe('rejected')
    expect(groupStatus({ total: 3, approved: 2, rejected: 0 })).toBe('pending')
    expect(groupStatus({ total: 3, approved: 1, rejected: 2 })).toBe('pending')
  })

  it('buildGroupRow: «All branches (k of N)», visibleTotal de las visibles y readOnly por alcance (D8)', () => {
    const visible = [
      toSingle(raw({ id: 1, amount: '33.33' })),
      toSingle(raw({ id: 2, amount: '33.33', idDealer: 86 })),
    ]
    const group = buildGroupRow(5, visible, { total: 3, approved: 1, rejected: 1, inScope: 2, hasLog: false, totalCents: 10000 })
    expect(group.kind).toBe('group')
    expect(group.rows[0].percentage).toBeUndefined() // Equal: sin porcentaje
    expect(group.visibleRows).toBe(2)
    expect(group.totalRows).toBe(3)
    expect(group.visibleTotal).toBe('66.66')
    expect(group.readOnly).toBe(true)
    expect(group.status).toBe('pending')
    expect(group.approvedCount).toBe(1)
    expect(group.rejectedCount).toBe(1)
    expect(group.splitType).toBe('equal')
    expect(group.attachmentExpenseId).toBe(1)
    expect(group.hasLog).toBe(true)
    expect(group.rows).toHaveLength(2)
  })

  it('buildGroupRow: con todas las filas en el alcance no es de solo lectura aunque el filtro Branch oculte filas', () => {
    const visible = [toSingle(raw({ id: 1, amount: '50.00' }))]
    const group = buildGroupRow(5, visible, { total: 2, approved: 2, rejected: 0, inScope: 2, hasLog: true, totalCents: 10000 })
    expect(group.readOnly).toBe(false)
    expect(group.visibleRows).toBe(1)
    expect(group.totalRows).toBe(2)
    expect(group.status).toBe('approved')
    expect(group.hasLog).toBe(true)
  })

  it('buildGroupRow: en By percentage cada fila lleva su porcentaje derivado del total del grupo', () => {
    const visible = [
      toSingle(raw({ id: 1, amount: '624.81', groupSplitType: 2 })),
      toSingle(raw({ id: 13, amount: '627.28', groupSplitType: 2 })),
    ]
    const group = buildGroupRow(7, visible, { total: 13, approved: 0, rejected: 0, inScope: 13, hasLog: false, totalCents: 812500 })
    expect(group.splitType).toBe('percent')
    expect(group.rows.map((r) => r.percentage)).toEqual(['7.69', '7.72'])
    expect(group.visibleTotal).toBe('1252.09')
  })
})
