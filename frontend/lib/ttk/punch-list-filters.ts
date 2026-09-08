import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import type { PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import {
  PAYMENT_TYPE_FILTER_ALL,
  paymentTypeFilterParams,
} from '@/lib/ttk/payment-type-filter'
import { TODAY_LIVE_STATUS_ALL } from '@/lib/ttk/today-live-status'
import { errorTypesParam } from '@/lib/filters/error-types-cookie'
import { resolveIssueType, type ErrorStatus } from '@/lib/ttk/error-status'

/** Cursor keyset devuelto por el backend; el cliente lo reenvía tal cual. */
export type PunchListCursor = {
  /**
   * `null` cuando la ultima fila cae en el tramo de VACIOS de la columna
   * ordenada. Tiene que poder faltar: es la unica forma de materializar el bind
   * `null` que necesita la comparacion null-safe del backend.
   */
  value: string | null
  id: number
  /** 1 = la ultima fila esta dentro del tramo de vacios (que va siempre al final). */
  empty: 0 | 1
}

/**
 * Columnas por las que el endpoint acepta ordenar.
 *
 * Antes eran dos y el front convertia todo lo demas a `punchIn`: por eso
 * ordenar por Time break ordenaba por hora de entrada (BUG-07).
 */
export type PunchListSort =
  | 'punchIn'
  | 'employee'
  | 'punchOut'
  | 'breakStart'
  | 'breakEnd'
  | 'timeWork'
  | 'timeBreak'
  | 'paymentType'

export type PunchListQueryParams = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  pageSize: number
  sort?: PunchListSort
  dir?: 'asc' | 'desc'
  afterValue?: string
  afterId?: number
  afterEmpty?: '0' | '1'
  /** Horas de la ponchada individual (no el total del empleado, como en grouped). */
  minHours?: number
  maxHours?: number
  /** CSV canónico de GENERIC_DATA.id. String ya joineado, nunca number[]. */
  idPaymentTypes?: string
  search?: string
  idEmployee?: number
  issueType?: string
  /** CSV canónico de tipos incluidos. String ya joineado, nunca number[]. */
  errorTypes?: string
  /** Frontera congelada del grupo padre (expansión de Grouped y su export). */
  snapshotAt?: string
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
  includedErrorTypes?: readonly number[]
  errorStatus?: ErrorStatus
  snapshotAt?: string
}): PunchListQueryParams {
  const paymentTypeFilter = input.paymentTypeFilter ?? PAYMENT_TYPE_FILTER_ALL

  // El eje de estado se cruza con el tipo en UN SOLO lugar (resolveIssueType):
  // list, Grouped, detalle agrupado y los dos exports pasan por acá.
  const crossedType = resolveIssueType(input.selectedType, input.errorStatus ?? 'pending')
  // El combo de payment type NO escribe `issueType`: viaja por su propio
  // parámetro y es EXCLUYENTE con la tarjeta *Without salary* (D-6, §4.2.2bis).
  // Antes lo pisaba con 'without_salary', que es lo que hacía imposible pedir
  // varios tipos a la vez.
  const issueType = crossedType && crossedType !== 'all' ? crossedType : undefined

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
    idPaymentTypes: paymentTypeFilterParams(paymentTypeFilter),
    search: employeeId != null ? undefined : input.search?.trim() || undefined,
    idEmployee: employeeId,
    issueType,
    errorTypes: errorTypesParam(input.includedErrorTypes),
    snapshotAt: input.snapshotAt,
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
  // `afterEmpty` viaja SIEMPRE que haya cursor, y con '1' el valor se OMITE:
  // en el tramo de vacios el valor es NULL, no string vacio.
  if (params.afterId != null) {
    qs.set('afterId', String(params.afterId))
    qs.set('afterEmpty', params.afterEmpty ?? '0')
    if (params.afterEmpty !== '1' && params.afterValue) {
      qs.set('afterValue', params.afterValue)
    }
  }
  if (params.minHours != null) qs.set('minHours', String(params.minHours))
  if (params.maxHours != null) qs.set('maxHours', String(params.maxHours))
  if (params.idPaymentTypes) qs.set('idPaymentTypes', params.idPaymentTypes)
  if (params.search) qs.set('search', params.search)
  if (params.idEmployee != null) qs.set('idEmployee', String(params.idEmployee))
  if (params.issueType) qs.set('issueType', params.issueType)
  if (params.errorTypes) qs.set('errorTypes', params.errorTypes)
  if (params.snapshotAt) qs.set('snapshotAt', params.snapshotAt)
  if (params.todayLiveStatus) qs.set('todayLiveStatus', params.todayLiveStatus)
  return qs
}

export type PunchExportPrepareBody = {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  minHours?: number
  maxHours?: number
  /** CSV canónico de GENERIC_DATA.id. String ya joineado, nunca number[]. */
  idPaymentTypes?: string
  search?: string
  idEmployee?: number
  issueType?: string
  /** CSV canónico de tipos incluidos. String ya joineado, nunca number[]. */
  errorTypes?: string
  todayLiveStatus?: string
}

/** Filters for POST /srs/punch/list/export/prepare — no pagination, cursor, sort, or dir. */
export function punchExportBodyFromListParams(params: PunchListQueryParams): PunchExportPrepareBody {
  return {
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    idDealer: params.idDealer,
    minHours: params.minHours,
    maxHours: params.maxHours,
    idPaymentTypes: params.idPaymentTypes,
    search: params.search,
    idEmployee: params.idEmployee,
    issueType: params.issueType,
    errorTypes: params.errorTypes,
    todayLiveStatus: params.todayLiveStatus,
  }
}
