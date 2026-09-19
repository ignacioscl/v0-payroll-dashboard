import type { TranslateFn } from '@/lib/i18n/locale-context'
import type { ErrorStatus } from '@/lib/ttk/error-status'

type KpiVariant = 'default' | 'warning' | 'danger' | 'success' | 'info' | 'violet'

/**
 * Única fuente de verdad de los ocho tipos de flag de ponchada.
 *
 * V2 (1/2/3) sigue siendo excluyente. 4..8 conviven. El gris, el `—`, si suma
 * al %, si filtra en este modo, salen de acá.
 */
export type ErrorTypeCode = 1 | 2 | 3
export type FlagTypeCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type FlagKind =
  | 'v2'
  | 'without_salary'
  | 'manual'
  | 'deleted'
  | 'payment_change'
  | 'fake_gps'

export type FlagGroup = 'errors' | 'corrected_only' | 'alerts'

export type FlagTypeMeta = {
  code: FlagTypeCode
  group: FlagGroup
  kind: FlagKind
  enabledIn: readonly ErrorStatus[]
  countsInErrorsRateTrendDonut: boolean
  /** Clave del bucket `by_type` PHP (snake). */
  byTypeKey: string
  /** Clave camelCase del ranking Nest. */
  rankingKey: string
  trendKey: string
  trendFixedKey: string
  labelKey: string
  chartLabelKey: string
  color: string
  variant: KpiVariant
  /** Permiso extra: `payment` (4,7), `delete` (6) o `fake_gps` (8). */
  requires?: 'payment' | 'delete' | 'fake_gps'
}

export type ErrorTypeMeta = FlagTypeMeta

export const FLAG_GROUPS: readonly { id: FlagGroup; titleKey: string; hintKey: string }[] = [
  { id: 'errors', titleKey: 'punch.flagGroupErrors', hintKey: 'punch.flagGroupErrorsHint' },
  {
    id: 'corrected_only',
    titleKey: 'punch.flagGroupCorrectedOnly',
    hintKey: 'punch.flagGroupCorrectedOnlyHint',
  },
  { id: 'alerts', titleKey: 'punch.flagGroupAlerts', hintKey: 'punch.flagGroupAlertsHint' },
]

