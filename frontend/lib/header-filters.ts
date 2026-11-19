/**
 * Qué filtros muestra la barra de arriba en cada pantalla (plans/plan-buenas-practicas-v0, 4.7). Una fila por ruta:
 * agregar una pantalla con otra barra es sumar una fila, no tocar `header.tsx`. Se aparta de «desde la pantalla» de la
 * regla global (D13): la barra se dibuja en el servidor antes que la pantalla, y con un contexto saltaría al hidratar.
 */
export type HeaderDateFilter = 'range' | 'invoice' | 'year' | 'month' | 'sunday' | null

export interface HeaderFilters {
  /** Buscador de empleado (Expenses tiene sus propios combos: no lo usa). */
  search: boolean
  /** Distritos: solo Invoices. */
  district: boolean
  /**
   * `invoice`: período de la factura con Range/From/Until; `year`: combo de años; `month`: combo de mes; `sunday`: un
   * domingo («As of» de Open Invoices); `null`: nada.
   */
  date: HeaderDateFilter
  /** Tope del rango de fechas, en años (Punch Report: 1). */
  maxRangeYears?: number
}

const DEFAULT_FILTERS: HeaderFilters = { search: true, district: false, date: 'range' }

const under = (href: string) => (pathname: string) => pathname === href || pathname.startsWith(`${href}/`)
const exactly = (href: string) => (pathname: string) => pathname === href

const ROWS: { matches: (pathname: string) => boolean; filters: HeaderFilters }[] = [
  { matches: under('/billing/invoices'), filters: { search: true, district: true, date: 'invoice' } },
  { matches: under('/roles'), filters: { search: true, district: false, date: null } },
  { matches: under('/expenses'), filters: { search: false, district: false, date: 'range' } },
  { matches: under('/issues'), filters: { search: true, district: false, date: 'range', maxRangeYears: 1 } },
  { matches: exactly('/reports/income-by-dealer'), filters: { search: true, district: false, date: 'year' } },
  { matches: exactly('/reports/monthly-closing'), filters: { search: true, district: false, date: 'month' } },
  { matches: exactly('/reports/window-tint-closing'), filters: { search: true, district: false, date: 'month' } },
  // Open Invoices: el domingo «As of» va en la barra, como el mes de Monthly Closing (Ignacio, 18/11/2026). La
  // comparación de una foto usa el As of de la foto: sin fecha.
  { matches: exactly('/reports/open-invoices'), filters: { search: true, district: false, date: 'sunday' } },
  { matches: under('/reports/open-invoices'), filters: { search: true, district: false, date: null } },
]

export function getHeaderFilters(pathname: string): HeaderFilters {
  return ROWS.find((row) => row.matches(pathname))?.filters ?? DEFAULT_FILTERS
}
