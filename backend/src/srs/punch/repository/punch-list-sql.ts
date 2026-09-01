import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'
import { resolveGroupedIssueFilter } from './punch-grouped-issue-filter'
import { PunchListLiveStatus, PunchListSort } from '../dto/punch-list.dto'

export type PunchListSqlOpts = {
  minHours?: number
  maxHours?: number
  idPaymentType?: number
  search?: string
  idEmployee?: number
  issueType?: string
  todayLiveStatus?: PunchListLiveStatus
  includeAmounts?: boolean
  includePaymentTypeName?: boolean
  /** Lista blanca de tipos de error. Default `[1,2,3]` = comportamiento de siempre. */
  errorTypes?: readonly number[]
  /**
   * `interno && lista parcial`. Gobierna el campo `errorType` de la fila: con
   * lista default la respuesta queda byte-idéntica a la de hoy, y a los externos
   * nunca se les serializa la clasificación de error.
   */
  includeErrorType?: boolean
}

export type PunchListPageSqlOpts = PunchListSqlOpts & {
  pageSize: number
  sort?: PunchListSort
  dir?: 'asc' | 'desc'
  afterValue?: string
  afterId?: number
}

const SORT_COLUMNS: Record<PunchListSort, string> = {
  punchIn: 'tew.punch_in',
  employee: 'u.nombre',
}

/**
 * El instante real de la ponchada, en segundos.
 *
 * `punch_in` & co. son TIMESTAMP: MariaDB los guarda en UTC y los devuelve convertidos a la zona
 * de la sesión. `UNIX_TIMESTAMP` saltea esa conversión y entrega el UTC guardado.
 */
export function utcEpochExpr(column: string): string {
  return `CASE WHEN ${column} IS NULL OR ${column} <= '1970-01-01'
               THEN NULL
               ELSE UNIX_TIMESTAMP(${column})
          END`
}

/** Mirror de TTKEmployeeDao::getTodayLiveStatusCondition() (línea 156). Sin params. */
export function liveStatusSql(status?: PunchListLiveStatus): string {
  const notClockedOut = "(tew.punch_out IS NULL OR tew.punch_out <= '1970-01-01')"
  const onBreak =
    "tew.break_start IS NOT NULL AND tew.break_start > '1970-01-01' " +
    "AND (tew.break_end IS NULL OR tew.break_end <= '1970-01-01')"

  switch (status) {
    case 'on_lunch':
      return ` AND ${notClockedOut} AND ${onBreak}`
    case 'working':
      return (
        ` AND ${notClockedOut} AND NOT (${onBreak})` +
        " AND tew.punch_in IS NOT NULL AND tew.punch_in > '1970-01-01'"
      )
    case 'out':
      return " AND tew.punch_out IS NOT NULL AND tew.punch_out > '1970-01-01'"
    default:
      return ''
  }
}

function dealerNameByProviderExpr(idDealerProvider: number): string {
  const providerId = Number.isFinite(idDealerProvider) ? Math.trunc(idDealerProvider) : 0
  return `GET_DEALER_NAME_BY_PROVIDER(${providerId}, c.id)`
}

