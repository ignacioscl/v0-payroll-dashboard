import type { DateRange } from 'react-day-picker'

/**
 * Devuelve la fecha de "ayer" a las 23:59:59.999 (fin del día).
 * Lo usamos como `to` por defecto para que el rango siempre termine
 * en el último día completo (no en "hoy" que todavía está corriendo).
 */
export function getYesterday(reference: Date = new Date()): Date {
  const d = new Date(reference)
  d.setHours(23, 59, 59, 999)
  d.setDate(d.getDate() - 1)
  return d
}

/**
 * Resta `days` días a `to` y devuelve esa fecha al inicio del día (00:00).
 */
export function subtractDays(to: Date, days: number): Date {
  const d = new Date(to)
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export type DateRangePresetKey = 'last_7_days' | 'last_15_days' | 'last_30_days'

export interface DateRangePreset {
  key: DateRangePresetKey
  label: string
  /** Cantidad de días hacia atrás desde ayer (incluyendo ayer). */
  days: number
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { key: 'last_7_days', label: 'Última semana', days: 7 },
  { key: 'last_15_days', label: 'Últimos 15 días', days: 15 },
  { key: 'last_30_days', label: 'Último mes', days: 30 },
]

/**
 * Calcula un rango terminando en "ayer" y arrancando `days - 1` días antes.
 * Ej: con days = 7 y hoy = 25/05 → from = 18/05, to = 24/05 (7 días incluyendo ayer).
 */
export function getPresetRange(days: number, reference: Date = new Date()): DateRange {
  const to = getYesterday(reference)
  const from = subtractDays(to, days - 1)
  return { from, to }
}

/**
 * Rango por defecto del dashboard: última semana terminando ayer.
 * Se usa tanto en el FilterProvider como en la página /components.
 */
export function getDefaultDateRange(reference: Date = new Date()): DateRange {
  return getPresetRange(7, reference)
}

/** Single calendar day: yesterday (00:00 → 23:59 local). */
export function getYesterdayOnlyDateRange(reference: Date = new Date()): DateRange {
  const to = getYesterday(reference)
  const from = subtractDays(to, 0)
  return { from, to }
}

/**
 * Dado un rango, intenta matchearlo contra un preset (comparando solo año/mes/día).
 * Útil para resaltar el preset activo en la UI.
 */
export function matchPreset(
  range: DateRange | undefined,
  reference: Date = new Date()
): DateRangePresetKey | null {
  if (!range?.from || !range?.to) return null
  for (const preset of DATE_RANGE_PRESETS) {
    const candidate = getPresetRange(preset.days, reference)
    if (
      sameDay(candidate.from!, range.from) &&
      sameDay(candidate.to!, range.to)
    ) {
      return preset.key
    }
  }
  return null
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
