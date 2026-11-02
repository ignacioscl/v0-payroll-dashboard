import { format } from 'date-fns'

import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { fmtMoney } from '@/lib/kpi-money'
import type { TranslateFn } from '@/lib/i18n/locale-context'
import type { ExpenseGroupRow, ExpenseRow, ExpenseSingleRow, ExpenseStatus, RuleRow } from '@/lib/srs-expenses-api'

/** Monto que llega como string con dos decimales → `$1,250.00`. */
export function fmtAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? fmtMoney(n) : String(value)
}

/** `YYYY-MM-DD` → `MM/DD/YYYY` sin pasar por Date (sin zonas horarias). */
export function fmtYmd(ymd: string | null | undefined): string {
  return formatUsCalendarDate(ymd) || '—'
}

/** Date local → `YYYY-MM-DD`. */
export function toYmd(date: Date | undefined): string {
  return date ? format(date, 'yyyy-MM-dd') : ''
}

/** `YYYY-MM-DD` → Date local (mediodía, así el día no se corre con la zona). */
export function ymdToDate(ymd: string | null | undefined): Date | undefined {
  if (!ymd) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
}

export function statusLabel(t: TranslateFn, status: ExpenseStatus): string {
  if (status === 'approved') return t('expenses.statusApproved')
  if (status === 'rejected') return t('expenses.statusRejected')
  return t('expenses.statusPending')
}

export function isGroupRow(row: ExpenseRow): row is ExpenseGroupRow {
  return row.kind === 'group'
}

export function rowKey(row: ExpenseRow): string {
  return row.kind === 'group' ? `g${row.groupId}` : `e${row.id}`
}

export function rowAmount(row: ExpenseRow): string {
  return row.kind === 'group' ? row.visibleTotal : row.amount
}

/** El id con el que se piden detalle, log y edición: el gasto, o la primera fila visible del grupo. */
export function rowDetailId(row: ExpenseRow): number | null {
  if (row.kind === 'single') return row.id
  return row.rows[0]?.id ?? null
}

/** Dónde vive el adjunto en el bucket: `tickets/{idDealer}/{idExpense}`. */
export function rowAttachmentLocation(row: ExpenseRow): { idDealer: number; idExpense: number } | null {
  if (row.kind === 'single') return { idDealer: row.dealer.id, idExpense: row.id }
  const target =
    (row.attachmentExpenseId != null ? row.rows.find((r) => r.id === row.attachmentExpenseId) : undefined) ??
    [...row.rows].sort((a, b) => a.id - b.id)[0]
  return target ? { idDealer: target.dealer.id, idExpense: target.id } : null
}

export function singleRowsOf(row: ExpenseRow): ExpenseSingleRow[] {
  return row.kind === 'group' ? row.rows : [row]
}

export const WEEK_DAY_KEYS = [
  'expenses.sunday',
  'expenses.monday',
  'expenses.tuesday',
  'expenses.wednesday',
  'expenses.thursday',
  'expenses.friday',
  'expenses.saturday',
] as const

export function weekDayName(t: TranslateFn, weekDay: number | null | undefined): string {
  if (weekDay === null || weekDay === undefined || weekDay < 0 || weekDay > 6) return ''
  return t(WEEK_DAY_KEYS[weekDay])
}

export function frequencyLabel(t: TranslateFn, rule: Pick<RuleRow, 'frequency' | 'weekDay'>): string {
  return rule.frequency === 'weekly'
    ? t('expenses.weeklyOn', { day: weekDayName(t, rule.weekDay) })
    : t('expenses.monthly')
}

export function splitLabel(t: TranslateFn, splitType: RuleRow['splitType']): string {
  return splitType === 'fixed' ? t('expenses.byFixedAmount') : t('expenses.byPercent')
}

/** `12.5` → `12.50%`. */
export function fmtPercent(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : String(value)
}
