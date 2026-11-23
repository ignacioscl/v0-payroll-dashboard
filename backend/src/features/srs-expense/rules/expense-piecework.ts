/**
 * Reglas puras de la expense Piecework (plans/plan-reunion-juan-18-11, temas 3 y 4, D4–D8). Sin base: las prueba
 * expense-piecework.spec.ts.
 */
import type { PayrollPeriod } from 'src/srs/payroll/snapshot/payroll-snapshot.types'
import type { WorkOrderServicePiecework } from 'src/srs/payroll/snapshot/payroll-source.repository'
import { fromCents, toCents } from './expense-rules'

/** La categoría de toda expense Piecework (por nombre, creada al vuelo como cualquier categoría). */
export const PIECEWORK_EXPENSE_CATEGORY = 'Piecework'

export const MSG_CHOOSE_VENDOR = 'Choose a vendor.'
export const MSG_CHOOSE_WORK_ORDERS = 'Choose at least one work order.'
export const MSG_WORK_ORDER_NOT_AVAILABLE =
  'One or more work orders are not available for this vendor and month: they are not in its pay periods or they are already in another Piecework expense.'
export const MSG_NO_PAY_PERIODS = 'This month has no pay periods.'
export const MSG_PIECEWORK_LOCKED =
  'A Piecework expense keeps its vendor, date and split: its amount follows its work orders. Change the work orders in Edit.'
export const MSG_NOT_PIECEWORK = 'This is not a Piecework expense.'
export const MSG_PIECEWORK_RESTORE_TAKEN =
  'One of the work orders of this Piecework expense is already in another active Piecework expense.'

/** `YYYY-MM` de una fecha `YYYY-MM-DD`. */
export function monthOf(ymd: string): string {
  return ymd.slice(0, 7)
}

/** El pay period (de los que terminan en el mes) que contiene el día, o null (D5). */
export function periodOf(workDate: string, periods: readonly PayrollPeriod[]): PayrollPeriod | null {
  return periods.find((p) => workDate >= p.desde && workDate <= p.hasta) ?? null
}

/** Una WO de la tabla del modal: sus servicios del vendor sumados. */
export interface PieceworkWorkOrder {
  idInvoice: number
  nro: string
  vin: string
  idDealer: number
  workDate: string
  /** Suma del piecework de sus servicios, con dos decimales. */
  piecework: string
  /** Algún servicio con «tint» en el nombre (Window Tint Closing cuenta solo esa parte). */
  services: string[]
}

/**
 * Las filas por servicio, solo las de los pay periods del mes y las que no están tomadas, agrupadas por WO, en el orden
 * de la consulta (fecha de alta, WO).
 */
export function availableWorkOrders(
  rows: readonly WorkOrderServicePiecework[],
  periods: readonly PayrollPeriod[],
  taken: ReadonlySet<number>,
): PieceworkWorkOrder[] {
  const byInvoice = new Map<number, { wo: PieceworkWorkOrder; cents: number }>()
  for (const r of rows) {
    if (taken.has(r.idInvoice) || !periodOf(r.workDate, periods)) continue
    let acc = byInvoice.get(r.idInvoice)
    if (!acc) {
      acc = {
        wo: { idInvoice: r.idInvoice, nro: r.nro, vin: r.vin, idDealer: r.idDealer, workDate: r.workDate, piecework: '0.00', services: [] },
        cents: 0,
      }
      byInvoice.set(r.idInvoice, acc)
    }
    acc.cents += toCents(r.piecework)
    if (!acc.wo.services.includes(r.service)) acc.wo.services.push(r.service)
  }
  return [...byInvoice.values()].map(({ wo, cents }) => ({ ...wo, piecework: fromCents(cents) }))
}

/** Una fila de EXP_EXPENSE por dealer: la suma del piecework de sus WO marcadas (D7). */
export function amountsByDealer(rows: readonly WorkOrderServicePiecework[]): { idDealer: number; amount: string }[] {
  const cents = new Map<number, number>()
  for (const r of rows) cents.set(r.idDealer, (cents.get(r.idDealer) ?? 0) + toCents(r.piecework))
  return [...cents.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idDealer, c]) => ({ idDealer, amount: fromCents(c) }))
}
