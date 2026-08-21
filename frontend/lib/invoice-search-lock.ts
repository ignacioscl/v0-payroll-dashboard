export type InvoiceDeletedMode = 'hide' | 'only' | 'all'

export function isInvoiceSearchLock(opts: {
  search: string
  exactMatch: boolean
  employeeWorkedIds?: number[]
}): boolean {
  if ((opts.employeeWorkedIds?.length ?? 0) > 0) return true
  const s = opts.search.trim()
  if (!s) return false
  if (opts.exactMatch) return true
  return s.length >= 3
}
