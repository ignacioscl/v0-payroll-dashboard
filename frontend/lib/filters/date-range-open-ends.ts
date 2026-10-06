import type { DateRange } from 'react-day-picker'

/**
 * Período con un extremo abierto (solo Invoices, plans/plan-payroll-spend §1 bis):
 *  - `range`: desde y hasta, como siempre;
 *  - `from`: un día, y vale todo desde ese día hasta hoy;
 *  - `until`: un día, y vale todo hasta ese día inclusive, desde el 01/01/2015.
 * El backend no cambia: siempre recibe dos fechas concretas.
 */
export type InvoiceDateMode = 'range' | 'from' | 'until'

export function isInvoiceDateMode(value: unknown): value is InvoiceDateMode {
  return value === 'range' || value === 'from' || value === 'until'
}

/** Primer día de «Until» (Ignacio, 03/10: en la copia de PROD la WO más vieja es de 2017). */
export function openRangeEarliest(): Date {
  return new Date(2015, 0, 1)
}

/** Hoy a la medianoche local (el «hasta» de «From»). */
function todayLocal(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Convierte el día elegido en «From» / «Until» en el rango concreto que va al listado. */
export function resolveOpenRange(mode: InvoiceDateMode, day: Date): { from: Date; to: Date } {
  if (mode === 'from') return { from: day, to: todayLocal() }
  if (mode === 'until') return { from: openRangeEarliest(), to: day }
  return { from: day, to: day }
}

/** El día que muestra el botón y el calendario para cada modo. */
export function openRangeDay(mode: InvoiceDateMode, range: DateRange | undefined): Date | undefined {
  if (!range) return undefined
  return mode === 'until' ? range.to ?? range.from : range.from
}
