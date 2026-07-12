import { formatUsDateForExport, formatUsTimeForExport } from '@/lib/format-us-datetime'
import {
  breakEndMethod,
  breakStartMethod,
  formatMethodForExport,
  punchInMethod,
  punchOutMethod,
} from '@/lib/ttk/punch-method'
import { formatDurationDisplay } from '@/lib/ttk/map-header-filters'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'

export type TtkListExportLabels = {
  employee: string
  roleDept: string
  date: string
  punchIn: string
  breakStart: string
  breakEnd: string
  punchOut: string
  timeWork: string
  timeBreak: string
  paymentType: string
  dealer: string
  hasError: string
  yes: string
  no: string
}

function roleLabel(row: TtkListRow): string {
  if (!row.rolDpto) return ''
  return [row.rolDpto.role, row.rolDpto.department].filter(Boolean).join(' / ')
}

function punchErrorLabel(row: TtkListRow): string | null {
  const res = row.badPunch?.res?.trim()
  return res ? res : null
}

/** Flat row for XLS export — mirrors IssuesDataTable column export values. */
export function ttkListRowToExportRecord(
  row: TtkListRow,
  labels: TtkListExportLabels,
  options: { includePaymentType: boolean },
): Record<string, string | number> {
  const out: Record<string, string | number> = {
    [labels.employee]: row.usuario?.nombre ?? '',
    [labels.roleDept]: roleLabel(row),
    [labels.dealer]: row.dealer?.razonSocial ?? '',
    [labels.date]: formatUsDateForExport(row.punchInGmt0),
    [labels.punchIn]: (() => {
      const time = formatUsTimeForExport(row.punchInGmt0)
      return time ? time + formatMethodForExport(punchInMethod(row)) : ''
    })(),
    [labels.breakStart]: (() => {
      const time = formatUsTimeForExport(row.breakStartGmt0)
      return time ? time + formatMethodForExport(breakStartMethod(row)) : ''
    })(),
    [labels.breakEnd]: (() => {
      const time = formatUsTimeForExport(row.breakEndGmt0)
      return time ? time + formatMethodForExport(breakEndMethod(row)) : ''
    })(),
    [labels.punchOut]: (() => {
      const time = formatUsTimeForExport(row.punchOutGmt0)
      return time ? time + formatMethodForExport(punchOutMethod(row)) : ''
    })(),
    [labels.timeWork]: formatDurationDisplay(row.timeWork),
    [labels.timeBreak]: formatDurationDisplay(row.timeBreak),
    [labels.hasError]: punchErrorLabel(row) ? labels.yes : labels.no,
  }

  if (options.includePaymentType) {
    out[labels.paymentType] = row.objPaymentType?.name ?? ''
  }

  return out
}
