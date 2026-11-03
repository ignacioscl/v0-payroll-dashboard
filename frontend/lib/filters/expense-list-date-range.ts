import type { DateRange } from 'react-day-picker'

import { toYmd } from '@/lib/expenses/expense-format'
import { getRollingDaysIncludingTodayRange } from '@/lib/filters/date-range-presets'

/**
 * Expenses List: mientras el usuario no eligió fechas, los 7 días que terminan hoy (las demás pantallas
 * terminan ayer), así el gasto cargado hoy se ve (plans/plan-expenses-rango-hoy, D2).
 */
export function expenseListDefaultRange(reference: Date = new Date()): DateRange {
  return getRollingDaysIncludingTodayRange(7, reference)
}

/** Mismo rango por día, sin mirar la hora. */
export function isSameYmdRange(a: DateRange | undefined, b: DateRange | undefined): boolean {
  return toYmd(a?.from) === toYmd(b?.from) && toYmd(a?.to ?? a?.from) === toYmd(b?.to ?? b?.from)
}
