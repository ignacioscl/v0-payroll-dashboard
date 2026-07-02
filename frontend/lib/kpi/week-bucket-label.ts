import { addDays, format, min, parseISO } from 'date-fns'

/**
 * Etiqueta de periodo para un bucket semanal KPI (eje X / tooltip).
 * Espeja srs-kpi-week: weekStart es el lunes ISO o fechaDesde clamped;
 * el fin es weekStart + 6 días, acotado a fechaHasta.
 */
export function formatWeekBucketLabel(weekStart: string, fechaHasta?: string): string {
  const start = parseISO(weekStart)
  const end = fechaHasta
    ? min([addDays(start, 6), parseISO(fechaHasta)])
    : addDays(start, 6)

  const startLabel = format(start, 'MMM d')
  const endLabel = format(end, 'MMM d')

  if (start.getTime() === end.getTime()) return startLabel
  return `${startLabel} – ${endLabel}`
}
