import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import type { PaymentTypeFilterValue } from '@/lib/ttk/payment-type-filter'
import {
  PAYMENT_TYPE_FILTER_ALL,
  PAYMENT_TYPE_FILTER_WITHOUT,
} from '@/lib/ttk/payment-type-filter'
import { isTodayLiveStatus } from '@/lib/ttk/today-live-status'

/** Session user fields needed to map header dealer combo → SRS scope params. */
export type PayrollScopeUser = {
  isCompanyTypeCompany?: boolean
  idDealer?: number | null
}

/**
 * Legacy billing swap: externo (company-type dealer) selects providers in combo;
 * interno detailer selects sucursales.
 */
export function appendPayrollDealerScopeParams(
  params: Record<string, string | number>,
  selectedDealers: string[],
  user?: PayrollScopeUser | null,
): void {
  if (selectedDealers.length === 0) {
    return
  }

  const selected = selectedDealers.join(',')

  if (user?.isCompanyTypeCompany) {
    if (user.idDealer != null && user.idDealer > 0) {
      params.id_dealer = String(user.idDealer)
    }
    params.id_dealer_provider = selected
    return
  }

  params.id_dealer = selected
}

export function toPayrollScopeUser(
  user?: { isCompanyTypeCompany?: boolean; idDealer?: number | null } | null,
): PayrollScopeUser | null {
  if (!user) {
    return null
  }
  return {
    isCompanyTypeCompany: user.isCompanyTypeCompany,
    idDealer: user.idDealer,
  }
}

/** Maps header "issue type" filter to TTK datatable flags (ttk_main without group). */
export function mapIssueTypeToTtkFlags(selectedType: string) {
  return {
    only_error: selectedType === 'only_error' ? 1 : 0,
    only_error_clockout: selectedType === 'only_error_clockout' ? 1 : 0,
    only_error_break: selectedType === 'only_error_break' ? 1 : 0,
    manual_punch: selectedType === 'manual_punch' ? 1 : 0,
    only_deletes: selectedType === 'only_deletes' ? 1 : 0,
    without_salary: selectedType === 'without_salary' ? 1 : 0,
    only_fixed: selectedType === 'only_fixed' ? 1 : 0,
  }
}

export function formatDateParam(date: Date | undefined): string {
  if (!date) return ''
  return format(date, 'yyyy-MM-dd')
}

/** TTK list filters excluding pagination / sort (for DataTable adapters). */
export function buildTtkListFilterExtra(input: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedType: string
  punchMinHours?: number | null
  punchMaxHours?: number | null
  paymentTypeFilter?: PaymentTypeFilterValue
  todayLiveStatus?: string
  scopeUser?: PayrollScopeUser | null
}): Record<string, string | number> {
  const flags = mapIssueTypeToTtkFlags(input.selectedType)
  const paymentTypeFilter = input.paymentTypeFilter ?? PAYMENT_TYPE_FILTER_ALL

  let withoutSalary = flags.without_salary
  if (paymentTypeFilter === PAYMENT_TYPE_FILTER_WITHOUT) {
    withoutSalary = 1
  } else if (typeof paymentTypeFilter === 'number' && paymentTypeFilter > 0) {
    withoutSalary = 0
  }

  const params: Record<string, string | number> = {
    'search[value]': input.search.trim(),
    fecha_desde: formatDateParam(input.dateRange?.from),
    fecha_hasta: formatDateParam(input.dateRange?.to ?? input.dateRange?.from),
    only_error: flags.only_error,
    only_error_clockout: flags.only_error_clockout,
    only_error_break: flags.only_error_break,
    manual_punch: flags.manual_punch,
    only_deletes: flags.only_deletes,
    without_salary: withoutSalary,
    only_fixed: flags.only_fixed,
    show_deleted: 0,
    filter_logic_or: 0,
  }

  appendPayrollDealerScopeParams(params, input.selectedDealers, input.scopeUser)
  if (input.punchMinHours != null && input.punchMinHours > 0) {
    params.punch_min_hours = input.punchMinHours
  }
  if (input.punchMaxHours != null && input.punchMaxHours > 0) {
    params.punch_max_hours = input.punchMaxHours
  }
  if (typeof paymentTypeFilter === 'number' && paymentTypeFilter > 0) {
    params.id_payment_type = paymentTypeFilter
  }
  if (input.todayLiveStatus && isTodayLiveStatus(input.todayLiveStatus)) {
    params.today_live_status = input.todayLiveStatus
  }

  return params
}

export function buildTtkListParams(input: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedType: string
  pageIndex: number
  pageSize: number
  orderBy: string
  scopeUser?: PayrollScopeUser | null
}): Record<string, string | number> {
  return {
    ...buildTtkListFilterExtra(input),
    draw: input.pageIndex + 1,
    start: input.pageIndex * input.pageSize,
    length: input.pageSize,
    order_by: input.orderBy,
  }
}

/** Shared scope params for TTK list + issue KPI counts (dealers, dates, search). */
export function buildTtkScopeParams(input: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  scopeUser?: PayrollScopeUser | null
}): Record<string, string | number> {
  const params: Record<string, string | number> = {
    'search[value]': input.search.trim(),
    fecha_desde: formatDateParam(input.dateRange?.from),
    fecha_hasta: formatDateParam(input.dateRange?.to ?? input.dateRange?.from),
  }

  appendPayrollDealerScopeParams(params, input.selectedDealers, input.scopeUser)

  return params
}

export function formatGmtDate(gmt0?: string | null): string {
  if (!gmt0) return ''
  const d = new Date(gmt0)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

export function formatFixedAt(fixedAt?: string | null): string {
  if (!fixedAt) return ''
  const d = new Date(fixedAt.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return fixedAt
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatGmtTime(gmt0?: string | null): string {
  if (!gmt0) return ''
  const normalized = gmt0.includes('T') ? gmt0 : gmt0.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Duration from API (e.g. `00:46:48.00`) → `00:46:48` */
export function formatDurationDisplay(value?: string | null): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\.\d+$/, '')
}
