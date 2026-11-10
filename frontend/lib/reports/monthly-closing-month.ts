/**
 * El mes del Monthly Closing (T4/T6 de plans/plan-monthly-closing/PLAN.md, regla «todo campo valida que el dato
 * sea real»). PAREJA de backend/src/srs/monthly-closing/dto/monthly-closing-month.ts: mismo criterio en las dos
 * puntas; si cambia uno, cambia el otro.
 *
 * Válido: `YYYY-MM`, mes 01–12, desde 2020-01 y no posterior al mes actual de New York.
 */
export const MONTHLY_CLOSING_FIRST_MONTH = '2020-01'

/**
 * Alcance del reporte (T1 de plans/plan-reporte-tint/PLAN.md). PAREJA de `CLOSING_SCOPES` en
 * backend/src/srs/monthly-closing/dto/monthly-closing.dto.ts.
 */
export const CLOSING_SCOPES = ['all', 'tint'] as const
export type ClosingScope = (typeof CLOSING_SCOPES)[number]

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

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

/** El mes anterior al actual de New York: el último cerrado (por defecto del filtro, MC §5.4.1). */
export function defaultClosingMonth(now: Date = new Date()): string {
  const [y, m] = currentNyMonth(now).split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Primer y último día del mes (`YYYY-MM-DD`). */
export function monthBounds(month: string): { firstDay: string; lastDay: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { firstDay: `${month}-01`, lastDay: `${month}-${String(last).padStart(2, '0')}` }
}

/** «2026-09» → «September 2026» (combo y título del detalle). */
export function closingMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`
}

/** Los meses del combo, del actual de New York a 2020-01. */
export function closingMonthOptions(now: Date = new Date()): string[] {
  const out: string[] = []
  let [y, m] = currentNyMonth(now).split('-').map(Number)
  for (;;) {
    const v = `${y}-${String(m).padStart(2, '0')}`
    if (v < MONTHLY_CLOSING_FIRST_MONTH) break
    out.push(v)
    if (m === 1) {
      y -= 1
      m = 12
    } else {
      m -= 1
    }
  }
  return out
}
