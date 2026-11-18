/**
 * Qué filtros muestra la barra de arriba en cada pantalla (plans/plan-buenas-practicas-v0, 4.7). Una fila por ruta:
 * agregar una pantalla con otra barra es sumar una fila, no tocar `header.tsx`. Se aparta de «desde la pantalla» de la
 * regla global (D13): la barra se dibuja en el servidor antes que la pantalla, y con un contexto saltaría al hidratar.
 */
export type HeaderDateFilter = 'range' | 'invoice' | 'year' | 'month' | null

export interface HeaderFilters {
  /** Buscador de empleado (Expenses tiene sus propios combos: no lo usa). */
  search: boolean
  /** Distritos: solo Invoices. */
  district: boolean
  /** `invoice`: período de la factura con Range/From/Until; `year`: combo de años; `month`: combo de mes; `null`: nada. */
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
  // Open Invoices: la fecha «As of» va en la pantalla (un domingo), no en la barra (plans/plan-reporte-javier §4.3).
  { matches: under('/reports/open-invoices'), filters: { search: true, district: false, date: null } },
]

export function getHeaderFilters(pathname: string): HeaderFilters {
  return ROWS.find((row) => row.matches(pathname))?.filters ?? DEFAULT_FILTERS
}
