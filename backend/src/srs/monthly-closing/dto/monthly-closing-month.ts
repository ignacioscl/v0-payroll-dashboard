/**
 * El mes del Monthly Closing (T4 de plans/plan-monthly-closing/PLAN.md, regla «todo campo valida que el dato
 * sea real»). PAREJA de frontend/lib/reports/monthly-closing-month.ts: mismo criterio en las dos puntas; si
 * cambia uno, cambia el otro.
 *
 * Válido: `YYYY-MM`, mes 01–12, desde 2020-01 y no posterior al mes actual de New York.
 */
export const MONTHLY_CLOSING_MONTH_ERROR = 'Choose a valid month.'
export const MONTHLY_CLOSING_FIRST_MONTH = '2020-01'

/** Mes actual en New York, `YYYY-MM`. */
export function currentNyMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' })
    .formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value ?? ''
  const m = parts.find((p) => p.type === 'month')?.value ?? ''
  return `${y}-${m}`
}

export function isValidClosingMonth(value: unknown, now: Date = new Date()): value is string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false
  return value >= MONTHLY_CLOSING_FIRST_MONTH && value <= currentNyMonth(now)
}

/** Primer y último día del mes (`YYYY-MM-DD`). */
export function monthBounds(month: string): { firstDay: string; lastDay: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { firstDay: `${month}-01`, lastDay: `${month}-${String(last).padStart(2, '0')}` }
}
