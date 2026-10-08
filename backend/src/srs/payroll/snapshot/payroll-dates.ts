/**
 * Fechas del snapshot de payroll: siempre strings `YYYY-MM-DD`, sin `Date` local ni
 * `toISOString()` sobre horas locales (regla mysql-date-ranges). Las cuentas se hacen al
 * mediodía UTC para que ningún corrimiento de zona mueva el día.
 */

const DAY_MS = 86_400_000

function toUtcNoon(ymd: string): number {
  return Date.parse(`${ymd}T12:00:00Z`)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(ymd: string, days: number): string {
  return fromUtc(toUtcNoon(ymd) + days * DAY_MS)
}

/** Días de `desde` a `hasta` (0 si son el mismo día). */
export function diffDays(desde: string, hasta: string): number {
  return Math.round((toUtcNoon(hasta) - toUtcNoon(desde)) / DAY_MS)
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

/** Suma meses calendario; si el día no existe en el mes destino, queda el último día del mes. */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return fromUtc(target.getTime())
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !YMD.test(value)) return false
  const ms = toUtcNoon(value)
  return Number.isFinite(ms) && fromUtc(ms) === value
}

/** Todos los días de `desde` a `hasta`, los dos incluidos. Vacío si `hasta < desde`. */
export function eachDay(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let d = desde; d <= hasta; d = addDays(d, 1)) out.push(d)
  return out
}

/** 0 = lunes … 6 = domingo (igual que WEEKDAY() de MySQL). */
export function weekdayMondayZero(ymd: string): number {
  return (new Date(toUtcNoon(ymd)).getUTCDay() + 6) % 7
}

/**
 * Inicio de la semana de una fecha con la misma regla que `TTK_DATE_GROUP_REPORT` para
 * `payment_method = 1` (DDL 8973-9005): domingo de la semana ISO + `first_day_week` días.
 * Verificado contra la función para el provider 188 (`first_day_week = 1`): 07/06/2026 (lunes)
 * → 07/06..07/12; 07/05/2026 (domingo) → 06/29..07/05.
 */
export function weekStart(ymd: string, firstDayWeek: number): string {
  const fdw = Number.isFinite(firstDayWeek) && firstDayWeek > 0 ? firstDayWeek : 0
  const monday = addDays(ymd, -weekdayMondayZero(ymd))
  let from = addDays(monday, -1)
  if (diffDays(from, ymd) >= 6) from = addDays(from, 7)
  from = addDays(from, fdw)
  if (ymd < from) from = addDays(from, -7)
  return from
}

export function weekEnd(ymd: string, firstDayWeek: number): string {
  return addDays(weekStart(ymd, firstDayWeek), 6)
}

/** Fecha de hoy en una zona IANA, como `YYYY-MM-DD`. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Zona de negocio de los jobs de payroll. */
export const PAYROLL_TIME_ZONE = 'America/New_York'

/**
 * Corte de datos del snapshot: nunca incluye hoy ni ayer (decisión de Ignacio, 30/09/2026).
 * Entran las ponchadas, WO y días de prorrateo hasta `hoy − 2`.
 */
export function snapshotCutoff(now: Date = new Date()): string {
  return addDays(todayInZone(PAYROLL_TIME_ZONE, now), -2)
}

/** 'YYYY-MM-DD HH:MM:SS' en UTC, para columnas DATETIME. */
export function utcDateTime(now: Date = new Date()): string {
  return now.toISOString().slice(0, 19).replace('T', ' ')
}
