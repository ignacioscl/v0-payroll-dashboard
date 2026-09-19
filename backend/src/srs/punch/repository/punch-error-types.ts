import { BadRequestException } from '@nestjs/common'

/**
 * Lista blanca de tipos de flag de ponchada (1..8).
 *
 * V2 sigue siendo 1/2/3 excluyentes. 4..8 conviven y NO salen de
 * `TTK_PUNCH_WITH_ERROR_V2`. Ausente el param ⇒ legacy `{1,2,3}` y 4..8 no
 * aplican (deploy backend-first).
 */
export const DEFAULT_ERROR_TYPES: readonly number[] = [1, 2, 3]
export const ALL_FLAG_TYPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8]
export const V2_ERROR_TYPES: readonly number[] = [1, 2, 3]
export const FIX_LEDGER_TYPES: readonly number[] = [1, 2, 3, 4, 7]
export const PAYMENT_FLAG_TYPES: readonly number[] = [4, 7]

/** Regex de los DTOs: tokens 1..8, 1 a 8 valores, sin validar duplicados (eso es parse). */
export const ERROR_TYPES_CSV_PATTERN = /^[1-8](,[1-8]){0,7}$/

export type ErrorTypesFilter = {
  /** false = el request no trajo el parametro (compatibilidad hacia atras). */
  provided: boolean
  /** Enteros de {1..8}, sin duplicados, ordenados ascendente. */
  values: readonly number[]
}

export const DEFAULT_ERROR_TYPES_FILTER: ErrorTypesFilter = {
  provided: false,
  values: DEFAULT_ERROR_TYPES,
}

export function v2Subset(values: readonly number[]): number[] {
  return values.filter((v) => v === 1 || v === 2 || v === 3)
}

export function fixLedgerSubset(values: readonly number[]): number[] {
  return values.filter((v) => v === 1 || v === 2 || v === 3 || v === 4 || v === 7)
}

/**
 * Camino V1 / marca V2: el subconjunto 1-3 es exactamente `{1,2,3}`.
 * Tipos 4..8 no lo invalidan (D-P3-1 se conserva para 1-3).
 */
export function isV2DefaultErrorTypes(values: readonly number[]): boolean {
  const v2 = v2Subset(values)
  return v2.length === 3 && v2[0] === 1 && v2[1] === 2 && v2[2] === 3
}

/** Alias histórico: el camino V1 mira el subconjunto 1-3, no la longitud total. */
export function isDefaultErrorTypes(values: readonly number[]): boolean {
  return isV2DefaultErrorTypes(values)
}

export function isFlagType(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 8
}

export type ErrorTypesPermissionOpts = {
  canViewPaymentType: boolean
  includeDeletedFixes: boolean
  canViewFakeGps: boolean
  isExternal?: boolean
}

/**
 * Recorte por permiso, ANTES de filtrar / agregar / exportar.
 *
 * 6 sale sin Delete. 4 y 7 salen sin permiso de ver tipo de pago. 8 sale sin
 * Time Tracking > View Fake GPS. Externos: sólo 1-3 (sin fila de tipos).
 */
export function effectiveErrorTypes(
  values: readonly number[],
  opts: ErrorTypesPermissionOpts,
): number[] {
  return values.filter((code) => {
    if (opts.isExternal && (code < 1 || code > 3)) return false
    if (code === 6 && !opts.includeDeletedFixes) return false
    if ((code === 4 || code === 7) && !opts.canViewPaymentType) return false
    if (code === 8 && !opts.canViewFakeGps) return false
    return isFlagType(code)
  })
}

/**
 * Valida PRIMERO y canonicaliza despues. Nunca deduplica: `1,1` es entrada
 * invalida, no entrada a normalizar.
 *
 * Ausente/undefined => default legacy {1,2,3}. Cualquier otra cosa que no sea
 * un string escalar con tokens exactos `1..8` sin repetir => 400.
 */
export function parseErrorTypes(raw: unknown): ErrorTypesFilter {
  if (raw === undefined || raw === null) {
    return DEFAULT_ERROR_TYPES_FILTER
  }

  if (typeof raw !== 'string') {
    throw new BadRequestException(
      'errorTypes must be a comma-separated string of 1, 2, 3, 4, 5, 6, 7 and/or 8.',
    )
  }

  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new BadRequestException('errorTypes cannot be empty.')
  }

  const seen = new Set<number>()
  const values: number[] = []
  for (const token of trimmed.split(',')) {
    if (!/^[1-8]$/.test(token)) {
      throw new BadRequestException(`Invalid errorTypes value: ${token}`)
    }
    const value = Number(token)
    if (seen.has(value)) {
      throw new BadRequestException(`Duplicated errorTypes value: ${token}`)
    }
    seen.add(value)
    values.push(value)
  }

  values.sort((a, b) => a - b)
  return { provided: true, values }
}

/**
 * Fragmento SQL de la lista, INTERPOLADO (no bindeado): son como mucho ocho
 * enteros de un dominio cerrado ya validado.
 *
 * Assertea igual antes de interpolar. `IN ()` es error de sintaxis 1064.
 */
export function errorTypesInList(values: readonly number[]): string {
  if (values.length === 0) {
    throw new BadRequestException('errorTypes cannot be empty.')
  }
  for (const value of values) {
    if (!isFlagType(value)) {
      throw new BadRequestException(`Invalid errorTypes value: ${String(value)}`)
    }
  }
  return values.join(',')
}

/** `IN` de V2: sólo 1-3. `null` si no queda ninguno (el caller pone `1=0`). */
export function v2TypesInList(values: readonly number[]): string | null {
  const v2 = v2Subset(values)
  return v2.length === 0 ? null : v2.join(',')
}

/** `IN` del ledger FIX: 1,2,3,4,7. `null` si no queda ninguno. */
export function fixLedgerInList(values: readonly number[]): string | null {
  const types = fixLedgerSubset(values)
  return types.length === 0 ? null : types.join(',')
}

export const PENDING_RANKING_TYPES: readonly number[] = [1, 2, 3, 4, 8]
export const CORRECTED_RANKING_TYPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7]
export const PENDING_ERROR_TOTAL_TYPES: readonly number[] = [1, 2, 3, 4]

export function typesForMode(
  values: readonly number[],
  mode: 'pending' | 'corrected',
): number[] {
  const enabled = mode === 'pending' ? PENDING_RANKING_TYPES : CORRECTED_RANKING_TYPES
  return values.filter((code) => enabled.includes(code))
}

/**
 * ¿La lista efectiva es todo lo que el permiso deja ver? Report Info dice "All".
 */
export function isCompleteEffectiveList(
  effective: readonly number[],
  opts: ErrorTypesPermissionOpts,
): boolean {
  const allowed = effectiveErrorTypes(ALL_FLAG_TYPES, opts)
  if (effective.length !== allowed.length) return false
  const set = new Set(effective)
  return allowed.every((code) => set.has(code))
}
