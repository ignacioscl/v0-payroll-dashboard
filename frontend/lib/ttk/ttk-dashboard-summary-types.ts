import type { TtkIssueCountsData, TtkIssueCountByType } from '@/lib/ttk/ttk-issue-counts-types'
import { EMPTY_BY_TYPE, EMPTY_TTK_ISSUE_COUNTS } from '@/lib/ttk/ttk-issue-counts-types'

export type TtkDashboardErrorTrendPoint = {
  date: string
  clock_out_missing: number
  break_missing: number
  shift_20h_plus: number
  without_salary: number
  total_errors: number
  clock_out_missing_all: number
  break_missing_all: number
  shift_20h_plus_all: number
  without_salary_all: number
  manual_all: number
  deleted_all: number
  payment_type_change_all: number
  total_errors_all: number
  clock_out_missing_fixed: number
  break_missing_fixed: number
  shift_20h_plus_fixed: number
  without_salary_fixed: number
  manual_fixed: number
  deleted_fixed: number
  payment_type_change_fixed: number
  total_errors_fixed: number
  [key: string]: string | number
}

export type TtkDashboardCounts = TtkIssueCountsData

export type TtkDashboardSummaryData = {
  counts: TtkDashboardCounts
  error_trend: TtkDashboardErrorTrendPoint[]
}

export type TtkDashboardSummaryResponse = {
  data?: { summary?: TtkDashboardSummaryData }
  summary?: TtkDashboardSummaryData
  status?: string
  error?: { message?: string }
}

export const EMPTY_TTK_DASHBOARD_SUMMARY: TtkDashboardSummaryData = {
  counts: EMPTY_TTK_ISSUE_COUNTS,
  error_trend: [],
}

export const TTK_ERROR_CODE_LABELS: Record<number, string> = {
  1: 'Without clock out',
  2: 'Break missing',
  3: 'Shift 20h+',
  4: 'Without salary',
  5: 'Manual punch',
  6: 'Deleted punches',
  7: 'Payment type change',
  8: 'Fake GPS',
}

export function ttkErrorCodeLabel(code: number): string {
  return TTK_ERROR_CODE_LABELS[code] ?? 'Error'
}

export type { TtkIssueCountByType }
