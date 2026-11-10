/**
 * Cuentas puras del Monthly Closing y del Window Tint Closing (plans/plan-monthly-closing/PLAN.md T2/T4 y
 * plans/plan-reporte-tint/PLAN.md T2/T5). Todo en centavos enteros.
 */
import type { ClosingLineKind } from '../shared/kpi/srs-kpi-billed-lines'

export const toCents = (n: number): number => Math.round(n * 100)
export const fromCents = (c: number): number => c / 100

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
 * Regla única de «línea de tint» del Window Tint Closing (D2 de plans/plan-reporte-tint/PLAN.md): una WO
 * (facturada o no) o una línea libre de una Generic cuyo servicio tiene «tint» en el nombre. Nunca TTK ni las
 * ponchadas de una Generic: ahí el «servicio» es el nombre del empleado («Peluche Window Tinting LLC»).
 */
export const TINT_INCOME_KINDS: readonly ClosingLineKind[] = ['wo', 'woUnbilled', 'genericFree']

export function isTintIncomeLine(line: { kind: ClosingLineKind; service: string }): boolean {
  return TINT_INCOME_KINDS.includes(line.kind) && /tint/i.test(line.service)
}

/** Lo que el Window Tint Closing busca en el nombre del rol y de la categoría (D3, D4). */
export const TINT_ROLE_FRAGMENT = 'tint'
export const TINT_EXPENSE_CATEGORY = 'window tint film'

/** By service: una fila por dealer, departamento y servicio, con vehículos y monto (hoja del Excel). */
export function groupByService<L extends { dealerId: number; department: string; service: string; qty: number; cents: number }>(
  lines: L[],
): { dealerId: number; department: string; service: string; vehicles: number; cents: number }[] {
  const map = new Map<string, { dealerId: number; department: string; service: string; vehicles: number; cents: number }>()
  for (const l of lines) {
    const key = `${l.dealerId}|${l.department}|${l.service}`
    const row = map.get(key) ?? { dealerId: l.dealerId, department: l.department, service: l.service, vehicles: 0, cents: 0 }
    row.vehicles += l.qty
    row.cents += l.cents
    map.set(key, row)
  }
  return [...map.values()]
}
