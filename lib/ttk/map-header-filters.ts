import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'

/** Maps header "issue type" filter to TTK datatable flags (ttk_main without group). */
export function mapIssueTypeToTtkFlags(selectedType: string) {
  return {
    only_error: selectedType === 'only_error' ? 1 : 0,
    only_error_clockout: selectedType === 'only_error_clockout' ? 1 : 0,
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

export function buildTtkListParams(input: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
  selectedType: string
  pageIndex: number
  pageSize: number
  orderBy: string
}): Record<string, string | number> {
  const flags = mapIssueTypeToTtkFlags(input.selectedType)

  const params: Record<string, string | number> = {
    draw: input.pageIndex + 1,
    start: input.pageIndex * input.pageSize,
    length: input.pageSize,
    'search[value]': input.search.trim(),
    fecha_desde: formatDateParam(input.dateRange?.from),
    fecha_hasta: formatDateParam(input.dateRange?.to ?? input.dateRange?.from),
    order_by: input.orderBy,
    only_error: flags.only_error,
    only_error_clockout: flags.only_error_clockout,
    manual_punch: flags.manual_punch,
    only_deletes: flags.only_deletes,
    without_salary: flags.without_salary,
    only_fixed: flags.only_fixed,
    show_deleted: 0,
    filter_logic_or: 0,
  }

  if (input.selectedDealers.length > 0) {
    params.id_dealer = input.selectedDealers.join(',')
  }

  return params
}

/** Shared scope params for TTK list + issue KPI counts (dealers, dates, search). */
export function buildTtkScopeParams(input: {
  search: string
  selectedDealers: string[]
  dateRange: DateRange | undefined
}): Record<string, string | number> {
  const params: Record<string, string | number> = {
    'search[value]': input.search.trim(),
    fecha_desde: formatDateParam(input.dateRange?.from),
    fecha_hasta: formatDateParam(input.dateRange?.to ?? input.dateRange?.from),
  }

  if (input.selectedDealers.length > 0) {
    params.id_dealer = input.selectedDealers.join(',')
  }

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
  const d = new Date(gmt0)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}
