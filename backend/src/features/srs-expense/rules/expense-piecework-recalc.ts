/**
 * Reglas puras de «la expense Piecework sigue a sus WO» (plans/plan-reunion-juan-18-11 v9, tema 4, sección v6, D18–D20;
 * reviews R1–R4). Sin base: las prueba expense-piecework-recalc.spec.ts.
 *
 * Una fila de la expense (una WO + un servicio del vendor) se vuelve a evaluar cuando el Payroll de su pay period se
 * reescribe. Lo que puede pasar lo decide `decideRow`; el motivo, `changeReasons`.
 */
import type { PayrollPeriod } from 'src/srs/payroll/snapshot/payroll-snapshot.types'
import { fromCents, toCents } from './expense-rules'

/** Códigos de motivo: van en EXP_EXPENSE_PIECEWORK_WO_HISTORY.reason; el texto lo arma la pantalla (en/es). */
export const PIECEWORK_REASON = {
  woDeleted: 'wo_deleted',
  woActiveAgain: 'wo_active_again',
  serviceRemoved: 'service_removed',
  serviceAdded: 'service_added',
  vendorRemoved: 'vendor_removed',
  vendorAdded: 'vendor_added',
  servicePiecework: 'service_piecework',
  vendorPiecework: 'vendor_piecework',
  servicePrice: 'service_price',
  employeeCount: 'employee_count',
  dealer: 'dealer',
  date: 'date',
  /** D20: la fecha nueva cae fuera de los pay periods de la expense; la WO queda libre. */
  movedOut: 'moved_out',
  /** R2 (ciclo 2): la fecha nueva cae en un pay period que el Payroll ya no recalcula. */
  movedFrozen: 'moved_frozen',
  /** R4: nada de lo guardado explica el cambio (tarifa o tipo de pago de la ficha, ponchada del día). */
  calc: 'calc',
  editAdded: 'edit_added',
  editRemoved: 'edit_removed',
} as const

export type PieceworkReasonCode = (typeof PIECEWORK_REASON)[keyof typeof PIECEWORK_REASON]

/** Un motivo con sus valores (antes → después) cuando los tiene. */
export interface PieceworkReason {
  code: PieceworkReasonCode
  from?: string
  to?: string
}

/** Lo que entró en el cálculo de una fila (las columnas `src_*` de la migration 034). */
export interface PieceworkInputs {
  woEstado: number | null
  hasService: number | null
  hasVendor: number | null
  servicePiecework: string | null
  servicePrice: string | null
  employeePiecework: string | null
  employeeCount: number | null
}

/** Una fila guardada de la expense, con su último cálculo. */
export interface StoredPieceworkRow {
  amount: string
  idDealer: number
  workDate: string
  /** null: la fila nunca se revisó (las de T5); sus insumos no sirven para comparar. */
  checkedAt: Date | string | null
  inputs: PieceworkInputs
}

/** La WO y el servicio hoy. */
export interface CurrentPieceworkRow {
  piecework: string
  idDealer: number
  workDate: string
  inputs: PieceworkInputs
}

const dec = (v: string | null): string | null => (v === null || v === undefined ? null : fromCents(toCents(v)))
const same = (a: string | null, b: string | null): boolean => dec(a) === dec(b)

/**
 * El monto de hoy de la fila: el de la función de Payroll (R1: sin importar si el vendor ponchó), o $0 si la WO está
 * eliminada, ya no tiene el servicio o ya no tiene al vendor.
 */
export function currentAmount(piecework: string, inputs: PieceworkInputs): string {
  if (inputs.woEstado !== 1 || inputs.hasService !== 1 || inputs.hasVendor !== 1) return '0.00'
  return fromCents(toCents(piecework))
}

/**
 * Por qué cambió la fila (R4): se compara lo que entró en el cálculo la última vez con lo de hoy. Si la fila nunca se
 * revisó, o si nada de lo guardado explica un cambio de monto, el motivo es `calc` (nunca se adivina uno más preciso).
 */