export const FLAG_TYPE_META: readonly FlagTypeMeta[] = [
  {
    code: 1,
    group: 'errors',
    kind: 'v2',
    enabledIn: ['pending', 'corrected'],
    countsInErrorsRateTrendDonut: true,
    byTypeKey: 'clock_out_missing',
    rankingKey: 'clockOutMissing',
    trendKey: 'clock_out_missing',
    trendFixedKey: 'clock_out_missing_fixed',
    labelKey: 'punch.withoutClockOut',
    chartLabelKey: 'dashboard.withoutClockOutChart',
    color: '#ef4444',
    variant: 'danger',
  },
  {
    code: 2,
    group: 'errors',
    kind: 'v2',
    enabledIn: ['pending', 'corrected'],
    countsInErrorsRateTrendDonut: true,
    byTypeKey: 'break_missing',
    rankingKey: 'breakMissing',
    trendKey: 'break_missing',
    trendFixedKey: 'break_missing_fixed',
    labelKey: 'punch.withoutBreak',
    chartLabelKey: 'dashboard.breakMissingChart',
    color: '#f59e0b',
    variant: 'warning',
  },
  {
    code: 3,
    group: 'errors',
    kind: 'v2',
    enabledIn: ['pending', 'corrected'],
    countsInErrorsRateTrendDonut: true,
    byTypeKey: 'shift_20h_plus',
    rankingKey: 'shift20hPlus',
    trendKey: 'shift_20h_plus',
    trendFixedKey: 'shift_20h_plus_fixed',
    labelKey: 'punch.shift20h',
    chartLabelKey: 'dashboard.shift20hChart',
    color: '#8b5cf6',
    variant: 'violet',
  },
  {
    code: 4,
    group: 'errors',
    kind: 'without_salary',
    enabledIn: ['pending', 'corrected'],
    countsInErrorsRateTrendDonut: true,
    byTypeKey: 'without_salary',
    rankingKey: 'withoutSalary',
    trendKey: 'without_salary',
    trendFixedKey: 'without_salary_fixed',
    labelKey: 'punch.withoutSalary',
    chartLabelKey: 'dashboard.withoutSalaryChart',
    color: '#10b981',
    variant: 'success',
    requires: 'payment',
  },
  {
    code: 5,
    group: 'corrected_only',
    kind: 'manual',
    enabledIn: ['corrected'],
    countsInErrorsRateTrendDonut: true,
    byTypeKey: 'manual',
    rankingKey: 'manual',
    trendKey: 'manual',
    trendFixedKey: 'manual_fixed',
    labelKey: 'punch.manualPlural',
    chartLabelKey: 'dashboard.manualChart',
    color: '#06b6d4',
    variant: 'info',
  },
  {
    code: 6,
    group: 'corrected_only',
    kind: 'deleted',
    enabledIn: ['corrected'],
    countsInErrorsRateTrendDonut: true,
    byTypeKey: 'deleted',
    rankingKey: 'deleted',
    trendKey: 'deleted',
    trendFixedKey: 'deleted_fixed',
    labelKey: 'punch.deletedPlural',
    chartLabelKey: 'dashboard.deletedChart',
    color: '#64748b',
    variant: 'default',
    requires: 'delete',
  },
  {
    code: 7,
    group: 'corrected_only',
    kind: 'payment_change',
    enabledIn: ['corrected'],
    countsInErrorsRateTrendDonut: true,
    byTypeKey: 'payment_type_change',
    rankingKey: 'paymentTypeChange',
    trendKey: 'payment_type_change',
    trendFixedKey: 'payment_type_change_fixed',
    labelKey: 'punch.paymentTypeChange',
    chartLabelKey: 'dashboard.paymentTypeChangeChart',
    color: '#0ea5e9',
    variant: 'info',
    requires: 'payment',
  },
  {
    code: 8,
    group: 'alerts',
    kind: 'fake_gps',
    enabledIn: ['pending'],
    countsInErrorsRateTrendDonut: false,
    byTypeKey: 'fake_gps',
    rankingKey: 'fakeGps',
    trendKey: 'fake_gps',
    trendFixedKey: 'fake_gps_fixed',
    labelKey: 'punch.fakeGps',
    chartLabelKey: 'dashboard.fakeGpsChart',
    color: '#f97316',
    variant: 'warning',
    requires: 'fake_gps',
  },
]

/** Los tres V2, para callers que todavía recorren ERROR_TYPE_META. */
export const ERROR_TYPE_META: readonly FlagTypeMeta[] = FLAG_TYPE_META.filter((m) => m.kind === 'v2')

export function flagTypeMeta(code: FlagTypeCode): FlagTypeMeta {
  return FLAG_TYPE_META[code - 1]!
}

export function errorTypeMeta(code: ErrorTypeCode): FlagTypeMeta {
  return flagTypeMeta(code)
}

export function errorTypeLabel(t: TranslateFn, code: FlagTypeCode): string {
  return t(flagTypeMeta(code).labelKey)
}

export function visibleFlagTypes(opts: {
  canViewPaymentType: boolean
  canViewDeleted: boolean
  canViewFakeGps: boolean
}): FlagTypeMeta[] {
  return FLAG_TYPE_META.filter((meta) => {
    if (meta.requires === 'payment' && !opts.canViewPaymentType) return false
    if (meta.requires === 'delete' && !opts.canViewDeleted) return false
    if (meta.requires === 'fake_gps' && !opts.canViewFakeGps) return false
    return true
  })
}

export function flagEnabledIn(meta: FlagTypeMeta, status: ErrorStatus): boolean {
  return meta.enabledIn.includes(status)
}

/** Tipos que suman a Errors / % / trend / donut en este modo. */
export function countingFlagTypes(status: ErrorStatus): FlagTypeMeta[] {
  return FLAG_TYPE_META.filter(
    (meta) => meta.countsInErrorsRateTrendDonut && flagEnabledIn(meta, status),
  )
}

