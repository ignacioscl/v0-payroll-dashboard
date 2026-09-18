/** Visible KPI money: round to dollars, totals = sum of what is shown. */

export function dollars(n: number): number {
  return Math.round(n)
}

export function sumShown(...ns: number[]): number {
  return ns.reduce((acc, n) => acc + dollars(n), 0)
}

export function shownPending(point: {
  woInvoicedValue: number
  ttkInvoicedValue: number
  genericInvoicedValue: number
  collectedValue: number
}): number {
  return (
    sumShown(point.woInvoicedValue, point.ttkInvoicedValue, point.genericInvoicedValue) -
    dollars(point.collectedValue)
  )
}

export function fmtDollars(n: number): string {
  return `$${dollars(n).toLocaleString()}`
}