export function changeReasons(stored: StoredPieceworkRow, current: CurrentPieceworkRow, newAmount: string): PieceworkReason[] {
  const out: PieceworkReason[] = []
  const amountChanged = toCents(stored.amount) !== toCents(newAmount)
  if (stored.checkedAt !== null) {
    const a = stored.inputs
    const b = current.inputs
    if (a.woEstado === 1 && b.woEstado !== 1) out.push({ code: PIECEWORK_REASON.woDeleted })
    if (a.woEstado !== null && a.woEstado !== 1 && b.woEstado === 1) out.push({ code: PIECEWORK_REASON.woActiveAgain })
    if (a.hasService === 1 && b.hasService !== 1) out.push({ code: PIECEWORK_REASON.serviceRemoved })
    if (a.hasService !== null && a.hasService !== 1 && b.hasService === 1) out.push({ code: PIECEWORK_REASON.serviceAdded })
    if (a.hasVendor === 1 && b.hasVendor !== 1) out.push({ code: PIECEWORK_REASON.vendorRemoved })
    if (a.hasVendor !== null && a.hasVendor !== 1 && b.hasVendor === 1) out.push({ code: PIECEWORK_REASON.vendorAdded })
    // Los insumos se comparan solo si el servicio estaba y sigue (si se fue, ya lo dice service_removed).
    if (a.hasService === 1 && b.hasService === 1) {
      if (!same(a.servicePiecework, b.servicePiecework)) {
        out.push({ code: PIECEWORK_REASON.servicePiecework, from: dec(a.servicePiecework) ?? '-', to: dec(b.servicePiecework) ?? '-' })
      }
      if (!same(a.employeePiecework, b.employeePiecework)) {
        out.push({ code: PIECEWORK_REASON.vendorPiecework, from: dec(a.employeePiecework) ?? '-', to: dec(b.employeePiecework) ?? '-' })
      }
      if (!same(a.servicePrice, b.servicePrice)) {
        out.push({ code: PIECEWORK_REASON.servicePrice, from: dec(a.servicePrice) ?? '-', to: dec(b.servicePrice) ?? '-' })
      }
    }
    if (a.employeeCount !== null && b.employeeCount !== null && a.employeeCount !== b.employeeCount) {
      out.push({ code: PIECEWORK_REASON.employeeCount, from: String(a.employeeCount), to: String(b.employeeCount) })
    }
  }
  if (stored.idDealer !== current.idDealer) out.push({ code: PIECEWORK_REASON.dealer })
  if (stored.workDate !== current.workDate) out.push({ code: PIECEWORK_REASON.date, from: stored.workDate, to: current.workDate })
  if (amountChanged && !out.some((r) => r.code !== PIECEWORK_REASON.dealer && r.code !== PIECEWORK_REASON.date)) {
    out.unshift({ code: PIECEWORK_REASON.calc })
  }
  return out
}

/**
 * `detail` del histórico: los motivos separados por `|`, cada uno `code` o `code:antes>después`. Lo lee la pantalla
 * (`decodeReasons` del front) para armar el texto en el idioma del usuario.
 */
export function encodeReasons(reasons: readonly PieceworkReason[]): string {
  return reasons
    .map((r) => (r.from !== undefined || r.to !== undefined ? `${r.code}:${r.from ?? ''}>${r.to ?? ''}` : r.code))
    .join('|')
    .slice(0, 500)
}

/** Un pay period está vivo si cae en la ventana que el Payroll de la noche mantiene al día (R2, ciclo 2). */
export interface LiveWindow {
  from: string
  to: string
}

export function isLive(period: PayrollPeriod, window: LiveWindow): boolean {
  return period.hasta >= window.from && period.desde <= window.to
}

/** El pay period de la lista que contiene el día, o null. */
export function periodContaining(day: string, periods: readonly PayrollPeriod[]): PayrollPeriod | null {
  return periods.find((p) => day >= p.desde && day <= p.hasta) ?? null
}

/** Qué se hace con una fila en una corrida de la noche. */
export type RowDecision =
  /** El origen está congelado: el Payroll de ese pay period la sigue contando como estaba. */
  | { kind: 'keep' }
  /** D20: la fecha nueva cae fuera de los pay periods de la expense: sale y queda libre. */
  | { kind: 'release' }
  /** La fecha nueva cae en otro pay period de la expense que ya no se recalcula: queda en el origen, en $0. */
  | { kind: 'zero_in_origin' }
  /** Se actualiza con el monto, el dealer y la fecha de hoy. */
  | { kind: 'update' }

/**
 * Plan v9, «WO que cambia de fecha» y R2 de los dos ciclos: la fila sigue siempre al snapshot del pay period donde queda
 * contada. `origin` = el pay period de la fecha guardada; `target` = el de la fecha de hoy de la WO (null si no hay
 * ninguno); `expensePeriods` = los pay periods que terminan en el mes de la expense.
 */
export function decideRow(
  origin: PayrollPeriod | null,
  target: PayrollPeriod | null,
  expensePeriods: readonly PayrollPeriod[],
  window: LiveWindow,
): RowDecision {
  if (!origin || !isLive(origin, window)) return { kind: 'keep' }
  const inExpense = target !== null && expensePeriods.some((p) => p.desde === target.desde)
  if (!inExpense) return { kind: 'release' }
  if (target.desde !== origin.desde && !isLive(target, window)) return { kind: 'zero_in_origin' }
  return { kind: 'update' }
}

/** Una fila de EXP_EXPENSE por dealer: la suma de sus filas de piecework sin liberar. */
export function amountsByExpenseRow(rows: readonly { idExpense: number; amount: string }[]): Map<number, string> {
  const cents = new Map<number, number>()
  for (const r of rows) cents.set(r.idExpense, (cents.get(r.idExpense) ?? 0) + toCents(r.amount))
  return new Map([...cents.entries()].map(([id, c]) => [id, fromCents(c)]))
}