export function trendSeriesKeys(meta: FlagTypeMeta): {
  all: string
  pending: string
  fixed: string
} {
  return {
    all: `${meta.trendKey}_all`,
    pending: meta.trendKey,
    fixed: meta.trendFixedKey,
  }
}

export const FAKE_GPS_EVENT_KEYS = ['clock_in', 'clock_out', 'break_start', 'break_end'] as const
export type FakeGpsEventKey = (typeof FAKE_GPS_EVENT_KEYS)[number]

const FAKE_GPS_EVENT_LABEL_KEY: Record<FakeGpsEventKey, string> = {
  clock_in: 'punch.clockIn',
  clock_out: 'punch.clockOut',
  break_start: 'punch.breakStart',
  break_end: 'punch.breakEnd',
}

export function formatFakeGpsLabel(
  t: TranslateFn,
  events: readonly string[] | null | undefined,
): string | null {
  if (!events || events.length === 0) return null
  const names = events
    .filter((event): event is FakeGpsEventKey =>
      (FAKE_GPS_EVENT_KEYS as readonly string[]).includes(event),
    )
    .map((event) => t(FAKE_GPS_EVENT_LABEL_KEY[event]))
  if (names.length === 0) return null
  return `${t('punch.fakeGps')} · ${names.join(', ')}`
}

/**
 * ¿El pedido está filtrando POR flag?
 *
 * El vacío duro sólo corresponde cuando pediste ver flagged/fixed y no quedó
 * ningún código incluido y habilitado en el modo.
 */
export function isErrorIssueType(issueType?: string): boolean {
  return (
    issueType === 'only_flagged' ||
    issueType === 'only_error' ||
    issueType === 'only_error_clockout' ||
    issueType === 'only_error_break' ||
    issueType === 'only_error_20h' ||
    issueType === 'only_fixed'
  )
}

/**
 * ¿Esta fila tiene que mostrar marca de error (⚠ / "Yes" en el export)?
 *
 * Además de V2: Fake GPS si hay eventos y 8 está incluido; sin salario si 4
 * está incluido y la ponchada no tiene tipo de pago.
 */
export function punchLacksPaymentType(row: {
  objPaymentType?: { id?: number } | null
  typePayment?: number | null
}): boolean {
  return (
    !(row.objPaymentType && Number(row.objPaymentType.id) > 0) &&
    !(row.typePayment != null && row.typePayment > 0) &&
    (row.objPaymentType !== undefined || row.typePayment !== undefined)
  )
}

export function punchErrorVisible(
  row: {
    badPunch?: { res?: string } | null
    errorType?: number | null
    fakeGpsEvents?: string[] | null
    objPaymentType?: { id?: number } | null
    typePayment?: number | null
  },
  includedErrorTypes: readonly number[],
): boolean {
  const fakeGps =
    includedErrorTypes.includes(8) && (row.fakeGpsEvents?.length ?? 0) > 0
  if (fakeGps) return true

  const withoutSalary =
    includedErrorTypes.includes(4) &&
    !(row.objPaymentType && Number(row.objPaymentType.id) > 0) &&
    !(row.typePayment != null && row.typePayment > 0)
  if (withoutSalary && (row.objPaymentType !== undefined || row.typePayment !== undefined)) {
    return true
  }

  const res = row.badPunch?.res?.trim()
  if (!res) return false
  if (row.errorType == null) return true
  return includedErrorTypes.includes(row.errorType)
}

/** Metadata + si el tipo está incluido, para pintar tarjetas, donut y leyenda. */
export function errorTypesWithState(
  included: readonly number[],
  metas: readonly FlagTypeMeta[] = FLAG_TYPE_META,
) {
  return metas.map((meta) => ({
    ...meta,
    included: included.includes(meta.code),
  }))
}

export function flagTypesWithState(
  included: readonly number[],
  metas: readonly FlagTypeMeta[] = FLAG_TYPE_META,
) {
  return errorTypesWithState(included, metas)
}
