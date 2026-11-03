import { fromCents, toCents } from 'src/features/srs-expense/rules/expense-rules'
import { GROUP_SPLIT_AMOUNT, GROUP_SPLIT_EQUAL } from 'src/features/expense-group/entity/expense-group.entity'
import type { ExpenseGroupRow, ExpenseSingleRow, ExpenseStatus, GroupSplitType } from './dto/expense-row.dto'

/** Una fila cruda del SELECT de expense-report.repository.ts (nombres de columna del alias). */
export interface RawExpenseRow {
  id: unknown
  idExpGroup: unknown
  ticketDate: unknown
  idCompany: unknown
  companyName: unknown
  idCategory: unknown
  categoryName: unknown
  idDealer: unknown
  dealerName: unknown
  amount: unknown
  idAuthor: unknown
  authorName: unknown
  idCreatedBy: unknown
  createdByName: unknown
  isApproved: unknown
  idAuthorApproved: unknown
  approvedByName: unknown
  approvedDate: unknown
  description: unknown
  receiptNumber: unknown
  notes: unknown
  estado: unknown
  idExpRepetitive: unknown
  hasLog: unknown
  hasAttachment: unknown
  groupSplitType: unknown
  groupAttachmentExpense: unknown
  inScope: unknown
}

/** Lo que el repositorio agrega por grupo (sin la restricción de dealers, pero con el mismo `estado`). */
export interface GroupAggregate {
  total: number
  approved: number
  rejected: number
  inScope: number
  hasLog: boolean
  /** Suma de todas las filas del grupo con ese `estado` (no solo las visibles), en centavos. */
  totalCents: number
}

/** Una fila single más lo que el servidor necesita para armar el grupo. */
export interface SingleWithMeta {
  row: ExpenseSingleRow
  inScope: boolean
  groupSplitType: number | null
  groupAttachmentExpense: number | null
}

export function money(value: unknown): string {
  return fromCents(toCents(value as string))
}

