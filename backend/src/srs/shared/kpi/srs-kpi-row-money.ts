/**
 * Money of each row of the invoice list, from the rowMoney builders (billedRowMoneySql).
 * T2/T4 of plans/plan-invoices-totales-listado/PLAN.md:
 *
 * - a payment row (whole invoice or own payment of a line) is its lines, rounded once;
 * - the balance row is what the invoice still owes: its total minus its payment rows. The paid
 *   amount is fixed by the check; the cent of rounding goes to what is still owed, so the rows of
 *   an invoice add up to its total exactly (rule 14) — KNN195: 475.00 − 296.88 = 178.12.
 *
 * Only invoices with at least one unpaid line have a balance (the same ones the Deuda total card
 * counts). Everything is in integer cents; the DECIMAL sums from the base are added exactly and
 * rounded half away from zero, like ROUND(x, 2) of MySQL.
 */

import { billedRowKey } from './srs-kpi-billed-lines'

/** Money of one row, in integer cents. Discount of the row = subtotal − total. */
export interface RowMoneyCents {
  subtotal: number
  total: number
}

export const ZERO_ROW_MONEY: RowMoneyCents = { subtotal: 0, total: 0 }

/**
 * Up to this many invoices the rowMoney builders read only them (statementIdIn, which also crops
 * the WO window, T3); above it, every invoice of the dealers: with «pageSize = -1» or the All tab
 * with no dates the IN would carry ~250.000 ids (T5).
 */
export const ROW_MONEY_ID_LIMIT = 20000

export function rowMoneyIdsOrAll(ids: number[]): number[] | undefined {
  return ids.length <= ROW_MONEY_ID_LIMIT ? ids : undefined
}

const DIGITS = 30
const ONE = BigInt(`1${'0'.repeat(DIGITS)}`)
const CENT = ONE / BigInt(100)
const ZERO = BigInt(0)
const TWO = BigInt(2)

/** A DECIMAL as it comes from the driver (string) → fixed point with 30 decimals. */
function toFixedPoint(value: unknown): bigint {
  if (value === null || value === undefined || value === '') return ZERO
  let s = typeof value === 'number' ? value.toFixed(12) : String(value).trim()
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  const [intPart, fracPart = ''] = s.split('.')
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new Error(`invalid decimal: ${String(value)}`)
  }
  const frac = `${fracPart}${'0'.repeat(DIGITS)}`.slice(0, DIGITS)
  const n = BigInt(intPart || '0') * ONE + BigInt(frac)
  return negative ? -n : n
}

/** ROUND(x, 2) of MySQL on a DECIMAL (half away from zero), as integer cents. */
function fixedPointToCents(x: bigint): number {
  const negative = x < ZERO
  const abs = negative ? -x : x
  const whole = abs / CENT
  const rest = abs % CENT
  const cents = rest * TWO >= CENT ? whole + BigInt(1) : whole
  return Number(negative ? -cents : cents)
}

/** A money value from the base (DECIMAL string) → integer cents, rounded like ROUND(x, 2). */
export function moneyToCents(value: unknown): number {
  return fixedPointToCents(toFixedPoint(value))
}

export function centsToMoney(cents: number): number {
  return cents / 100
}

type RawRow = { kind: number; subtotal: bigint; total: bigint }

/**
 * Builder rows (stmtId, rowKind, rowIdBilling, rowNroBilled, rowSubtotal, rowTotal) → money of
 * each row of the list, by billedRowKey. A row of the list with no key here has no lines: $0.
 */
export function rowMoneyByKey(builderRows: any[]): Map<string, RowMoneyCents> {
  const byKey = new Map<string, RawRow & { stmtId: number }>()
  for (const r of builderRows) {
    const stmtId = Number(r.stmtId)
    const kind = Number(r.rowKind)
    const key = billedRowKey(
      stmtId,
      kind,
      r.rowIdBilling == null ? null : Number(r.rowIdBilling),
      r.rowNroBilled == null ? null : Number(r.rowNroBilled),
    )
    const prev = byKey.get(key)
    const subtotal = toFixedPoint(r.rowSubtotal)
    const total = toFixedPoint(r.rowTotal)
    if (prev) {
      prev.subtotal += subtotal
      prev.total += total
    } else {
      byKey.set(key, { stmtId, kind, subtotal, total })
    }
  }

  // Per invoice: its exact total and subtotal, and what its payment rows already took (rounded).
  const byStmt = new Map<
    number,
    { subtotal: bigint; total: bigint; paidSubtotal: number; paidTotal: number }
  >()
  for (const row of byKey.values()) {
    let s = byStmt.get(row.stmtId)
    if (!s) {
      s = { subtotal: ZERO, total: ZERO, paidSubtotal: 0, paidTotal: 0 }
      byStmt.set(row.stmtId, s)
    }
    s.subtotal += row.subtotal
    s.total += row.total
    if (row.kind !== 1) {
      s.paidSubtotal += fixedPointToCents(row.subtotal)
      s.paidTotal += fixedPointToCents(row.total)
    }
  }

  const out = new Map<string, RowMoneyCents>()
  for (const [key, row] of byKey) {
    if (row.kind !== 1) {
      out.set(key, {
        subtotal: fixedPointToCents(row.subtotal),
        total: fixedPointToCents(row.total),
      })
      continue
    }
    const s = byStmt.get(row.stmtId)!
    out.set(key, {
      subtotal: fixedPointToCents(s.subtotal) - s.paidSubtotal,
      total: fixedPointToCents(s.total) - s.paidTotal,
    })
  }
  return out
}

/** What an invoice still owes (its balance row), in cents; 0 when it has no unpaid line. */
export function balanceCents(money: Map<string, RowMoneyCents>, stmtId: number): number {
  return money.get(billedRowKey(stmtId, 1, null, null))?.total ?? 0
}
