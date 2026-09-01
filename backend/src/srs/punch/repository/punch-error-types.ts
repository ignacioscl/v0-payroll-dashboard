import { BadRequestException } from '@nestjs/common'

/**
 * Lista blanca de tipos de error de ponchada.
 *
 * `TTK_PUNCH_WITH_ERROR_V2` clasifica cada ponchada en UN código, con ramas
 * excluyentes (IF/ELSEIF/ELSE): 1 = falta clock out, 2 = falta break,
 * 3 = turno de 20h+, 0 = sin error, -1 = la funcion fallo.
 *
 * Por eso la lista es un `IN` simple: no hay ponchada con dos tipos.
 */
export const DEFAULT_ERROR_TYPES: readonly number[] = [1, 2, 3]

export type ErrorTypesFilter = {
  /** false = el request no trajo el parametro (compatibilidad hacia atras). */
  provided: boolean
  /** Enteros de {1,2,3}, sin duplicados, ordenados ascendente. */
  values: readonly number[]
}

export const DEFAULT_ERROR_TYPES_FILTER: ErrorTypesFilter = {
  provided: false,
  values: DEFAULT_ERROR_TYPES,
}

export function isDefaultErrorTypes(values: readonly number[]): boolean {
  return values.length === 3 && values[0] === 1 && values[1] === 2 && values[2] === 3
}

/**
 * Valida PRIMERO y canonicaliza despues. Nunca deduplica: `1,1` es entrada
 * invalida, no entrada a normalizar.
 *
 * Ausente/undefined => default. Cualquier otra cosa que no sea un string
 * escalar con tokens exactos `1|2|3` sin repetir => 400.
 */
export function parseErrorTypes(raw: unknown): ErrorTypesFilter {
  if (raw === undefined || raw === null) {
    return DEFAULT_ERROR_TYPES_FILTER
  }

  // `?errorTypes[]=1` llega como array; `(string) []` daria "Array" en vez de fallar.
  if (typeof raw !== 'string') {
    throw new BadRequestException('errorTypes must be a comma-separated string of 1, 2 and/or 3.')
  }

  const trimmed = raw.trim()
  if (trimmed === '') {
    // Presente y vacio es distinto de ausente: la UI nunca lo manda.
    throw new BadRequestException('errorTypes cannot be empty.')
  }

  const seen = new Set<number>()
  const values: number[] = []
  for (const token of trimmed.split(',')) {
    if (token !== '1' && token !== '2' && token !== '3') {
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
 * Fragmento SQL de la lista, INTERPOLADO (no bindeado): son como mucho tres
 * enteros de un dominio cerrado ya validado, asi que no agrega placeholders y
 * ninguna lista de params se reordena.
 *
 * Assertea igual antes de interpolar: no confia en que el caller haya validado.
 * `IN ()` es error de sintaxis 1064 y tiraria 500 toda la vista.
 */
export function errorTypesInList(values: readonly number[]): string {
  if (values.length === 0) {
    throw new BadRequestException('errorTypes cannot be empty.')
  }
  for (const value of values) {
    if (value !== 1 && value !== 2 && value !== 3) {
      throw new BadRequestException(`Invalid errorTypes value: ${String(value)}`)
    }
  }
  return values.join(',')
}
