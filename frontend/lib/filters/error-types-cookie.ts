export const PAYROLL_EXCLUDED_ERROR_TYPES_COOKIE = 'payroll_excluded_error_types'

const MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days

/** Códigos de TTK_PUNCH_WITH_ERROR_V2: 1 sin salida, 2 sin descanso, 3 turno 20h+. */
export const ALL_ERROR_TYPES: readonly number[] = [1, 2, 3]

function parseCookieValue(raw: string): number[] {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    if (!Array.isArray(parsed)) return []
    const values = parsed.filter((n): n is number => n === 1 || n === 2 || n === 3)
    return Array.from(new Set(values)).sort((a, b) => a - b)
  } catch {
    // Cookie malformada => default seguro: nada excluido.
    return []
  }
}

/**
 * Lee los tipos EXCLUIDOS (no los incluidos).
 * `[]` = los tres visibles. `[1,2,3]` = los tres destildados.
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

/** Derivado, nunca persistido: `{1,2,3} − excluidos`. */
export function includedErrorTypesFrom(excluded: readonly number[]): number[] {
  return ALL_ERROR_TYPES.filter((t) => !excluded.includes(t))
}

export function isDefaultErrorTypes(included: readonly number[]): boolean {
  return included.length === 3
}

/**
 * Valor para el wire. `undefined` cuando no hay que mandar el parámetro:
 * lista completa (compatibilidad) o lista vacía (el front no pide filas).
 */
export function errorTypesParam(included?: readonly number[]): string | undefined {
  if (!included) return undefined
  if (included.length === 0 || included.length === 3) return undefined
  return included.join(',')
}

/** Clave de cache: distingue "todo incluido" de "nada incluido". */
export function errorTypesQueryKey(included: readonly number[]): string {
  return included.length === 0 ? 'none' : included.join(',')
}
