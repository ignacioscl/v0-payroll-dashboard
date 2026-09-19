import { BadRequestException } from '@nestjs/common'

import { isPunchIssueType, PunchIssueType } from '../punch-issue-types'
import {
  DEFAULT_ERROR_TYPES,
  errorTypesInList,
  fixLedgerInList,
  isDefaultErrorTypes,
  v2TypesInList,
} from './punch-error-types'
import { DELETED_SQL, FAKE_GPS_EXISTS_SQL, MANUAL_ACTIVE_SQL, WITHOUT_SALARY_SQL } from './punch-flag-sql'

/** Tipo de error que filtra cada `issueType` especifico (mirror de TTKEmployeeDao::getWhere). */
const SPECIFIC_ERROR_TYPE = {
  only_error_clockout: 1,
  only_error_break: 2,
  only_error_20h: 3,
} as const satisfies Partial<Record<PunchIssueType, number>>

export type GroupedIssueFilterOpts = {
  issueType?: string
  /** Lista efectiva YA recortada por permiso (T.0.6). Default `[1,2,3]`. */
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
   * el evento (`f.id_dealer`), que es donde el ledger lo congela. En ramas vivas
   * (Manual/Deleted) va adentro de la rama, sobre `tew.id_dealer`.
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
   * true -> `markDetailSql` emite codigos de tipo CORREGIDO en vez del
   * texto de error vigente. El repositorio lo usa para decidir a que campo del DTO va.
   */
  marksCorrections: boolean
  currentErrorMarkSql: string
  fixedCountSql: string
  fixedCountParams: (string | number)[]
}

/** Texto de error VIGENTE de la ponchada, tal como lo muestra la columna hoy. */
const CURRENT_ERROR_TEXT_SQL =
  "NULLIF(JSON_UNQUOTE(JSON_EXTRACT(TTK_PUNCH_WITH_ERROR(tew.id), '$.res')), '')"

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
 * Rama viva (Manual / Deleted): rango semiabierto sobre `tew.punch_in` y los
 * dealers autorizados/seleccionados ADENTRO. El WHERE exterior de only_fixed
 * no puede llevar ese rango (el mix con FIX no lo admite).
 */
function liveColumnBranch(
  opts: GroupedIssueFilterOpts,
  cond: string,
): { sql: string; params: (string | number)[] } {
  const params: (string | number)[] = []
  let sql = `(${cond}`
  if (opts.fechaDesde && opts.fechaHasta) {
    sql += ' AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)'
    params.push(opts.fechaDesde, opts.fechaHasta)
  }
  if (opts.dealerIds?.length) {
    sql += ` AND tew.id_dealer IN (${opts.dealerIds.map(() => '?').join(',')})`
    params.push(...opts.dealerIds)
  }
  sql += ')'
  return { sql, params }
}

function v2MarkSql(errorTypes: readonly number[]): string {
  const list = v2TypesInList(errorTypes)
  return list ? `TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (${list})` : '0'
}

/** OR de predicados pending que aplican: V2 1-3, sin salario (4), Fake GPS (8). */
function pendingFlagSql(errorTypes: readonly number[]): string {
  const parts: string[] = []
  const v2 = v2MarkSql(errorTypes)
  if (v2 !== '0') parts.push(v2)
  if (errorTypes.includes(4)) parts.push(WITHOUT_SALARY_SQL)
  if (errorTypes.includes(8)) parts.push(FAKE_GPS_EXISTS_SQL)
  return parts.length ? `(${parts.join(' OR ')})` : '0'
}

function deadFixedCount(): { sql: string; params: (string | number)[] } {
  return { sql: '1=0', params: [] }
}

/**
 * Maps Issues page `selectedType` + lista efectiva de tipos → SQL a nivel ponchada.
 */
