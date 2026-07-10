export type LookupOption = {
  id: number
  label: string
  sublabel?: string
}

export type InvoiceAdvancedFilterState = {
  departmentIds: number[]
  serviceIds: number[]
  woNumbers: string[]
  roPo: string
  stock: string
  checkDate: Date | undefined
  checkNumber: string
  employeeId: number | null
  employeeLabel: string | null
  overdue: boolean
  showDeleted: boolean
}

export const EMPTY_ADVANCED_FILTERS: InvoiceAdvancedFilterState = {
  departmentIds: [],
  serviceIds: [],
  woNumbers: [],
  roPo: '',
  stock: '',
  checkDate: undefined,
  checkNumber: '',
  employeeId: null,
  employeeLabel: null,
  overdue: false,
  showDeleted: false,
}

export function parseWoInput(raw: string): string[] {
  if (!raw.trim()) return []
  const set = new Set<string>()
  for (const token of raw.split(/[,\s\n]+/)) {
    const digits = token.replace(/[^0-9]/g, '')
    if (digits) set.add(digits)
  }
  return [...set]
}

export function woNumbersToInput(nums: string[]): string {
  return nums.join(', ')
}

export function idsToCsv(ids: number[]): string | undefined {
  return ids.length ? ids.join(',') : undefined
}

export function hasAdvancedFilters(f: InvoiceAdvancedFilterState): boolean {
  return (
    f.departmentIds.length > 0 ||
    f.serviceIds.length > 0 ||
    f.woNumbers.length > 0 ||
    Boolean(f.roPo.trim()) ||
    Boolean(f.stock.trim()) ||
    Boolean(f.checkDate) ||
    Boolean(f.checkNumber.trim()) ||
    f.employeeId != null ||
    f.overdue ||
    f.showDeleted
  )
}
