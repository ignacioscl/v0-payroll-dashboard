import {
  formatUsDateForExport,
  formatUsDateTimeForExport,
  formatUsTimeForExport,
} from '@/lib/format-us-datetime'
import {
  breakEndMethod,
  breakStartMethod,
  formatMethodForExport,
  punchInMethod,
  punchOutMethod,
} from '@/lib/ttk/punch-method'
import { formatDurationDisplay } from '@/lib/ttk/map-header-filters'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'
import { punchErrorVisible } from '@/lib/ttk/error-type-meta'
import { ALL_ERROR_TYPES } from '@/lib/filters/error-types-cookie'

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
  /**
   * Columnas del modo Corrected. Este export arma el XLSX EN EL NAVEGADOR desde
   * `fixes[]`: agregar columnas a la proyección del backend no las hace aparecer
   * acá, es un cableado distinto del stream Individual.
   */
  correctedTypes: string
  lastCorrectedAt: string
  deletedPunch: string
}

function roleLabel(row: TtkListRow): string {
  if (!row.rolDpto) return ''
  return [row.rolDpto.role, row.rolDpto.department].filter(Boolean).join(' / ')
}

/** Flat row for XLS export — mirrors IssuesDataTable column export values. */
export function ttkListRowToExportRecord(
  row: TtkListRow,
  labels: TtkListExportLabels,
  options: {
    includePaymentType: boolean
    includedErrorTypes?: readonly number[]
    /** Sólo en modo Corrected: agrega las columnas de corrección y el flag de eliminada. */
    includeCorrected?: boolean
    /** Nombre visible de cada código 1|2|3, ya traducido por el caller. */
    errorTypeNames?: Record<number, string>
  },
): Record<string, string | number> {
  const included = options.includedErrorTypes ?? ALL_ERROR_TYPES
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
    [labels.hasError]: punchErrorVisible(row, included) ? labels.yes : labels.no,
  }

  if (options.includePaymentType) {
    out[labels.paymentType] = row.objPaymentType?.name ?? ''
  }

  if (options.includeCorrected) {
    const fixes = row.fixes ?? []
    const names = options.errorTypeNames ?? {}
    // Un evento de un tipo destildado no llega en `fixes[]`, aunque la ponchada
    // haya entrado por otro: el backend aplica el mismo predicado canónico.
    out[labels.correctedTypes] = [...new Set(fixes.map((f) => f.errorType))]
      .sort((a, b) => a - b)
      .map((code) => names[code] ?? String(code))
      .join(', ')
    // Formateado, NUNCA el string crudo de la base: el resto de la planilla usa
    // MM/DD/YYYY y esta celda salía como '2026-09-06 17:37:12'.
    const lastFixedAt = fixes.length ? fixes.map((f) => f.fixedAt).sort().at(-1)! : null
    out[labels.lastCorrectedAt] = formatUsDateTimeForExport(lastFixedAt)
    out[labels.deletedPunch] = Number(row.estado ?? 1) === 0 ? labels.yes : labels.no
  }

  return out
}
