import { BadRequestException } from '@nestjs/common'

import { isPunchIssueType, PunchIssueType } from '../punch-issue-types'
import { DEFAULT_ERROR_TYPES, errorTypesInList, isDefaultErrorTypes } from './punch-error-types'

/** Tipo de error que filtra cada `issueType` especifico (mirror de TTKEmployeeDao::getWhere). */
const SPECIFIC_ERROR_TYPE = {
  only_error_clockout: 1,
  only_error_break: 2,
  only_error_20h: 3,
} as const satisfies Partial<Record<PunchIssueType, number>>

export type GroupedIssueFilterOpts = {
  issueType?: string
  /** Lista blanca, ya validada aguas arriba. Default `[1,2,3]`. */
  errorTypes?: readonly number[]
  /** 'YYYY-MM-DD'. Obligatorias en modo Corrected: el rango baja al ledger. */
  fechaDesde?: string
  fechaHasta?: string
  /**
   * Sale de la policy (`resolveDeletedVisibility`). El caller normaliza el default
   * a false: el helper no adivina permisos.
   */
  includeDeletedFixes?: boolean
  /** Grouped, su detalle y su export. Frontera superior de la foto. */
  snapshotAt?: string
  /**
   * Scope de dealers YA autorizado. En modo Corrected el dealer se resuelve sobre
   * el evento (`f.id_dealer`), que es donde el ledger lo congela.
   */
  dealerIds?: readonly number[]
}

export type GroupedIssueFilter = {
  /** `null` -> se omite `AND tew.estado = ?` (corregidas sobre ponchadas borradas). */
  estado: number | null
  /** Predicado de FILAS. Se concatena con AND; nunca entra a un grupo OR. */
  extraSql: string
  /** En el MISMO orden en que aparecen los `?` de `extraSql`. */
  extraParams: (string | number)[]
  /** true -> el caller omite el rango exterior sobre `tew.punch_in` Y sus dos binds. */
  skipOuterDateRange: boolean
  /** true -> el caller omite `ttk.and` y `ttk.params`. NUNCA `ttk.join`. */
  skipOuterDealerPredicate: boolean
  /** Siempre false hoy; existe por simetria con los otros dos (ver F-ext del plan). */
  skipOuterEmployeeFilter: boolean
  /** Expresion booleana de FILA para la columna del grupo. */
  markSql: string
  markParams: (string | number)[]
  /** Expresion de FILA que alimenta el detalle de esa columna (via GROUP_CONCAT). */
  markDetailSql: string
  markDetailParams: (string | number)[]
  /**
   * true -> `markDetailSql` emite codigos de tipo CORREGIDO (`1`,`2`,`3`) en vez del
   * texto de error vigente. El repositorio lo usa para decidir a que campo del DTO va.
   */
  marksCorrections: boolean
}

/** Texto de error VIGENTE de la ponchada, tal como lo muestra la columna hoy. */
const CURRENT_ERROR_TEXT_SQL =
  "NULLIF(JSON_UNQUOTE(JSON_EXTRACT(TTK_PUNCH_WITH_ERROR(tew.id), '$.res')), '')"

/**
 * Predicado canonico de "esta ponchada tiene una correccion registrada".
 *
 * Es UNO SOLO y se reusa en el `EXISTS` de filas y en el agregado de la columna:
 * lo que se selecciona y lo que se muestra no pueden responder universos distintos.
 *
 * `errorTypesInList()` INTERPOLA a proposito (punch-error-types.ts): un `?` aca
 * correria todos los binds posteriores, porque `issue.estado` es `params[0]` en
 * punch-list-sql.ts.
 *
 * El rango, el dealer y el snapshot van ADENTRO, sobre las dimensiones que el ledger
 * congela al momento de corregir. Es lo que PHP ya hace en getFixScopeWhere().
 * El empleado NO: la ponchada no se puede reasignar, asi que `f.id_employee` y
 * `tew.id_author` son siempre el mismo (F-ext del plan).
 *
 * `f.id_dealer_provider = tew.id_dealer_provider` no es redundante con la FK (que
 * apunta a CONTRATISTA) y es lo que habilita `idx_provider_punchdate`.
 */
