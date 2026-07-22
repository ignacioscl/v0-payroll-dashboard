/** Parse comma-separated positive integers (department/service ids). */
export function parseCsvPositiveInts(raw?: string): number[] {
  if (!raw?.trim()) return []
  const set = new Set<number>()
  for (const part of raw.split(',')) {
    const n = Math.trunc(Number(part.trim()))
    if (Number.isFinite(n) && n > 0) set.add(n)
  }
  return [...set]
}

/** Comma/whitespace-separated WO numbers (letters + digits, e.g. LFT9750). */
export function parseWoNumbers(raw?: string): string[] {
  if (!raw?.trim()) return []
  const set = new Set<string>()
  for (const token of raw.split(/[,\s\n]+/)) {
    const cleaned = token.trim().replace(/['"$#]/g, '')
    if (cleaned) set.add(cleaned)
  }
  return [...set]
}

export function parseOptionalTrimmed(raw?: string): string | undefined {
  const v = raw?.trim()
  return v || undefined
}

export function parseFlag01(raw?: unknown): boolean {
  if (raw === true || raw === 'true' || raw === '1' || raw === 1) return true
  return false
}

/** Safe inline IN list for whitelisted positive integers. */
export function sqlInInts(ids: number[]): string {
  return ids.join(',')
}