export function resolveGroupedIssueFilter(opts: GroupedIssueFilterOpts = {}): GroupedIssueFilter {
  const errorTypes = opts.errorTypes ?? DEFAULT_ERROR_TYPES
  const type = (opts.issueType ?? 'all').trim() || 'all'

  if (!isPunchIssueType(type)) {
    throw new BadRequestException(`Invalid issueType: ${type}`)
  }

  if (errorTypes.length > 0) {
    errorTypesInList(errorTypes)
  }

  const v2Mark = v2MarkSql(errorTypes)
  const pendingMark = pendingFlagSql(errorTypes)
  const ledgerCsv = fixLedgerInList(errorTypes)
  const fixedCount = ledgerCsv
    ? buildFixPredicate('f7', opts, ledgerCsv)
    : deadFixedCount()

  const pending = (estado: number, extraSql: string, extraParams: (string | number)[] = []): GroupedIssueFilter => ({
    estado,
    extraSql,
    extraParams,
    skipOuterDateRange: false,
    skipOuterDealerPredicate: false,
    skipOuterEmployeeFilter: false,
    markSql: pendingMark,
    markParams: [],
    markDetailSql: `CASE WHEN ${pendingMark} THEN ${CURRENT_ERROR_TEXT_SQL} ELSE NULL END`,
    markDetailParams: [],
    marksCorrections: false,
    currentErrorMarkSql: pendingMark,
    fixedCountSql: fixedCount.sql,
    fixedCountParams: fixedCount.params,
  })

  if (type === 'only_deletes') {
    return pending(0, '')
  }

  switch (type) {
    case 'only_error_clockout':
    case 'only_error_break':
    case 'only_error_20h': {
      const specific = SPECIFIC_ERROR_TYPE[type]
      return pending(
        1,
        errorTypes.includes(specific)
          ? ` AND TTK_PUNCH_WITH_ERROR_V2(tew.id,'') = ${specific}`
          : ' AND 1=0',
      )
    }
    case 'only_error':
      return pending(
        1,
        isDefaultErrorTypes(errorTypes)
          ? ' AND TTK_PUNCH_WITH_ERROR(tew.id) IS NOT NULL'
          : v2Mark === '0'
            ? ' AND 1=0'
            : ` AND ${v2Mark}`,
      )
    case 'only_flagged': {
      if (pendingMark === '0') return pending(1, ' AND 1=0')
      return pending(1, ` AND ${pendingMark}`)
    }
    case 'manual_punch':
      return pending(1, ' AND tew.manual_create = 1')
    case 'without_salary':
      return pending(1, ' AND tew.id_payment_type IS NULL')
    case 'only_fixed': {
      const parts: string[] = []
      const extraParams: (string | number)[] = []

      if (ledgerCsv) {
        const rows = buildFixPredicate('f', opts, ledgerCsv)
        parts.push(`EXISTS (SELECT 1 FROM TTK_PUNCH_ERROR_FIX f WHERE ${rows.sql})`)
        extraParams.push(...rows.params)
      }
      if (errorTypes.includes(5)) {
        const live = liveColumnBranch(opts, MANUAL_ACTIVE_SQL)
        parts.push(live.sql)
        extraParams.push(...live.params)
      }
      if (errorTypes.includes(6)) {
        const live = liveColumnBranch(opts, DELETED_SQL)
        parts.push(live.sql)
        extraParams.push(...live.params)
      }

      const extraSql = parts.length ? ` AND (${parts.join(' OR ')})` : ' AND 1=0'
      const detail = ledgerCsv
        ? buildFixPredicate('f2', opts, ledgerCsv)
        : { sql: '1=0', params: [] as (string | number)[] }

      return {
        estado: opts.includeDeletedFixes ? null : 1,
        extraSql,
        extraParams,
        skipOuterDateRange: true,
        skipOuterDealerPredicate: true,
        skipOuterEmployeeFilter: false,
        markSql: '1',
        markParams: [],
        currentErrorMarkSql: pendingMark,
        fixedCountSql: fixedCount.sql,
        fixedCountParams: fixedCount.params,
        markDetailSql: ledgerCsv
          ? `(SELECT GROUP_CONCAT(DISTINCT f2.error_type ORDER BY f2.error_type SEPARATOR ',')` +
            ` FROM TTK_PUNCH_ERROR_FIX f2 WHERE ${detail.sql})`
          : 'NULL',
        markDetailParams: detail.params,
        marksCorrections: true,
      }
    }
    case 'all':
      return pending(1, '')
    default:
      return assertNeverIssueType(type)
  }
}

function assertNeverIssueType(type: never): never {
  throw new BadRequestException(`Unhandled issueType: ${String(type)}`)
}