export function statusOf(isApproved: unknown): ExpenseStatus {
  if (isApproved === null || isApproved === undefined) return 'pending'
  return Number(isApproved) === 1 ? 'approved' : 'rejected'
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function ymd(value: unknown): string {
  const s = text(value)
  return s.length >= 10 ? s.slice(0, 10) : s
}

/** Una fila cruda → ExpenseRow(single) + lo que arma el grupo. */
export function toSingle(r: RawExpenseRow): SingleWithMeta {
  const idAuthorApproved = Number(r.idAuthorApproved ?? 0)
  const row: ExpenseSingleRow = {
    kind: 'single',
    id: Number(r.id),
    ticketDate: ymd(r.ticketDate),
    company: { id: Number(r.idCompany ?? 0), name: text(r.companyName) },
    category: { id: Number(r.idCategory ?? 0), name: text(r.categoryName) },
    dealer: { id: Number(r.idDealer ?? 0), name: text(r.dealerName) },
    amount: money(r.amount),
    author: { id: Number(r.idAuthor ?? 0), name: text(r.authorName) },
    createdBy: { id: Number(r.idCreatedBy ?? 0), name: text(r.createdByName) },
    status: statusOf(r.isApproved),
    description: text(r.description),
    receiptNumber: text(r.receiptNumber),
    notes: text(r.notes),
    deleted: Number(r.estado) !== 1,
    hasLog: Number(r.hasLog) === 1,
    hasAttachment: Number(r.hasAttachment) === 1,
    groupId: r.idExpGroup === null || r.idExpGroup === undefined ? null : Number(r.idExpGroup),
  }
  if (idAuthorApproved > 0) {
    row.approvedBy = { id: idAuthorApproved, name: text(r.approvedByName), date: r.approvedDate ? text(r.approvedDate) : null }
  }
  if (r.idExpRepetitive !== null && r.idExpRepetitive !== undefined) row.idExpRepetitive = Number(r.idExpRepetitive)
  return {
    row,
    inScope: Number(r.inScope) === 1,
    groupSplitType: r.groupSplitType === null || r.groupSplitType === undefined ? null : Number(r.groupSplitType),
    groupAttachmentExpense:
      r.groupAttachmentExpense === null || r.groupAttachmentExpense === undefined ? null : Number(r.groupAttachmentExpense),
  }
}

export function groupSplitTypeName(splitType: number | null): GroupSplitType {
  if (splitType === GROUP_SPLIT_EQUAL) return 'equal'
  if (splitType === GROUP_SPLIT_AMOUNT) return 'amount'
  return 'percent'
}

/** Status de un grupo (F2): Approved solo si todas sus filas lo están; Rejected si todas; si no, Pending. */
export function groupStatus(agg: Pick<GroupAggregate, 'total' | 'approved' | 'rejected'>): ExpenseStatus {
  if (agg.total > 0 && agg.approved === agg.total) return 'approved'
  if (agg.total > 0 && agg.rejected === agg.total) return 'rejected'
  return 'pending'
}

/**
 * Porcentaje de cada fila, en centésimas (no está en la base): su parte sobre el total del grupo. Con el grupo entero a la
 * vista suman 100,00: los centavos que el redondeo le sumó a la fila mayor en `splitAmount` no se cuentan como porcentaje,
 * y la diferencia va a esa misma fila (la de mayor monto; en un empate, la de mayor dealer). Así, volver a grabar lo
 * precargado da los mismos montos.
 */
export function derivePercentages(
  rows: Pick<ExpenseSingleRow, 'id' | 'amount' | 'dealer'>[],
  agg: Pick<GroupAggregate, 'total' | 'totalCents'>,
): Map<number, number> {
  const out = new Map<number, number>()
  if (agg.totalCents <= 0) return out
  let sum = 0
  for (const r of rows) {
    const pct = Math.round((toCents(r.amount) * 10000) / agg.totalCents)
    out.set(r.id, pct)
    sum += pct
  }
  if (rows.length === agg.total && rows.length > 0 && sum !== 10000) {
    const biggest = [...rows].sort((a, b) => toCents(b.amount) - toCents(a.amount) || b.dealer.id - a.dealer.id)[0]
    out.set(biggest.id, (out.get(biggest.id) as number) + 10000 - sum)
  }
  return out
}

/**
 * La fila padre «All dealers (k of N)» (D8): `visibleRows` son las filas que pasan los filtros y el alcance del
 * usuario; `totalRows` todas las del grupo con ese `estado`; `readOnly` cuando el alcance (no el filtro Branch)
 * deja afuera alguna fila: `agg.inScope < agg.total`.
 */
export function buildGroupRow(groupId: number, visible: SingleWithMeta[], agg: GroupAggregate): ExpenseGroupRow {
  const first = visible[0]
  const visibleTotal = visible.reduce((acc, v) => acc + toCents(v.row.amount), 0)
  const attachmentId = first.groupAttachmentExpense
  const attachmentRow = visible.find((v) => v.row.id === attachmentId)
  const anyRepetitive = visible.find((v) => v.row.idExpRepetitive !== undefined)
  const splitType = groupSplitTypeName(first.groupSplitType)
  // El adjunto es del grupo (vive bajo id_attachment_expense): todas sus filas lo muestran.
  const groupHasAttachment = attachmentRow ? attachmentRow.row.hasAttachment : false
  const percentages = splitType === 'percent' ? derivePercentages(visible.map((v) => v.row), agg) : null
  const rows = visible.map((v) => {
    const row = groupHasAttachment && !v.row.hasAttachment ? { ...v.row, hasAttachment: true } : v.row
    if (!percentages) return row
    return { ...row, percentage: agg.totalCents > 0 ? fromCents(percentages.get(row.id) as number) : null }
  })
  const group: ExpenseGroupRow = {
    kind: 'group',
    groupId,
    splitType,
    ticketDate: first.row.ticketDate,
    company: first.row.company,
    category: first.row.category,
    visibleTotal: fromCents(visibleTotal),
    visibleRows: visible.length,
    totalRows: agg.total,
    readOnly: agg.inScope < agg.total,
    status: groupStatus(agg),
    approvedCount: agg.approved,
    rejectedCount: agg.rejected,
    author: first.row.author,
    createdBy: first.row.createdBy,
    description: first.row.description,
    receiptNumber: first.row.receiptNumber,
    notes: first.row.notes,
    deleted: first.row.deleted,
    hasLog: agg.hasLog || visible.some((v) => v.row.hasLog),
    hasAttachment: groupHasAttachment,
    rows,
  }
  if (attachmentId) group.attachmentExpenseId = attachmentId
  if (anyRepetitive) group.idExpRepetitive = anyRepetitive.row.idExpRepetitive
  return group
}
