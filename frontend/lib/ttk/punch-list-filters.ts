import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import type { PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
} from '@/lib/ttk/payment-type-filter'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'

/** Cursor keyset devuelto por el backend; el cliente lo reenvía tal cual. */
export type PunchListCursor = {
  value: string
  id: number
}

export type PunchListSort = 'punchIn' | 'employee'

export type PunchListQueryParams = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  pageSize: number
  sort?: PunchListSort
  dir?: 'asc' | 'desc'
  afterValue?: string
  afterId?: number
  /** Horas de la ponchada individual (no el total del empleado, como en grouped). */
  minHours?: number
  maxHours?: number
  idPaymentType?: number
  search?: string
  idEmployee?: number
  issueType?: string
  todayLiveStatus?: string
}

export function formatDateParamPunchList(date: Date | undefined): string {
  if (!date) return ''
  return format(date, 'yyyy-MM-dd')
}

/** Builds query params for Nest GET /srs/punch/list */
export function buildPunchListParams(input: {
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedType: string
  selectedEmployeeId?: number | null
  search?: string
  pageSize: number
  sort?: PunchListSort
  dir?: 'asc' | 'desc'
  minHours?: number | null
  maxHours?: number | null
  paymentTypeFilter?: PaymentTypeFilterValue
  todayLiveStatus?: string
}): PunchListQueryParams {
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
    fechaDesde: formatDateParamPunchList(input.dateRange?.from),
    fechaHasta: formatDateParamPunchList(input.dateRange?.to ?? input.dateRange?.from),
    idDealer: input.selectedDealers.join(','),
    pageSize: input.pageSize,
    sort: input.sort,
    dir: input.dir,
    minHours: input.minHours != null && input.minHours > 0 ? input.minHours : undefined,
    maxHours: input.maxHours != null && input.maxHours > 0 ? input.maxHours : undefined,
    idPaymentType,
    search: employeeId != null ? undefined : input.search?.trim() || undefined,
    idEmployee: employeeId,
    issueType,
    todayLiveStatus:
      input.todayLiveStatus && input.todayLiveStatus !== TODAY_LIVE_STATUS_ALL
        ? input.todayLiveStatus
        : undefined,
  }
}

export function punchListParamsToSearchParams(params: PunchListQueryParams): URLSearchParams {
  const qs = new URLSearchParams({
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    idDealer: params.idDealer,
    pageSize: String(params.pageSize),
  })
  if (params.sort) qs.set('sort', params.sort)
  if (params.dir) qs.set('dir', params.dir)
  if (params.afterValue) qs.set('afterValue', params.afterValue)
  if (params.afterId != null) qs.set('afterId', String(params.afterId))
  if (params.minHours != null) qs.set('minHours', String(params.minHours))
  if (params.maxHours != null) qs.set('maxHours', String(params.maxHours))
  if (params.idPaymentType != null) qs.set('idPaymentType', String(params.idPaymentType))
  if (params.search) qs.set('search', params.search)
  if (params.idEmployee != null) qs.set('idEmployee', String(params.idEmployee))
  if (params.issueType) qs.set('issueType', params.issueType)
  if (params.todayLiveStatus) qs.set('todayLiveStatus', params.todayLiveStatus)
  return qs
}
