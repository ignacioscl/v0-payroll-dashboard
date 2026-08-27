export type LookupOption = {
  id: number
  label: string
  sublabel?: string
  thumbnailUuid?: string | null
  logoImg?: string | null
}

export type InvoiceAdvancedFilterState = {
  departmentIds: number[]
  serviceIds: number[]
  woNumbers: string[]
  roPo: string
  stock: string
  checkDate: Date | undefined
  checkNumber: string
  /** Multi author ids (replaces single employeeId). */
  authorIds: number[]
  authorsExclude: boolean
  /** Include statements created by batch/schedule or non-employee system accounts. */
  createdBySystem: boolean
  exactMatch: boolean
  /** @deprecated prefer authorIds — kept for chip migration */
  employeeId: number | null
  employeeLabel: string | null
  overdue: boolean
}

export const EMPTY_ADVANCED_FILTERS: InvoiceAdvancedFilterState = {
  departmentIds: [],
  serviceIds: [],
  woNumbers: [],
  roPo: '',
  stock: '',
  checkDate: undefined,
  checkNumber: '',
  authorIds: [],
  authorsExclude: false,
  createdBySystem: false,
  exactMatch: false,
  employeeId: null,
  employeeLabel: null,
  overdue: false,
}

/** Comma/whitespace-separated WO numbers (letters + digits allowed, e.g. LFT9750). */
export function parseWoInput(raw: string): string[] {
  if (!raw.trim()) return []
  const set = new Set<string>()
  for (const token of raw.split(/[,\s\n]+/)) {
    // Keep alphanumerics; drop quotes/$/# like legacy sanitization without stripping letters.
    const cleaned = token.trim().replace(/['"$#]/g, '')
    if (cleaned) set.add(cleaned)
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
    f.authorIds.length > 0 ||
    f.authorsExclude ||
    f.createdBySystem ||
    f.exactMatch ||
    f.employeeId != null ||
    f.overdue
  )
}
