/**
 * Cuentas puras del Monthly Closing y del Window Tint Closing (plans/plan-monthly-closing/PLAN.md T2/T4 y
 * plans/plan-reporte-tint/PLAN.md T2/T5). Todo en centavos enteros.
 */
import type { ClosingLineKind } from '../shared/kpi/srs-kpi-billed-lines'
import { fromCents, toCents } from '../shared/kpi/srs-kpi-cents'

export { fromCents, toCents }

/** Profit/Loss ÷ Income con un decimal; null con Income $0 (la pantalla muestra «—»). */
export function profitPct(profitCents: number, incomeCents: number): number | null {
  if (incomeCents === 0) return null
  return Math.round((profitCents / incomeCents) * 1000) / 10
}

/**
 * Importe canónico de cada dealer y período: suma de `ROUND(SUM(monto), 2)` por tipo y concepto +
 * `ROUND(SUM(tax), 2)`, como redondea el TTK Payroll Report de legacy (por dealer, quincena y columna).
 * Clave `${idDealer ?? 'none'}|${periodoDesde}` → centavos.
 */
export function canonicalPayrollCents(
  rows: { idDealer: number | null; periodoDesde: string; monto: number; tax: number }[],
): Map<string, number> {
  const amount = new Map<string, number>()
  const tax = new Map<string, number>()
  for (const r of rows) {
    const key = payrollKey(r.idDealer, r.periodoDesde)
    amount.set(key, (amount.get(key) ?? 0) + toCents(r.monto))
    tax.set(key, (tax.get(key) ?? 0) + r.tax)
  }
  for (const [key, t] of tax) amount.set(key, (amount.get(key) ?? 0) + toCents(t))
  return amount
}

export function payrollKey(idDealer: number | null, periodoDesde: string): string {
  return `${idDealer ?? 'none'}|${periodoDesde}`
}

/**
 * Filas por empleado de un dealer y período llevadas a centavos con el mayor resto (T2 de MC): cada una se
 * trunca y los centavos que faltan para el importe canónico van, de a uno, a las de mayor resto (empate: por
 * nombre). Así el detalle suma su fila al centavo.
 */
export function largestRemainderCents<T extends { amount: number; employee: string }>(
  rows: T[],
  targetCents: number,
): (T & { cents: number })[] {
  const exact = rows.map((r) => ({ r, raw: r.amount * 100 }))
  const floored = exact.map((x) => ({ ...x, cents: Math.floor(x.raw + 1e-9) }))
  let missing = targetCents - floored.reduce((a, x) => a + x.cents, 0)
  const order = [...floored].sort(
    (a, b) => b.raw - Math.floor(b.raw + 1e-9) - (a.raw - Math.floor(a.raw + 1e-9)) || a.r.employee.localeCompare(b.r.employee),
  )
  // Un residuo negativo (canónico menor que la suma truncada) saca de las de menor resto.
  if (missing < 0) order.reverse()
  for (let i = 0; missing !== 0 && order.length > 0; i = (i + 1) % order.length) {
    order[i].cents += missing > 0 ? 1 : -1
    missing += missing > 0 ? -1 : 1
  }
  return floored.map((x) => ({ ...x.r, cents: x.cents }))
}

/**
 * Servicio de tint: «tint» en el nombre. En el Window Tint Closing ya no decide qué entra al Income (eso lo
 * decide el tintero asignado a la WO, plans/plan-window-tint-closing-tint-y-servicios T2): decide qué suma
 * Vehicles y qué fila se marca en rojo.
 */
export function isTintService(service: string): boolean {
  return /tint/i.test(service)
}

/**
 * Regla única de qué va en rojo en el Window Tint Closing (fila del dealer, detalle, By service y Excel): un
 * servicio sin «tint» en el nombre y con importe. Un servicio en $0 no se marca (Ignacio, 11/11/2026: Lexus Palm
 * Beach quedaba en rojo solo por dos «Others» de $0.00).
 */
export function isNonTintWarning(line: { service: string; cents: number }): boolean {
  return !isTintService(line.service) && line.cents !== 0
}

/**
 * D2 de plans/plan-window-tint-closing-tint-y-servicios: las líneas libres de una Generic con «tint» no tienen
 * tintero asignado. Mientras Auto Wax no conteste siguen contando, como hasta ahora; si contesta que no, va false.
 */
export const TINT_GENERIC_FREE_COUNTS = true

/**
 * Regla única de qué línea del Closing entra al Window Tint Closing. Las WO (facturadas o no) ya vienen acotadas
 * a las asignadas a un tintero (incomeLinesForRange con assignedTo), así que entran todas, digan «tint» o no.
 * Las libres de una Generic, solo con «tint» (D2). Nunca TTK ni las ponchadas de una Generic.
 */
export function isTintClosingLine(line: { kind: ClosingLineKind; service: string }): boolean {
  if (line.kind === 'wo' || line.kind === 'woUnbilled') return true
  return TINT_GENERIC_FREE_COUNTS && line.kind === 'genericFree' && isTintService(line.service)
}

/** Lo que el Window Tint Closing busca en el nombre del rol y de la categoría (D3, D4). */
export const TINT_ROLE_FRAGMENT = 'tint'
export const TINT_EXPENSE_CATEGORY = 'window tint film'

export interface ByServiceRow {
  dealerId: number
  department: string
  service: string
  /** Suma de la Qty de ese servicio, diga «tint» o no (M1 de la review v1). */
  vehicles: number
  cents: number
  /** El servicio tiene «tint» en el nombre (decide qué suma Vehicles). */
  tint: boolean
  /** Va en rojo: sin «tint» y con importe (isNonTintWarning sobre el total del servicio). */
  warn: boolean
}

/**
 * By service: una fila por dealer, departamento y servicio, con vehículos y monto, ordenada por departamento y
 * servicio. La misma función arma la solapa del Excel y la pestaña del modal, así no pueden dar distinto.
 */
export function groupByService<L extends { dealerId: number; department: string; service: string; qty: number; cents: number }>(
  lines: readonly L[],
): ByServiceRow[] {
  const map = new Map<string, ByServiceRow>()
  for (const l of lines) {
    const key = `${l.dealerId}|${l.department}|${l.service}`
    const row = map.get(key) ?? {
      dealerId: l.dealerId,
      department: l.department,
      service: l.service,
      vehicles: 0,
      cents: 0,
      tint: isTintService(l.service),
      warn: false,
    }
    row.vehicles += l.qty
    row.cents += l.cents
    map.set(key, row)
  }
  for (const row of map.values()) row.warn = isNonTintWarning(row)
  return [...map.values()].sort(
    (a, b) => a.dealerId - b.dealerId || a.department.localeCompare(b.department) || a.service.localeCompare(b.service),
  )
}
