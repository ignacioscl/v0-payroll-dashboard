import type { DateRange } from 'react-day-picker'

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Returns "yesterday" at 23:59:59.999 (end of day).
 * Used as `to` for rolling presets that exclude today.
 */
export function getYesterday(reference: Date = new Date()): Date {
  const d = new Date(reference)
  d.setDate(d.getDate() - 1)
  return endOfDay(d)
}

/** Subtract `days` from `date` and return start of that day. */
export function subtractDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - days)
  return startOfDay(d)
}

export type DateRangePresetKey =
  | 'last_7_days'
  | 'last_15_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'

export type DateRangePresetKind =
  | 'rolling_end_yesterday'
  | 'rolling_include_today'
  | 'this_month'
  | 'last_month'

export interface DateRangePreset {
  key: DateRangePresetKey
  label: string
  kind: DateRangePresetKind
  /** Rolling window length (days). */
  days?: number
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { key: 'last_7_days', label: 'Last 7 days', kind: 'rolling_end_yesterday', days: 7 },
  { key: 'last_15_days', label: 'Last 15 days', kind: 'rolling_end_yesterday', days: 15 },
  { key: 'last_30_days', label: 'Last 30 days', kind: 'rolling_include_today', days: 30 },
  { key: 'this_month', label: 'This month', kind: 'this_month' },
  { key: 'last_month', label: 'Last Month', kind: 'last_month' },
]

/**
 * Rolling range ending yesterday: `days` calendar days including yesterday.
 * E.g. days = 7 and today = May 25 → from = May 18, to = May 24.
 */
export function getPresetRange(days: number, reference: Date = new Date()): DateRange {
  const to = getYesterday(reference)
  const from = subtractDays(to, days - 1)
  return { from, to }
}

/**
 * Rolling range including today: `days` calendar days with today as the last day.
 * E.g. days = 30 and today = Jun 4 → from = May 6, to = Jun 4.
 */
export function getRollingDaysIncludingTodayRange(
  days: number,
  reference: Date = new Date()
): DateRange {
  const to = endOfDay(reference)
  const from = subtractDays(reference, days - 1)
  return { from, to }
}

/** First day of the current month through today (inclusive). */
export function getThisMonthRange(reference: Date = new Date()): DateRange {
  const ref = new Date(reference)
  const from = startOfDay(new Date(ref.getFullYear(), ref.getMonth(), 1))
  const to = endOfDay(ref)
  return { from, to }
}

/** First through last day of the calendar month before the reference date. */
export function getLastMonthRange(reference: Date = new Date()): DateRange {
  const ref = new Date(reference)
  const lastDayPrevMonth = new Date(ref.getFullYear(), ref.getMonth(), 0)
  const from = startOfDay(new Date(lastDayPrevMonth.getFullYear(), lastDayPrevMonth.getMonth(), 1))
  const to = endOfDay(lastDayPrevMonth)
  return { from, to }
}

export function resolvePresetRange(
  preset: DateRangePreset,
  reference: Date = new Date()
): DateRange {
  switch (preset.kind) {
    case 'rolling_end_yesterday':
      return getPresetRange(preset.days!, reference)
    case 'rolling_include_today':
      return getRollingDaysIncludingTodayRange(preset.days!, reference)
    case 'this_month':
      return getThisMonthRange(reference)
    case 'last_month':
      return getLastMonthRange(reference)
  }
}

/** Default dashboard range: last 7 days ending yesterday. */
export function getDefaultDateRange(reference: Date = new Date()): DateRange {
  return getPresetRange(7, reference)
}

/** Single calendar day: yesterday (00:00 → 23:59 local). */
export function getYesterdayOnlyDateRange(reference: Date = new Date()): DateRange {
  const to = getYesterday(reference)
  const from = subtractDays(to, 0)
  return { from, to }
}

/** Single calendar day: today (00:00 → 23:59 local). */
export function getTodayDateRange(reference: Date = new Date()): DateRange {
  const from = startOfDay(reference)
  const to = endOfDay(reference)
  return { from, to }
}

/** True when the range covers today only (from and to are both today). */
export function isTodayOnlyDateRange(
  range: DateRange | undefined,
  reference: Date = new Date(),
): boolean {
  if (!range?.from) return false
  const to = range.to ?? range.from
  return sameDay(range.from, reference) && sameDay(to, reference)
}

/** Match a range against a preset (year/month/day only). */
export function matchPreset(
  range: DateRange | undefined,
  reference: Date = new Date()
): DateRangePresetKey | null {
  if (!range?.from || !range?.to) return null
  for (const preset of DATE_RANGE_PRESETS) {
    const candidate = resolvePresetRange(preset, reference)
    if (
      sameDay(candidate.from!, range.from) &&
      sameDay(candidate.to!, range.to)
    ) {
      return preset.key
    }
  }
  return null
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