export function buildPunchListSelectFields(
  idDealerProvider: number,
  opts: Pick<PunchListSqlOpts, 'includeAmounts' | 'includePaymentTypeName' | 'includeErrorType'>,
): string {
  const includeAmounts = opts.includeAmounts === true
  const includePaymentTypeName = opts.includePaymentTypeName === true
  // V2 hace un SELECT interno por invocación: sólo se paga cuando hace falta.
  const errorTypeField =
    opts.includeErrorType === true
      ? `TTK_PUNCH_WITH_ERROR_V2(tew.id,'')       AS error_type,`
      : ''
  const amountFields = includeAmounts
    ? `tew.hourly_rate                          AS hourly_rate,
  tew.type_payment                         AS type_payment,`
    : `NULL                                     AS hourly_rate,
  NULL                                     AS type_payment,`
  const paymentTypeFields = includePaymentTypeName
    ? `gd.id                                    AS id_payment_type,
  gd.name                                  AS payment_type_name,`
    : `NULL                                     AS id_payment_type,
  NULL                                     AS payment_type_name,`

  return `
  tew.id                                   AS id,
  tew.estado                               AS estado,
  tew.manual_create                        AS manual_create,
  tew.fixed_at                             AS fixed_at,
  tew.fixed_by                             AS fixed_by,
  tew.fixed_error_snapshot                 AS fixed_error_snapshot,
  ${amountFields}

  ${utcEpochExpr('tew.punch_in')}          AS punch_in_epoch,
  ${utcEpochExpr('tew.punch_out')}         AS punch_out_epoch,
  ${utcEpochExpr('tew.break_start')}       AS break_start_epoch,
  ${utcEpochExpr('tew.break_end')}         AS break_end_epoch,

  DATE_FORMAT(tew.punch_in, '%Y-%m-%d %H:%i:%s')                                   AS punch_in_cursor,

  SEC_TO_TIME(TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1) * 3600) AS time_work,
  TIME_FORMAT(TIMEDIFF(tew.punch_out, tew.punch_in), '%H:%i:%s')                   AS total_time_work,
  TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1) AS number_work,
  TIME_FORMAT(TIMEDIFF(tew.break_end, tew.break_start), '%H:%i:%s')                AS time_break,
  TTK_CALCULATE_TIME_DAY(1, tew.break_end, tew.break_start, NULL, NULL, 1)         AS number_break,

  TTK_PUNCH_WITH_ERROR(tew.id)             AS bad_punch,
  ${errorTypeField}

  tew.id_punch_in_log_validation           AS id_punch_in_log_validation,
  tew.id_break_start_log_validation        AS id_break_start_log_validation,
  tew.id_break_end_log_validation          AS id_break_end_log_validation,
  tew.id_punch_out_log_validation          AS id_punch_out_log_validation,
  tew.id_punch_in_log_finger_validation    AS id_punch_in_log_finger_validation,
  tew.id_break_start_log_finger_validation AS id_break_start_log_finger_validation,
  tew.id_break_end_log_finger_validation   AS id_break_end_log_finger_validation,
  tew.id_punch_out_log_finger_validation   AS id_punch_out_log_finger_validation,

  u.id_usuario                             AS id_usuario,
  u.nombre                                 AS nombre,
  u.thumbnail_uuid                         AS thumbnail_uuid,
  uf.nombre                                AS fixed_by_nombre,
  c.id                                     AS id_dealer,
  ${dealerNameByProviderExpr(idDealerProvider)} AS razon_social,
  ${paymentTypeFields}

  EXISTS (SELECT 1 FROM LOG_TTK_EMPLOYEE_WORK l WHERE l.id_ttk = tew.id) AS has_log,

  (SELECT CONCAT('{"department":"', MAX(d.nombre), '","role":"', MAX(r.nombre), '"}')
     FROM USUARIO_ROL_REL urr
     INNER JOIN ROL r        ON r.id_rol = urr.id_rol
     LEFT  JOIN DEPARTMENT d ON d.id = r.id_department
    WHERE urr.id_usuario = tew.id_author
      AND urr.id_dealer_asigned = tew.id_dealer)                          AS rol_dpto
`
}

