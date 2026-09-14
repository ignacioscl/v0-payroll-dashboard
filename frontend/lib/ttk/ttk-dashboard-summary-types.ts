import type { TtkIssueCountsData } from '@/lib/ttk/ttk-issue-counts-types'

export type TtkDashboardErrorTrendPoint = {
  date: string
  /** Still-pending errors — the legacy series, unchanged. */
  clock_out_missing: number
  break_missing: number
  shift_20h_plus: number
  total_errors: number
  /**
   * Pending + every correction recorded in TTK_PUNCH_ERROR_FIX for that day.
   * Counts error events per type, so a punch fixed twice adds two.
   */
  clock_out_missing_all: number
  break_missing_all: number
  shift_20h_plus_all: number
  total_errors_all: number
  /**
   * Only the recorded corrections, on the same axis as the other two series:
   * the punch day. "How many fixes happened on that day" is a different axis
   * (fixed_at) and belongs to P5.
   */
  clock_out_missing_fixed: number
  break_missing_fixed: number
  shift_20h_plus_fixed: number
  total_errors_fixed: number
}

export type TtkDashboardCounts = TtkIssueCountsData & {
  total_punches: number
}

/**
 * Los rankings de dealers ya no viajan acá: salen de Nest (`use-ttk-dealer-ranking`),
 * en un pedido que comparten la tarjeta del Dashboard y su modal "View all".
 */
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

const EMPTY_SUMMARY_BY_TYPE = {
  clock_out_missing: 0,
  break_missing: 0,
  shift_20h_plus: 0,
}

export const EMPTY_TTK_DASHBOARD_SUMMARY: TtkDashboardSummaryData = {
  counts: {
    total_punches: 0,
    only_error: { pending: 0, by_type: EMPTY_SUMMARY_BY_TYPE },
    only_error_clockout: { pending: 0 },
    only_error_break: { pending: 0 },
    manual_punch: { pending: 0 },
    without_salary: { pending: 0 },
    only_deletes: { pending: 0, by_type: EMPTY_SUMMARY_BY_TYPE },
    only_fixed: { pending: 0, punches: 0, by_type: EMPTY_SUMMARY_BY_TYPE, on_deleted: 0 },
  },
  error_trend: [],
}

export const TTK_ERROR_CODE_LABELS: Record<number, string> = {
  1: 'Without clock out',
  2: 'Break missing',
  3: 'Shift 20h+',
}

export function ttkErrorCodeLabel(code: number): string {
  return TTK_ERROR_CODE_LABELS[code] ?? 'Error'
}
