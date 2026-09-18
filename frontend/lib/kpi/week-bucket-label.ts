import { endOfISOWeek, format, min, parseISO, startOfDay } from 'date-fns'

/**
 * Etiqueta de periodo para un bucket semanal KPI (eje X / tooltip).
 * Espeja srs-kpi-week: weekStart es el lunes ISO o fechaDesde clamped;
 * el fin es el domingo de esa semana ISO (weekEndInclusive), acotado a fechaHasta.
 * Así la primera semana parcial (p. ej. vie 1 de mayo) termina el domingo 3, no el 7.
 */
export function formatWeekBucketLabel(weekStart: string, fechaHasta?: string): string {
  const start = parseISO(weekStart)
  const sunday = startOfDay(endOfISOWeek(start))
  const end = fechaHasta ? min([sunday, parseISO(fechaHasta)]) : sunday

  const startLabel = format(start, 'MMM d')
  const endLabel = format(end, 'MMM d')

  if (start.getTime() === end.getTime()) return startLabel
  return `${startLabel} – ${endLabel}`
}
