export type TtkIssueCountBucket = {
  pending: number
  by_type?: {
    clock_out_missing: number
    break_missing: number
    shift_20h_plus: number
  }
}

export type TtkIssueCountsData = {
  only_error: TtkIssueCountBucket
  only_error_clockout: TtkIssueCountBucket
  manual_punch: TtkIssueCountBucket
  without_salary: TtkIssueCountBucket
  only_deletes: TtkIssueCountBucket
}

export type TtkIssueCountsResponse = {
  data?: { counts?: TtkIssueCountsData }
  counts?: TtkIssueCountsData
  status?: string
  error?: { message?: string }
}

export const EMPTY_TTK_ISSUE_COUNTS: TtkIssueCountsData = {
  only_error: { pending: 0, by_type: { clock_out_missing: 0, break_missing: 0, shift_20h_plus: 0 } },
  only_error_clockout: { pending: 0 },
  manual_punch: { pending: 0 },
  without_salary: { pending: 0 },
  only_deletes: { pending: 0 },
}
