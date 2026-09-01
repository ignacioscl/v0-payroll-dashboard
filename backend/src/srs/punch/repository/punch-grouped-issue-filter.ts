import { BadRequestException } from '@nestjs/common'

import { isPunchIssueType, PunchIssueType } from '../punch-issue-types'
import { DEFAULT_ERROR_TYPES, errorTypesInList, isDefaultErrorTypes } from './punch-error-types'

/** Tipo de error que filtra cada `issueType` especifico (mirror de TTKEmployeeDao::getWhere). */
const SPECIFIC_ERROR_TYPE = {
  only_error_clockout: 1,
  only_error_break: 2,
  only_error_20h: 3,
} as const satisfies Partial<Record<PunchIssueType, number>>

export type GroupedIssueFilter = {
  estado: number
  /** Predicado de FILAS. Se concatena con AND; nunca entra a un grupo OR. */
  extraSql: string
  /** Expresion de MARCA de error (hasError / errorSummary / ⚠). Siempre segun la lista. */
  markSql: string
}

/**
 * Maps Issues page `selectedType` + lista blanca de tipos → SQL a nivel ponchada.
 *
 * Tabla de verdad (misma en PHP, TTKEmployeeDao::getWhere):
 *
 *   issueType                     | filas                        | marca
 *   ------------------------------|------------------------------|----------------
 *   all / no-error                | (ninguno)                    | V2 IN (lista)
 *   only_error, lista default     | V1 IS NOT NULL  ← sin cambio | V2 IN (lista)
 *   only_error, lista parcial     | V2 IN (lista)                | V2 IN (lista)
 *   tipo n, n incluido            | V2 = n                       | V2 IN (lista)
 *   tipo n, n EXCLUIDO            | 1=0 (vacio duro)             | —
 *
 * La exclusion gana sobre el filtro especifico: nunca se devuelve una fila de un
 * tipo que el usuario saco.
 *
 * La lista se INTERPOLA (ver punch-error-types.ts): no agrega placeholders, asi
 * que las listas de params de los callers no cambian.
 */
export function resolveGroupedIssueFilter(
  issueType?: string,
  errorTypes: readonly number[] = DEFAULT_ERROR_TYPES,
): GroupedIssueFilter {
  const type = (issueType ?? 'all').trim() || 'all'

  if (!isPunchIssueType(type)) {
    throw new BadRequestException(`Invalid issueType: ${type}`)
  }

  const list = errorTypesInList(errorTypes)
  const markSql = `TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (${list})`

  if (type === 'only_deletes') {
    return { estado: 0, extraSql: '', markSql }
  }

  switch (type) {
    case 'only_error_clockout':
    case 'only_error_break':
    case 'only_error_20h': {
      // La exclusion gana sobre el filtro especifico: si el tipo pedido no esta
      // incluido, resultado vacio controlado. Nunca se devuelve una fila de un
      // tipo que el usuario saco.
      const specific = SPECIFIC_ERROR_TYPE[type]
      const extraSql = errorTypes.includes(specific)
        ? ` AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = ${specific}`
        : ' AND 1=0'
      return { estado: 1, extraSql, markSql }
    }
    case 'only_error':
      // Con lista default se queda en V1, exactamente como hoy (ver D-P3-1 del plan):
      // unificar en V2 era inalcanzable porque V1 sobrevive en el camino de escritura
      // de correcciones, en bad_punch, en punchErrorTxt y en TTKEmployeeReportDao.
      return {
        estado: 1,
        extraSql: isDefaultErrorTypes(errorTypes)
          ? ' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL'
          : ` AND ${markSql}`,
        markSql,
      }
    case 'manual_punch':
      return { estado: 1, extraSql: ' AND tew.manual_create = 1', markSql }
    case 'without_salary':
      return { estado: 1, extraSql: ' AND tew.id_payment_type IS NULL', markSql }
    case 'only_fixed':
      return { estado: 1, extraSql: ' AND tew.fixed_at IS NOT NULL', markSql }
    case 'all':
      return { estado: 1, extraSql: '', markSql }
    default:
      // Exhaustividad: si se agrega un PunchIssueType y no se le da rama aca, esto
      // no compila. Antes habia un `default` permisivo que devolvia el listado
      // COMPLETO sin filtrar, con 200 y en silencio.
      return assertNeverIssueType(type)
  }
}

function assertNeverIssueType(type: never): never {
  throw new BadRequestException(`Unhandled issueType: ${String(type)}`)
}