export function buildPunchListFromWhere(
  filter: Pick<
    SrsKpiFilter,
    | 'idDealerProvider'
    | 'idUsuario'
    | 'dealerIds'
    | 'fechaDesde'
    | 'fechaHasta'
    | 'skipDealerRestriction'
  >,
  opts: PunchListSqlOpts,
): { fromWhere: string; params: (string | number)[] } {
  const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
    filter
  const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
  const issue = resolveGroupedIssueFilter(opts.issueType, opts.errorTypes)

  const paymentTypeSql = opts.idPaymentType ? ' AND tew.id_payment_type = ?' : ''
  const paymentTypeParams = opts.idPaymentType ? [opts.idPaymentType] : []

  const employeeSql = opts.idEmployee ? ' AND tew.id_author = ?' : ''
  const employeeParams = opts.idEmployee ? [opts.idEmployee] : []

  const useSearch = !opts.idEmployee && Boolean(opts.search?.trim())
  const searchSql = useSearch ? ' AND u.nombre LIKE ?' : ''
  const searchParams = useSearch ? [`%${opts.search!.trim()}%`] : []

  const punchHoursExpr = 'TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, NULL, NULL, 1)'
  const minHoursSql = opts.minHours != null ? ` AND ${punchHoursExpr} >= ?` : ''
  const minHoursParams = opts.minHours != null ? [opts.minHours] : []
  const maxHoursSql = opts.maxHours != null ? ` AND ${punchHoursExpr} <= ?` : ''
  const maxHoursParams = opts.maxHours != null ? [opts.maxHours] : []

  const fromWhere = `
      FROM TTK_EMPLOYEE_WORK tew
      ${ttk.join}
      INNER JOIN usuarios     u  ON u.id_usuario = tew.id_author
      LEFT  JOIN usuarios     uf ON uf.id_usuario = tew.fixed_by
      LEFT  JOIN GENERIC_DATA gd ON gd.id = tew.id_payment_type
      WHERE tew.estado = ?
        AND tew.id_dealer_provider = ?
        ${ttk.and}
        AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
        ${issue.extraSql}
        ${paymentTypeSql}
        ${employeeSql}
        ${searchSql}
        ${minHoursSql}
        ${maxHoursSql}
        ${liveStatusSql(opts.todayLiveStatus)}`

  const params: (string | number)[] = [
    issue.estado,
    idDealerProvider,
    ...ttk.params,
    fechaDesde,
    fechaHasta,
    ...paymentTypeParams,
    ...employeeParams,
    ...searchParams,
    ...minHoursParams,
    ...maxHoursParams,
  ]

  return { fromWhere, params }
}

export function buildPunchListPageSql(
  filter: SrsKpiFilter,
  opts: PunchListPageSqlOpts,
): {
  sql: string
  params: (string | number)[]
  fromWhere: string
  baseParams: (string | number)[]
  countSql: string
} {
  const { fromWhere, params: baseParams } = buildPunchListFromWhere(filter, opts)
  const select = buildPunchListSelectFields(filter.idDealerProvider, opts)

  const sort: PunchListSort = opts.sort ?? 'punchIn'
  const col = SORT_COLUMNS[sort] ?? SORT_COLUMNS.punchIn
  const dir = opts.dir === 'asc' ? 'ASC' : 'DESC'
  const cmp = dir === 'ASC' ? '>' : '<'

  const hasCursor = Boolean(opts.afterValue) && Number(opts.afterId) > 0
  const cursorSql = hasCursor
    ? ` AND ( ${col} ${cmp} ? OR (${col} = ? AND tew.id ${cmp} ?) )`
    : ''
  const cursorParams: (string | number)[] = hasCursor
    ? [opts.afterValue!, opts.afterValue!, Number(opts.afterId)]
    : []

  const orderSql = `ORDER BY ${col} ${dir}, tew.id ${dir}`
  const sql = `SELECT ${select} ${fromWhere} ${cursorSql} ${orderSql} LIMIT ?`
  const params = [...baseParams, ...cursorParams, opts.pageSize + 1]
  const countSql = `SELECT COUNT(*) AS total ${fromWhere}`

  return { sql, params, fromWhere, baseParams, countSql }
}

export function buildPunchListExportSql(
  filter: SrsKpiFilter,
  opts: PunchListSqlOpts,
): { sql: string; params: (string | number)[]; fromWhere: string } {
  const { fromWhere, params } = buildPunchListFromWhere(filter, opts)
  const select = buildPunchListSelectFields(filter.idDealerProvider, opts)
  const sql = `SELECT ${select} ${fromWhere} ORDER BY tew.punch_in DESC, tew.id DESC`
  return { sql, params, fromWhere }
}
