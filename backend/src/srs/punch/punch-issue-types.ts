export const PUNCH_ISSUE_TYPES = [
  'all',
  'only_error',
  'only_error_clockout',
  'only_error_break',
  'manual_punch',
  'only_deletes',
  'without_salary',
  'only_fixed',
] as const

export type PunchIssueType = (typeof PUNCH_ISSUE_TYPES)[number]

export function isPunchIssueType(value: string): value is PunchIssueType {
  return (PUNCH_ISSUE_TYPES as readonly string[]).includes(value)
}
