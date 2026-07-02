/** Month buckets for KPI charts (UTC), aligned to fecha_desde grouping. */

const ALLOWED_HISTORY_MONTHS = [4, 6, 8, 10, 12] as const
export type SrsKpiHistoryMonths = (typeof ALLOWED_HISTORY_MONTHS)[number]

export function parseHistoryMonths(raw?: string | number): SrsKpiHistoryMonths {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (ALLOWED_HISTORY_MONTHS.includes(n as SrsKpiHistoryMonths)) {
    return n as SrsKpiHistoryMonths
  }
  return 4
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export interface SrsKpiMonthWindow {
  rangeStart: string
  rangeEnd: string
  monthStarts: string[]
}

/** Last N calendar months ending at fechaHasta (inclusive), first day of each month. */
export function buildMonthWindow(fechaHasta: string, historyMonths: SrsKpiHistoryMonths): SrsKpiMonthWindow {
  const endMonth = startOfMonth(parseDateOnly(fechaHasta))
  const monthStarts: string[] = []

  for (let i = historyMonths - 1; i >= 0; i--) {
    const bucket = new Date(endMonth)
    bucket.setUTCMonth(endMonth.getUTCMonth() - i)
    monthStarts.push(formatDateOnly(bucket))
  }

  return {
    rangeStart: monthStarts[0],
    rangeEnd: fechaHasta,
    monthStarts,
  }
}

export function fillMonthlyGaps<T extends { monthStart: string }>(
  rows: T[],
  monthStarts: string[],
  makeEmpty: (monthStart: string) => T,
): T[] {
  const byStart = new Map(rows.map((r) => [r.monthStart.slice(0, 10), r]))
  return monthStarts.map((monthStart) => byStart.get(monthStart) ?? makeEmpty(monthStart))
}
