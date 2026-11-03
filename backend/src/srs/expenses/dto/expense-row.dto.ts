/** Tipos del contrato de la API (plans/plan-expenses-pro/AVANCE.md). Montos como string con dos decimales. */

export type ExpenseStatus = 'pending' | 'approved' | 'rejected'
export type GroupSplitType = 'equal' | 'percent' | 'amount'

export interface NamedRef {
  id: number
  name: string
}

export interface ApprovedByRef extends NamedRef {
  date: string | null
}

/** Un gasto suelto (o una fila de un grupo). */
export interface ExpenseSingleRow {
  kind: 'single'
  id: number
  ticketDate: string
  company: NamedRef
  category: NamedRef
  dealer: NamedRef
  amount: string
  author: NamedRef
  createdBy: NamedRef
  status: ExpenseStatus
  approvedBy?: ApprovedByRef
  description: string
  receiptNumber: string
  notes: string
  deleted: boolean
  hasLog: boolean
  hasAttachment: boolean
  idExpRepetitive?: number
  /**
   * Solo en las filas de un grupo By percentage: el porcentaje de la fila sobre el total del grupo (todas sus filas
   * activas), a dos decimales. No está en la base (el grupo guarda importes): se deriva de `amount / total`.
   */
  percentage?: string | null
  /** Solo lo usa el servidor para armar el grupo (D8). No va al contrato, pero no molesta en la respuesta. */
  groupId?: number | null
}

/** Un gasto repartido entre dealers, como una fila «All dealers (k of N)». */
export interface ExpenseGroupRow {
  kind: 'group'
  groupId: number
  splitType: GroupSplitType
  ticketDate: string
  company: NamedRef
  category: NamedRef
  visibleTotal: string
  visibleRows: number
  totalRows: number
  readOnly: boolean
  status: ExpenseStatus
  approvedCount: number
  /** Filas rechazadas del grupo (con ese `estado`); pendientes = visibleRows - approvedCount - rejectedCount. */
  rejectedCount: number
  author: NamedRef
  createdBy: NamedRef
  description: string
  receiptNumber: string
  notes: string
  deleted: boolean
  hasLog: boolean
  hasAttachment: boolean
  attachmentExpenseId?: number
  idExpRepetitive?: number
  rows: ExpenseSingleRow[]
}

export type ExpenseRow = ExpenseSingleRow | ExpenseGroupRow
export type ExpenseDetail = ExpenseRow

export interface ExpenseListResponse {
  data: ExpenseRow[]
  total: number
  page: number
  pageSize: number
}

export interface ExpenseSummaryResponse {
  total: string
  count: number
  average: string
  topCategory?: { id: number; name: string; total: string }
}

export interface AnalyticsRow {
  id: number
  name: string
  count: number
  total: string
  prevTotal: string
  removed?: boolean
}

export interface AnalyticsResponse {
  total: string
  prevTotal: string
  rows: AnalyticsRow[]
}

export interface ExpenseLogEntry {
  id: number
  date: string
  author: NamedRef
  description: string
  scope: 'expense' | 'group'
  /** Línea de una fila de un grupo: su dealer. Null en las del grupo y en un gasto suelto. */
  dealer: string | null
}
