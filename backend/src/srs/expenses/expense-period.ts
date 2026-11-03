/**
 * Fechas `YYYY-MM-DD` por componentes, sin pasar por la zona horaria del proceso (regla mysql-date-ranges: nada
 * de toISOString()). Las usan Analytics (período anterior) y Recurring (Next run, Next 30 days).
 */

export function ymdToUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function utcToYmd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  const d = date.getUTCDate()
  return `${String(y).padStart(4, '0')}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`
}

export function addDays(ymd: string, days: number): string {
  const date = ymdToUtc(ymd)
  date.setUTCDate(date.getUTCDate() + days)
  return utcToYmd(date)
}

/** Días entre dos fechas, puntas incluidas (`2026-11-01`..`2026-11-30` = 30). */
export function daysInclusive(from: string, to: string): number {
  const ms = ymdToUtc(to).getTime() - ymdToUtc(from).getTime()
  return Math.round(ms / 86400000) + 1
}

/** El período anterior de igual largo, pegado al actual (Analytics «vs. previous period»). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = daysInclusive(from, to)
  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(length - 1))
  return { from: prevFrom, to: prevTo }
}

/** 0 = Sunday … 6 = Saturday, como `date("w")` del cron PHP. */
export function weekDayOf(ymd: string): number {
  return ymdToUtc(ymd).getUTCDay()
}

export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10))
}

/** `YYYY-MM-DD HH:mm:ss` en New York, para approved_date / deleted_date / delete_date (legacy usa date() del servidor). */
export function nowNyStamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`
}

/** El mes actual en NY como rango (default de los filtros, por si el front no manda fechas). */
export function monthRange(ymd: string): { from: string; to: string } {
  const from = `${ymd.slice(0, 7)}-01`
  const next = ymdToUtc(from)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { from, to: addDays(utcToYmd(next), -1) }
}
