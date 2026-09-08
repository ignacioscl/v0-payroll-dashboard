import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import type { PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import {
  PAYMENT_TYPE_FILTER_ALL,
  paymentTypeFilterParams,
} from '@/lib/ttk/payment-type-filter'
import { errorTypesParam } from '@/lib/filters/error-types-cookie'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import { resolveIssueType, type ErrorStatus } from '@/lib/ttk/error-status'

/** Whitelist de orden de la vista agrupada. Espeja `PUNCH_GROUPED_SORTS` de Nest. */
export type PunchGroupedSort =
  | 'nombreEmployee'
  | 'hoursNumber'
  | 'breakNumber'
  | 'punchCount'
  | 'errorCount'
  | 'fixedCount'

export type PunchGroupedQueryParams = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  page: number
  pageSize: number
  sort?: PunchGroupedSort
  dir?: 'asc' | 'desc'
  minHoursTotal?: number
  maxHoursTotal?: number
  /** CSV canónico de GENERIC_DATA.id. String ya joineado, nunca number[]. */
  idPaymentTypes?: string
  search?: string
  idEmployee?: number
  issueType?: string
  /** CSV canónico de tipos incluidos. */
  errorTypes?: string
  /** Estado en vivo del día (Working / On lunch / Out). */
  todayLiveStatus?: string
  /**
   * Frontera superior congelada (`punch_in <= snapshotAt`).
   *
   * Esta tabla pagina por número de página. Sin el snapshot, cada ponchada que
   * entra mientras el usuario navega corre los offsets y hace que un empleado
   * aparezca dos veces o se saltee.
   *
   * Lo GENERA EL SERVER en la primera página y el cliente lo reenvía tal cual en
   * las siguientes. No se arma en el navegador: su hora local no es la de la base
   * (`punch_in` viaja en GMT0) y cortaría filas de más.
   */
  snapshotAt?: string
}

export function formatDateParamGrouped(date: Date | undefined): string {
  if (!date) return ''
  return format(date, 'yyyy-MM-dd')
}

/** Builds query params for Nest GET /srs/punch/grouped */
export function buildPunchGroupedParams(input: {
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedType: string
  selectedEmployeeId?: number | null
  search?: string
  page: number
  pageSize: number
  sort?: PunchGroupedSort
  dir?: 'asc' | 'desc'
  minHoursTotal?: number | null
  maxHoursTotal?: number | null
  paymentTypeFilter?: PaymentTypeFilterValue
  snapshotAt?: string
  includedErrorTypes?: readonly number[]
  errorStatus?: ErrorStatus
  todayLiveStatus?: string
}): PunchGroupedQueryParams {
  const paymentTypeFilter = input.paymentTypeFilter ?? PAYMENT_TYPE_FILTER_ALL

  // El eje de estado se cruza con el tipo en UN SOLO lugar (resolveIssueType):
  // list, Grouped, detalle agrupado y los dos exports pasan por acá.
  const crossedType = resolveIssueType(input.selectedType, input.errorStatus ?? 'pending')
  // El combo de payment type NO escribe `issueType`: viaja por su propio
  // parámetro y es EXCLUYENTE con la tarjeta *Without salary* (D-6, §4.2.2bis).
  const issueType = crossedType && crossedType !== 'all' ? crossedType : undefined

  const employeeId =
    input.selectedEmployeeId != null && input.selectedEmployeeId > 0
      ? input.selectedEmployeeId
      : undefined

  return {
    fechaDesde: formatDateParamGrouped(input.dateRange?.from),
    fechaHasta: formatDateParamGrouped(input.dateRange?.to ?? input.dateRange?.from),
    idDealer: input.selectedDealers.join(','),
    page: input.page,
    pageSize: input.pageSize,
    sort: input.sort,
    dir: input.dir,
    minHoursTotal:
      input.minHoursTotal != null && input.minHoursTotal > 0 ? input.minHoursTotal : undefined,
    maxHoursTotal:
      input.maxHoursTotal != null && input.maxHoursTotal > 0 ? input.maxHoursTotal : undefined,
    idPaymentTypes: paymentTypeFilterParams(paymentTypeFilter),
    search: employeeId != null ? undefined : input.search?.trim() || undefined,
    idEmployee: employeeId,
    issueType,
    errorTypes: errorTypesParam(input.includedErrorTypes),
    snapshotAt: input.snapshotAt,
    // Mismo criterio que buildPunchListParams: 'all' es ausencia de filtro.
    todayLiveStatus:
      input.todayLiveStatus && input.todayLiveStatus !== TODAY_LIVE_STATUS_ALL
        ? input.todayLiveStatus
        : undefined,
  }
}

export function punchGroupedParamsToSearchParams(
  params: PunchGroupedQueryParams,
): URLSearchParams {
  const qs = new URLSearchParams({
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    idDealer: params.idDealer,
    page: String(params.page),
    pageSize: String(params.pageSize),
  })
  if (params.sort) qs.set('sort', params.sort)
  if (params.dir) qs.set('dir', params.dir)
  if (params.minHoursTotal != null) qs.set('minHoursTotal', String(params.minHoursTotal))
  if (params.maxHoursTotal != null) qs.set('maxHoursTotal', String(params.maxHoursTotal))
  if (params.idPaymentTypes) qs.set('idPaymentTypes', params.idPaymentTypes)
  if (params.search) qs.set('search', params.search)
  if (params.idEmployee != null) qs.set('idEmployee', String(params.idEmployee))
  if (params.issueType) qs.set('issueType', params.issueType)
  if (params.errorTypes) qs.set('errorTypes', params.errorTypes)
  if (params.snapshotAt) qs.set('snapshotAt', params.snapshotAt)
  if (params.todayLiveStatus) qs.set('todayLiveStatus', params.todayLiveStatus)
  return qs
}