function buildFixPredicate(
  alias: string,
  opts: GroupedIssueFilterOpts,
  types: string,
): { sql: string; params: (string | number)[] } {
  const params: (string | number)[] = []
  let sql =
    `${alias}.id_ttk_employee_work = tew.id` +
    ` AND ${alias}.id_dealer_provider = tew.id_dealer_provider` +
    ` AND ${alias}.error_type IN (${types})`

  if (opts.fechaDesde && opts.fechaHasta) {
    sql += ` AND ${alias}.punch_date >= ? AND ${alias}.punch_date <= ?`
    params.push(opts.fechaDesde, opts.fechaHasta)
  }
  if (opts.dealerIds?.length) {
    sql += ` AND ${alias}.id_dealer IN (${opts.dealerIds.map(() => '?').join(',')})`
    params.push(...opts.dealerIds)
  }
  if (opts.snapshotAt) {
    sql += ` AND ${alias}.fixed_at <= ?`
    params.push(opts.snapshotAt)
  }

  return { sql, params }
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
 *   only_fixed                    | EXISTS ledger (predicado ↑)  | tipos CORREGIDOS
 *
 * La exclusion gana sobre el filtro especifico: nunca se devuelve una fila de un
 * tipo que el usuario saco.
 *
 * En `only_fixed` la columna del grupo cambia de FUENTE, no solo de etiqueta
 * (decision D-B): estando en corregidos la pregunta no es "¿tiene errores?" sino
 * "¿que se le corrigio?". Conservar V2 ahi hacia que un grupo pudiera decir
 * "pendiente" sobre una ponchada BORRADA.
 *
 * La lista se INTERPOLA (ver punch-error-types.ts): no agrega placeholders, asi
 * que las listas de params de los callers no cambian por ella.
 */
export function resolveGroupedIssueFilter(opts: GroupedIssueFilterOpts = {}): GroupedIssueFilter {
  const errorTypes = opts.errorTypes ?? DEFAULT_ERROR_TYPES
  const type = (opts.issueType ?? 'all').trim() || 'all'

  if (!isPunchIssueType(type)) {
    throw new BadRequestException(`Invalid issueType: ${type}`)
  }

  const list = errorTypesInList(errorTypes)
  const markSql = `TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (${list})`

  /** Forma por defecto: pendientes. Solo `only_fixed` se aparta. */
  const pending = (estado: number, extraSql: string): GroupedIssueFilter => ({
    estado,
    extraSql,
    extraParams: [],
    skipOuterDateRange: false,
    skipOuterDealerPredicate: false,
    skipOuterEmployeeFilter: false,
    markSql,
    markParams: [],
    markDetailSql: `CASE WHEN ${markSql} THEN ${CURRENT_ERROR_TEXT_SQL} ELSE NULL END`,
    markDetailParams: [],
    marksCorrections: false,
  })

  if (type === 'only_deletes') {
    return pending(0, '')
  }

  switch (type) {
    case 'only_error_clockout':
    case 'only_error_break':
    case 'only_error_20h': {
      // La exclusion gana sobre el filtro especifico: si el tipo pedido no esta
      // incluido, resultado vacio controlado. Nunca se devuelve una fila de un
      // tipo que el usuario saco.
      const specific = SPECIFIC_ERROR_TYPE[type]
      return pending(
        1,
        errorTypes.includes(specific)
          ? ` AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = ${specific}`
          : ' AND 1=0',
      )
    }
    case 'only_error':
      // Con lista default se queda en V1, exactamente como hoy (ver D-P3-1 del plan):
      // unificar en V2 era inalcanzable porque V1 sobrevive en el camino de escritura
      // de correcciones, en bad_punch, en punchErrorTxt y en TTKEmployeeReportDao.
      return pending(
        1,
        isDefaultErrorTypes(errorTypes)
          ? ' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL'
          : ` AND ${markSql}`,
      )
    case 'manual_punch':
      return pending(1, ' AND tew.manual_create = 1')
    case 'without_salary':
      return pending(1, ' AND tew.id_payment_type IS NULL')
    case 'only_fixed': {
      // Corregido = tiene registro en el ledger. `tew.fixed_at IS NOT NULL` era una
      // marca por ponchada que solo se setea cuando la ponchada queda sin NINGUN
      // error: se comia las correcciones parciales (BUG-01 (a)).
      const rows = buildFixPredicate('f', opts, list)
      // estado null -> la ponchada corregida y despues eliminada sigue en la lista
      // (F3). El recorte por permiso lo decide opts.includeDeletedFixes.
      const detail = buildFixPredicate('f2', opts, list)

      return {
        estado: opts.includeDeletedFixes ? null : 1,
        extraSql: ` AND EXISTS (SELECT 1 FROM TTK_PUNCH_ERROR_FIX f WHERE ${rows.sql})`,
        extraParams: rows.params,
        skipOuterDateRange: true,
        skipOuterDealerPredicate: true,
        skipOuterEmployeeFilter: false,
        // Toda fila que llego hasta aca ya paso el EXISTS: preguntar de nuevo seria
        // repetir el mismo predicado y sus binds sin cambiar una sola respuesta.
        markSql: '1',
        markParams: [],
        // Los tipos que se CORRIGIERON de esa ponchada, no el error que tiene hoy.
        markDetailSql:
          `(SELECT GROUP_CONCAT(DISTINCT f2.error_type ORDER BY f2.error_type SEPARATOR ',')` +
          ` FROM TTK_PUNCH_ERROR_FIX f2 WHERE ${detail.sql})`,
        markDetailParams: detail.params,
        marksCorrections: true,
      }
    }
    case 'all':
      return pending(1, '')
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
