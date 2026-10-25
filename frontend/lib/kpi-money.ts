/** Visible KPI money: round to cents, totals = sum of what is shown (summed in whole cents). */

function toCents(n: number): number {
  return Math.round(n * 100)
}

export function dollars(n: number): number {
  return toCents(n) / 100
}

export function sumShown(...ns: number[]): number {
  return ns.reduce((acc, n) => acc + toCents(n), 0) / 100
}

/**
 * Invoiced − collected with the numbers on screen. Both sides are rounded the same way, type by
 * type (WO, TTK, Generic), to the cent. No clamp to 0: by type the collected money never exceeds
 * the invoiced money, so a negative result would be a data problem to look at, not to hide.
 */
export function shownPending(point: {
  woInvoicedValue: number
  ttkInvoicedValue: number
  genericInvoicedValue: number
  woCollectedValue: number
  ttkCollectedValue: number
  genericCollectedValue: number
}): number {
  return (
    toCents(sumShown(point.woInvoicedValue, point.ttkInvoicedValue, point.genericInvoicedValue)) -
    toCents(sumShown(point.woCollectedValue, point.ttkCollectedValue, point.genericCollectedValue))
  ) / 100
}

/** Difference of two shown amounts, exact to the cent. */
export function diffShown(a: number, b: number): number {
  return (toCents(a) - toCents(b)) / 100
}

const MONEY_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Full amount with cents: $115,637.24. */
export function fmtMoney(n: number): string {
  return MONEY_FORMAT.format(dollars(n))
}

/** Chart axes: abbreviated over 1000 ($12.3k); below, the full amount with cents ($850.40). */
export function fmtMoneyAxis(n: number): string {
  return Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmtMoney(n)
}
