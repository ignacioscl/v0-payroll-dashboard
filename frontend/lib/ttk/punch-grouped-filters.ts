import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import type { PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
} from '@/lib/ttk/payment-type-filter'
import { errorTypesParam } from '@/lib/filters/error-types-cookie'

export type PunchGroupedQueryParams = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  page: number
  pageSize: number
  sort?: string
  dir?: 'asc' | 'desc'
  minHoursTotal?: number
  maxHoursTotal?: number
  idPaymentType?: number
  search?: string
  idEmployee?: number
  issueType?: string
  /** CSV canónico de tipos incluidos. */
  errorTypes?: string
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
  sort?: string
  dir?: 'asc' | 'desc'
  minHoursTotal?: number | null
  maxHoursTotal?: number | null
  paymentTypeFilter?: PaymentTypeFilterValue
  snapshotAt?: string
  includedErrorTypes?: readonly number[]
}): PunchGroupedQueryParams {
  const paymentTypeFilter = input.paymentTypeFilter ?? PAYMENT_TYPE_FILTER_ALL

  let issueType = input.selectedType && input.selectedType !== 'all' ? input.selectedType : undefined
  let idPaymentType: number | undefined

  if (paymentTypeFilter === PAYMENT_TYPE_FILTER_WITHOUT) {
    issueType = 'without_salary'
  } else if (typeof paymentTypeFilter === 'number' && paymentTypeFilter > 0) {
    idPaymentType = paymentTypeFilter
  }

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
    idPaymentType,
    search: employeeId != null ? undefined : input.search?.trim() || undefined,
    idEmployee: employeeId,
    issueType,
    errorTypes: errorTypesParam(input.includedErrorTypes),
    snapshotAt: input.snapshotAt,
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
  if (params.idPaymentType != null) qs.set('idPaymentType', String(params.idPaymentType))
  if (params.search) qs.set('search', params.search)
  if (params.idEmployee != null) qs.set('idEmployee', String(params.idEmployee))
  if (params.issueType) qs.set('issueType', params.issueType)
  if (params.errorTypes) qs.set('errorTypes', params.errorTypes)
  if (params.snapshotAt) qs.set('snapshotAt', params.snapshotAt)
  return qs
}
