export const PAYROLL_EXCLUDED_ERROR_TYPES_COOKIE = 'payroll_excluded_error_types'

const MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days

/** Códigos 1..8. Cookie vieja con tokens fuera de rango se tira, no 400. */
export const ALL_FLAG_TYPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8]

/** @deprecated usar ALL_FLAG_TYPES — se conserva para callers que aún importan el nombre viejo. */
export const ALL_ERROR_TYPES: readonly number[] = ALL_FLAG_TYPES

function isFlagCode(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 8
}

function parseCookieValue(raw: string): number[] {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(parsed)) return []
    const values = parsed.filter(isFlagCode)
    return Array.from(new Set(values)).sort((a, b) => a - b)
  } catch {
    return []
  }
}

/**
 * Lee los tipos EXCLUIDOS (no los incluidos).
 * `[]` = nada excluido (los 8 visibles, o los que el permiso deje).
 */
export function readExcludedErrorTypesCookie(): number[] {
  if (typeof document === 'undefined') return []

  const prefix = `${PAYROLL_EXCLUDED_ERROR_TYPES_COOKIE}=`
  const entry = document.cookie.split('; ').find((row) => row.startsWith(prefix))
  if (!entry) return []

  return parseCookieValue(entry.slice(prefix.length))
}

export function writeExcludedErrorTypesCookie(types: number[]): void {
  if (typeof document === 'undefined') return

  if (types.length === 0) {
    document.cookie = `${PAYROLL_EXCLUDED_ERROR_TYPES_COOKIE}=; path=/; max-age=0; SameSite=Lax`
    return
  }

  const value = encodeURIComponent(JSON.stringify(types))
  document.cookie = `${PAYROLL_EXCLUDED_ERROR_TYPES_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`
}

/** Derivado, nunca persistido: `{1..8} − excluidos`. Cookie vieja `[1]` no toca 4..8. */
export function includedErrorTypesFrom(
  excluded: readonly number[],
  allowed: readonly number[] = ALL_FLAG_TYPES,
): number[] {
  return allowed.filter((t) => !excluded.includes(t))
}

export function isDefaultErrorTypes(
  included: readonly number[],
  allowed: readonly number[] = ALL_FLAG_TYPES,
): boolean {
  if (included.length !== allowed.length) return false
  const set = new Set(included)
  return allowed.every((c) => set.has(c))
}

/**
 * Valor para el wire. El FE nuevo NUNCA omite el param si hay al menos un tipo
 * incluido: omitir sigue significando legacy {1,2,3}.
 * Lista vacía ⇒ undefined (el front no pide filas; un CSV vacío sería 400).
 */
export function errorTypesParam(included?: readonly number[]): string | undefined {
  if (!included) return undefined
  if (included.length === 0) return undefined
  return included.join(',')
}

/** Clave de cache: distingue "todo incluido" de "nada incluido". */
export function errorTypesQueryKey(included: readonly number[]): string {
  return included.length === 0 ? 'none' : included.join(',')
}
