import type { TranslateFn } from '@/lib/i18n/locale-context'

/**
 * Única fuente de verdad de los tres tipos de error de ponchada.
 *
 * `TTK_PUNCH_WITH_ERROR_V2` clasifica cada ponchada en UN código con ramas
 * excluyentes, así que un tipo = un código = un color = una etiqueta.
 *
 * El color va atado al TIPO, nunca a la posición en un array filtrado: el donut
 * pintaba con `COLORS[index]` sobre la lista ya filtrada, así que al excluir
 * clock-out el break se volvía rojo.
 */
export type ErrorTypeCode = 1 | 2 | 3

export type ErrorTypeMeta = {
  code: ErrorTypeCode
  /** Clave del bucket `by_type` que devuelven counts y summary. */
  byTypeKey: 'clock_out_missing' | 'break_missing' | 'shift_20h_plus'
  /** Clave de la serie del trend. */
  trendKey: 'clock_out_missing' | 'break_missing' | 'shift_20h_plus'
  labelKey: string
  chartLabelKey: string
  color: string
}

export const ERROR_TYPE_META: readonly ErrorTypeMeta[] = [
  {
    code: 1,
    byTypeKey: 'clock_out_missing',
    trendKey: 'clock_out_missing',
    labelKey: 'punch.withoutClockOut',
    chartLabelKey: 'dashboard.withoutClockOutChart',
    color: '#ef4444',
  },
  {
    code: 2,
    byTypeKey: 'break_missing',
    trendKey: 'break_missing',
    labelKey: 'punch.withoutBreak',
    chartLabelKey: 'dashboard.breakMissingChart',
    color: '#f59e0b',
  },
  {
    code: 3,
    byTypeKey: 'shift_20h_plus',
    trendKey: 'shift_20h_plus',
    labelKey: 'punch.shift20h',
    chartLabelKey: 'dashboard.shift20hChart',
    color: '#8b5cf6',
  },
]

export function errorTypeMeta(code: ErrorTypeCode): ErrorTypeMeta {
  return ERROR_TYPE_META[code - 1]!
}

export function errorTypeLabel(t: TranslateFn, code: ErrorTypeCode): string {
  return t(errorTypeMeta(code).labelKey)
}

/**
 * ¿El pedido está filtrando POR error?
 *
 * Es lo que decide si "ningún tipo incluido" vacía la lista o no. Con `all` (o
 * con un filtro que no es de error, como `manual_punch`) la lista sigue trayendo
 * todas las ponchadas: excluir un tipo apaga el ⚠ y baja los contadores, pero
 * **nunca saca filas**. El vacío sólo corresponde cuando pediste ver errores y
 * no dejaste ninguno incluido.
 */
export function isErrorIssueType(issueType?: string): boolean {
  return (
    issueType === 'only_error' ||
    issueType === 'only_error_clockout' ||
    issueType === 'only_error_break' ||
    issueType === 'only_error_20h'
  )
}

/**
 * ¿Esta fila tiene que mostrar marca de error (⚠ / "Yes" en el export)?
 *
 * `errorType` sólo viaja cuando hay lista parcial y el usuario es interno
 * (`includeErrorType` en el backend). Por eso:
 *
 * - Sin `errorType` en la fila ⇒ lista default ⇒ vale el `badPunch` de siempre.
 * - Con `errorType` ⇒ hay algo que re-decidir: la marca se apaga si el tipo de
 *   la fila quedó fuera de la lista. La fila SIGUE en el listado sin filtro; lo
 *   que cambia es que deja de marcarse como error.
 */
export function punchErrorVisible(
  row: { badPunch?: { res?: string } | null; errorType?: number | null },
  includedErrorTypes: readonly number[],
): boolean {
  const res = row.badPunch?.res?.trim()
  if (!res) return false
  if (row.errorType == null) return true
  return includedErrorTypes.includes(row.errorType)
}

/** Metadata + si el tipo está incluido, para pintar tarjetas, donut y leyenda. */
export function errorTypesWithState(included: readonly number[]) {
  return ERROR_TYPE_META.map((meta) => ({
    ...meta,
    included: included.includes(meta.code),
  }))
}
