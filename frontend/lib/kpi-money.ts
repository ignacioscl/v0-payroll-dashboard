/** Visible KPI money: round to dollars, totals = sum of what is shown. */

export function dollars(n: number): number {
  return Math.round(n)
}

export function sumShown(...ns: number[]): number {
  return ns.reduce((acc, n) => acc + dollars(n), 0)
}

/**
 * Invoiced − collected with the numbers on screen. Both sides are rounded the same way, type by
 * type (WO, TTK, Generic): rounding the collected money once over its total gave −$1 with
 * everything collected. No clamp to 0: by type the collected money never exceeds the invoiced
 * money, so a negative result would be a data problem to look at, not to hide.
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
    sumShown(point.woInvoicedValue, point.ttkInvoicedValue, point.genericInvoicedValue) -
    sumShown(point.woCollectedValue, point.ttkCollectedValue, point.genericCollectedValue)
  )
}

export function fmtDollars(n: number): string {
  return `$${dollars(n).toLocaleString()}`
}
