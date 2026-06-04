import type { TtkIssueCountsData } from '@/lib/ttk/ttk-issue-counts-types'

export type TtkDashboardErrorTrendPoint = {
  date: string
  clock_out_missing: number
  break_missing: number
  shift_20h_plus: number
  total_errors: number
}

export type TtkDashboardTopDealer = {
  id_dealer: number
  dealer_name: string
  error_count: number
}

export type TtkDashboardCounts = TtkIssueCountsData & {
  total_punches: number
}

export type TtkDashboardSummaryData = {
  counts: TtkDashboardCounts
  error_trend: TtkDashboardErrorTrendPoint[]
  top_dealers: TtkDashboardTopDealer[]
}

export type TtkDashboardSummaryResponse = {
  data?: { summary?: TtkDashboardSummaryData }
  summary?: TtkDashboardSummaryData
  status?: string
  error?: { message?: string }
}

export const EMPTY_TTK_DASHBOARD_SUMMARY: TtkDashboardSummaryData = {
  counts: {
    total_punches: 0,
    only_error: { pending: 0, by_type: { clock_out_missing: 0, break_missing: 0, shift_20h_plus: 0 } },
    only_error_clockout: { pending: 0 },
    only_error_break: { pending: 0 },
    manual_punch: { pending: 0 },
    without_salary: { pending: 0 },
    only_deletes: { pending: 0 },
    only_fixed: { pending: 0 },
  },
  error_trend: [],
  top_dealers: [],
}

export const TTK_ERROR_CODE_LABELS: Record<number, string> = {
  1: 'Without clock out',
  2: 'Break missing',
  3: 'Shift 20h+',
}

export function ttkErrorCodeLabel(code: number): string {
  return TTK_ERROR_CODE_LABELS[code] ?? 'Error'
}
