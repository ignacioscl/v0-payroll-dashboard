/** Duration from API (`08:30:00` / `00:46:48.00`) → legacy `formatHours()` "08:30 Hrs." */
export function formatDurationAsHhMmHrs(duration?: string | null): string {
  if (!duration?.trim()) return '—'
  const trimmed = duration.trim().replace(/\.\d+$/, '')
  if (trimmed === '00:00' || trimmed === '00:00:00') return '00 Hrs.'
  const parts = trimmed.split(':')
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]} Hrs.`
  }
  return '00 Hrs.'
}

/** Parse API duration string to decimal hours (fallback when `numberWork` is absent). */
export function parseDurationToDecimalHours(duration?: string | null): number | null {
  if (!duration?.trim()) return null
  const trimmed = duration.trim().replace(/\.\d+$/, '')
  const parts = trimmed.split(':').map((p) => Number(p))
  if (parts.some((p) => !Number.isFinite(p))) return null
  if (parts.length === 3) {
    return parts[0] + parts[1] / 60 + parts[2] / 3600
  }
  if (parts.length === 2) {
    return parts[0] + parts[1] / 60
  }
  return null
}

/** Per-punch timeWork/timeBreak — respects grouped hrs/decimal toggle (legacy visualHrsDec). */
export function formatPunchDurationDisplay(
  duration: string | null | undefined,
  decimalHours: number | null | undefined,
  useHoursFormat: boolean,
): string {
  if (useHoursFormat) {
    return formatDurationAsHhMmHrs(duration)
  }
  if (decimalHours != null && Number.isFinite(decimalHours)) {
    return formatDecimalHoursValue(decimalHours)
  }
  const parsed = parseDurationToDecimalHours(duration)
  return parsed != null ? formatDecimalHoursValue(parsed) : '—'
}

/** Decimal hours → legacy grouped view "HH:MM Hrs." (matches `formatHours()` in SRS legacy). */
export function formatDecimalAsHhMmHrs(decimalHours: number): string {
  if (!Number.isFinite(decimalHours)) return '—'
  if (decimalHours === 0) return '00 Hrs.'

  const totalMinutes = Math.round(decimalHours * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${String(minutes).padStart(2, '0')} Hrs.`
}

/** Decimal hours → "41.50" (legacy `hrs-dec` / `getMoneyNumber()` style). */
export function formatDecimalHoursValue(decimalHours: number): string {
  if (!Number.isFinite(decimalHours)) return '—'
  return decimalHours.toFixed(2)
}

export function formatGroupedHoursDisplay(
  decimalHours: number,
  useHoursFormat: boolean,
): string {
  return useHoursFormat
    ? formatDecimalAsHhMmHrs(decimalHours)
    : formatDecimalHoursValue(decimalHours)
}
