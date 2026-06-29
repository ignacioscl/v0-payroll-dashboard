/**
 * Bucketing semanal (UTC) para los gráficos KPI por semana.
 * Espeja `mysqlWeekBucketStartExpr`: lunes ISO, pero el primer bucket se "clampa"
 * a fechaDesde cuando el rango no arranca un lunes (evita una semana previa al rango).
 */

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfIsoWeek(date: Date): Date {
  const day = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const weekStart = new Date(date)
  weekStart.setUTCDate(date.getUTCDate() + diff)
  return weekStart
}

/** Lista ordenada de weekStart (YYYY-MM-DD) que cubren el rango, igual que el SQL. */
export function enumerateWeekBuckets(fechaDesde: string, fechaHasta: string): string[] {
  const rangeStart = parseDateOnly(fechaDesde)
  const rangeEnd = parseDateOnly(fechaHasta)
  const isoRangeStart = startOfIsoWeek(rangeStart)
  const firstBucket =
    isoRangeStart.getTime() < rangeStart.getTime() ? new Date(rangeStart) : isoRangeStart
  const endBucket = startOfIsoWeek(rangeEnd)
  const buckets: string[] = []
  let cursor = new Date(firstBucket)
  let isFirstPartialWeek =
    firstBucket.getTime() === rangeStart.getTime() && firstBucket.getTime() > isoRangeStart.getTime()

  while (cursor <= endBucket) {
    buckets.push(formatDateOnly(cursor))
    if (isFirstPartialWeek) {
      cursor = new Date(isoRangeStart)
      cursor.setUTCDate(isoRangeStart.getUTCDate() + 7)
      isFirstPartialWeek = false
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 7)
    }
  }

  return buckets
}

/** Rellena las semanas faltantes con una fila vacía para que el eje X sea continuo. */
export function fillWeeklyGaps<T extends { weekStart: string }>(
  rows: T[],
  fechaDesde: string,
  fechaHasta: string,
  makeEmpty: (weekStart: string) => T,
): T[] {
  const byStart = new Map(rows.map((r) => [r.weekStart, r]))
  return enumerateWeekBuckets(fechaDesde, fechaHasta).map(
    (weekStart) => byStart.get(weekStart) ?? makeEmpty(weekStart),
  )
}
