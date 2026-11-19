/**
 * Fechas de Reports › Open Invoices (plans/plan-reporte-javier §4.3): el «As of» es un domingo, no futuro, en hora de
 * Nueva York (la del «Generated» del Excel). Mismo criterio que `lastSundayYmd` del backend (open-invoice-aging.ts).
 * Siempre `YYYY-MM-DD` armados por componentes, sin `toISOString()` sobre horas locales (regla mysql-date-ranges).
 */

const NY = 'America/New_York'

/** Hoy en Nueva York, `YYYY-MM-DD`. */
export function todayNyYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** `YYYY-MM-DD` → fecha local a la medianoche de ese día (lo que muestra y devuelve el calendario). */
export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Fecha local del calendario → `YYYY-MM-DD` por sus componentes. */
export function localDateToYmd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** El último domingo ≤ hoy en Nueva York: el «As of» por defecto. */
export function lastSundayNyYmd(now: Date = new Date()): string {
  const today = ymdToLocalDate(todayNyYmd(now))
  today.setDate(today.getDate() - today.getDay())
  return localDateToYmd(today)
}

/** Un domingo que no es futuro (el backend valida lo mismo y contesta 400 si no). */
export function isValidAsOf(ymd: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  const d = ymdToLocalDate(ymd)
  return localDateToYmd(d) === ymd && d.getDay() === 0 && ymd <= todayNyYmd(now)
}

/** Instante ISO → «10/01/2026 10:12 AM» en Nueva York, como el «Generated» del Excel. */
export function formatNyDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('month')}/${get('day')}/${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`
}
