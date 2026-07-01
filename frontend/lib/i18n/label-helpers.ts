import type { IssueStatus, IssueType, PunchType } from '@/lib/types'
import type { PunchNoteKey, PunchTimeKey } from '@/lib/ttk/punch-form-utils'
import type { TodayLiveStatus, TodayLiveStatusFilter } from '@/lib/ttk/today-live-status'
import type { DateRangePreset, DateRangePresetKey } from '@/lib/filters/date-range-presets'
import type { TranslateFn } from './locale-context'

const ISSUE_FILTER_KEYS: Record<string, string> = {
  only_error: 'punch.onlyWithErrors',
  only_error_clockout: 'punch.withoutClockOut',
  only_error_break: 'punch.withoutBreak',
  manual_punch: 'punch.manualPlural',
  only_deletes: 'punch.deletedPlural',
  without_salary: 'punch.withoutSalary',
  only_fixed: 'punch.correctedPlural',
}

const ISSUE_TYPE_KEYS: Record<IssueType, string> = {
  missing_entry: 'issueTypes.missingEntry',
  missing_exit: 'issueTypes.missingExit',
  missing_lunch_out: 'issueTypes.missingLunchOut',
  missing_lunch_in: 'issueTypes.missingLunchIn',
  missing_clock_out: 'issueTypes.missingClockOut',
  late_arrival: 'issueTypes.lateArrival',
  late_departure: 'issueTypes.lateDeparture',
  early_departure: 'issueTypes.earlyDeparture',
  extended_lunch: 'issueTypes.extendedLunch',
  no_punches: 'issueTypes.noPunches',
  manual_punch: 'issueTypes.manualPunch',
  deleted_punch: 'issueTypes.deletedPunch',
  modified_payment: 'issueTypes.modifiedPayment',
}

const ISSUE_STATUS_KEYS: Record<IssueStatus, string> = {
  pending: 'issueStatus.pending',
  reviewed: 'issueStatus.reviewed',
  justified: 'issueStatus.justified',
}

const PUNCH_TYPE_KEYS: Record<PunchType, string> = {
  entry: 'punchTypes.entry',
  lunch_out: 'punchTypes.lunchOut',
  lunch_in: 'punchTypes.lunchIn',
  exit: 'punchTypes.exit',
}

const PUNCH_FIELD_KEYS: Record<PunchTimeKey, string> = {
  punchIn: 'punch.clockIn',
  breakStart: 'punch.breakStart',
  breakEnd: 'punch.breakEnd',
  punchOut: 'punch.clockOut',
}

const DATE_PRESET_KEYS: Record<DateRangePresetKey, string> = {
  last_7_days: 'filters.last7Days',
  last_15_days: 'filters.last15Days',
  last_30_days: 'filters.last30Days',
  this_month: 'filters.thisMonth',
  last_month: 'filters.lastMonth',
}

const LIVE_STATUS_KEYS: Record<
  TodayLiveStatusFilter,
  { label: string; description?: string }
> = {
  all: { label: 'liveStatus.all', description: 'liveStatus.allDescription' },
  on_lunch: { label: 'liveStatus.onLunch', description: 'liveStatus.onLunchDescription' },
  working: { label: 'liveStatus.working', description: 'liveStatus.workingDescription' },
  out: { label: 'liveStatus.out', description: 'liveStatus.outDescription' },
}

export function getIssueFilterLabel(t: TranslateFn, type: string): string {
  const key = ISSUE_FILTER_KEYS[type]
  return key ? t(key) : type
}

export function getIssueTypeLabels(t: TranslateFn): Record<IssueType, string> {
  return Object.fromEntries(
    Object.entries(ISSUE_TYPE_KEYS).map(([k, key]) => [k, t(key)]),
  ) as Record<IssueType, string>
}

export function getIssueStatusLabels(t: TranslateFn): Record<IssueStatus, string> {
  return Object.fromEntries(
    Object.entries(ISSUE_STATUS_KEYS).map(([k, key]) => [k, t(key)]),
  ) as Record<IssueStatus, string>
}

export function getPunchTypeLabels(t: TranslateFn): Record<PunchType, string> {
  return Object.fromEntries(
    Object.entries(PUNCH_TYPE_KEYS).map(([k, key]) => [k, t(key)]),
  ) as Record<PunchType, string>
}

export function getPunchFieldLabels(t: TranslateFn): Record<PunchTimeKey, string> {
  return Object.fromEntries(
    Object.entries(PUNCH_FIELD_KEYS).map(([k, key]) => [k, t(key)]),
  ) as Record<PunchTimeKey, string>
}

export function getPunchFieldLabel(t: TranslateFn, key: PunchTimeKey | PunchNoteKey): string {
  if (key.endsWith('Note')) {
    const timeKey = key.replace('Note', '') as PunchTimeKey
    return `${getPunchFieldLabels(t)[timeKey]} ${t('common.note')}`
  }
  return getPunchFieldLabels(t)[key as PunchTimeKey]
}

export function getDateRangePresets(t: TranslateFn): DateRangePreset[] {
  const base: Omit<DateRangePreset, 'label'>[] = [
    { key: 'last_7_days', kind: 'rolling_end_yesterday', days: 7 },
    { key: 'last_15_days', kind: 'rolling_end_yesterday', days: 15 },
    { key: 'last_30_days', kind: 'rolling_include_today', days: 30 },
    { key: 'this_month', kind: 'this_month' },
    { key: 'last_month', kind: 'last_month' },
  ]
  return base.map((preset) => ({
    ...preset,
    label: t(DATE_PRESET_KEYS[preset.key]),
  }))
}

export function getTodayLiveStatusOptions(t: TranslateFn) {
  return (Object.keys(LIVE_STATUS_KEYS) as TodayLiveStatusFilter[]).map((value) => {
    const keys = LIVE_STATUS_KEYS[value]
    return {
      value,
      label: t(keys.label),
      description: keys.description ? t(keys.description) : '',
    }
  })
}

export function todayLiveStatusLabelTranslated(
  t: TranslateFn,
  value: TodayLiveStatusFilter,
): string {
  const keys = LIVE_STATUS_KEYS[value]
  return keys ? t(keys.label) : value
}

export function getPunchMethodLabels(t: TranslateFn) {
  return {
    finger: t('punchMethod.finger'),
    face: t('punchMethod.face'),
  } as const
}

/** Map TTK issue filter card types to translation keys for dashboard KPIs. */
export function getDashboardKpiTitle(t: TranslateFn, key: string): string {
  const map: Record<string, string> = {
    total_punches: 'punch.total',
    only_error: 'punch.withErrors',
    error_rate: 'punch.errorRate',
    only_error_clockout: 'punch.withoutClockOut',
    manual_punch: 'punch.manualPlural',
    only_deletes: 'punch.deletedPlural',
    without_salary: 'punch.withoutSalary',
    only_fixed: 'punch.correctedPlural',
  }
  return map[key] ? t(map[key]) : key
}

export type { TodayLiveStatus }
