import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'
import { resolveGroupedIssueFilter } from './punch-grouped-issue-filter'
import {
  PunchListLiveStatus,
  PunchListResponseDto,
  PunchListRowDto,
  PunchListSort,
} from '../dto/punch-list.dto'

export interface PunchListOptions {
  pageSize: number
  sort?: PunchListSort
  dir?: 'asc' | 'desc'
  /** Cursor keyset: valor de la columna ordenada en la última fila entregada. */
  afterValue?: string
  afterId?: number
  minHours?: number
  maxHours?: number
  idPaymentType?: number
  search?: string
  idEmployee?: number
  issueType?: string
  todayLiveStatus?: PunchListLiveStatus
}

/** Whitelist de orden. El valor NUNCA sale del query string. */
const SORT_COLUMNS: Record<PunchListSort, string> = {
  punchIn: 'tew.punch_in',
  employee: 'u.nombre',
}

/**
 * El instante real de la ponchada, en segundos.
 *
 * `punch_in` & co. son TIMESTAMP: MariaDB los guarda en UTC y los devuelve convertidos a la zona
 * de la sesión. `UNIX_TIMESTAMP` saltea esa conversión y entrega el UTC guardado, que es
 * exactamente lo que produce `GeneralUtils::getDateGMT0()` en PHP.
 *
 * La versión anterior hacía `DATE_FORMAT(col, '…Z')`: le pegaba una `Z` literal al reloj de pared
 * sin convertir nada. El browser después le restaba su propio offset y la hora salía 4 h corrida.
 * **No volver a formatear la fecha como texto acá.**
 */
export function utcEpochExpr(column: string): string {
  return `CASE WHEN ${column} IS NULL OR ${column} <= '1970-01-01'
               THEN NULL
               ELSE UNIX_TIMESTAMP(${column})
          END`
}

/** epoch (s) → ISO 8601 UTC, el formato que el frontend ya consume en `punchInGmt0`. */
export function epochToIso(raw: unknown): string | null {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n * 1000).toISOString()
}

/** Mirror de TTKEmployeeDao::getTodayLiveStatusCondition() (línea 156). Sin params. */
function liveStatusSql(status?: PunchListLiveStatus): string {
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

/** Dealer display name for the logged provider (DEALER_REL.dealer_name → fallback razon_social). */
function dealerNameByProviderExpr(idDealerProvider: number): string {
  const providerId = Number.isFinite(idDealerProvider) ? Math.trunc(idDealerProvider) : 0
  return `GET_DEALER_NAME_BY_PROVIDER(${providerId}, c.id)`
}

function buildSelectFields(idDealerProvider: number): string {
  return `
  tew.id                                   AS id,
  tew.estado                               AS estado,
  tew.manual_create                        AS manual_create,
  tew.fixed_at                             AS fixed_at,
  tew.fixed_by                             AS fixed_by,
  tew.fixed_error_snapshot                 AS fixed_error_snapshot,
  tew.hourly_rate                          AS hourly_rate,
  tew.type_payment                         AS type_payment,

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
  gd.id                                    AS id_payment_type,
  gd.name                                  AS payment_type_name,

  EXISTS (SELECT 1 FROM LOG_TTK_EMPLOYEE_WORK l WHERE l.id_ttk = tew.id) AS has_log,

  (SELECT CONCAT('{"department":"', MAX(d.nombre), '","role":"', MAX(r.nombre), '"}')
     FROM USUARIO_ROL_REL urr
     INNER JOIN ROL r        ON r.id_rol = urr.id_rol
     LEFT  JOIN DEPARTMENT d ON d.id = r.id_department
    WHERE urr.id_usuario = tew.id_author
      AND urr.id_dealer_asigned = tew.id_dealer)                          AS rol_dpto
`
}

function parseJson<T>(raw: unknown): T | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object') return raw as T
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return null
  }
}

function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function toStringOrNull(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  return String(raw)
}

@Injectable()
export class PunchListRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getList(filter: SrsKpiFilter, opts: PunchListOptions): Promise<PunchListResponseDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
    const issue = resolveGroupedIssueFilter(opts.issueType)

    const paymentTypeSql = opts.idPaymentType ? ' AND tew.id_payment_type = ?' : ''
    const paymentTypeParams = opts.idPaymentType ? [opts.idPaymentType] : []

    const employeeSql = opts.idEmployee ? ' AND tew.id_author = ?' : ''
    const employeeParams = opts.idEmployee ? [opts.idEmployee] : []

    // Igual que grouped: filtrando por un empleado puntual, el buscador libre no aplica.
    const useSearch = !opts.idEmployee && Boolean(opts.search?.trim())
    const searchSql = useSearch ? ' AND u.nombre LIKE ?' : ''
    const searchParams = useSearch ? [`%${opts.search!.trim()}%`] : []

    // Horas de la ponchada individual (mirror de TTKEmployeeDao líneas 114-119).
    const punchHoursExpr = 'TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, NULL, NULL, 1)'
    const minHoursSql = opts.minHours != null ? ` AND ${punchHoursExpr} >= ?` : ''
    const minHoursParams = opts.minHours != null ? [opts.minHours] : []
    const maxHoursSql = opts.maxHours != null ? ` AND ${punchHoursExpr} <= ?` : ''
    const maxHoursParams = opts.maxHours != null ? [opts.maxHours] : []

    const baseFrom = `
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

    const baseParams: (string | number)[] = [
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

    const sort: PunchListSort = opts.sort ?? 'punchIn'
    const col = SORT_COLUMNS[sort] ?? SORT_COLUMNS.punchIn
    const dir = opts.dir === 'asc' ? 'ASC' : 'DESC'
    const cmp = dir === 'ASC' ? '>' : '<'

    // Keyset: corta por contenido, no por posición. El `tew.id` desempata las filas
    // con el mismo valor de orden (punch_in repetido, o dos empleados con igual nombre).
    const hasCursor = Boolean(opts.afterValue) && Number(opts.afterId) > 0
    const cursorSql = hasCursor
      ? ` AND ( ${col} ${cmp} ? OR (${col} = ? AND tew.id ${cmp} ?) )`
      : ''
    const cursorParams: (string | number)[] = hasCursor
      ? [opts.afterValue!, opts.afterValue!, Number(opts.afterId)]
      : []

    const orderSql = `ORDER BY ${col} ${dir}, tew.id ${dir}`

    // Se pide una fila de más para saber si hay siguiente sin depender del total
    // (el total del período cambia mientras la gente poncha; el cursor no).
    const rows: Record<string, unknown>[] = await this.srs.query(
      `SELECT ${buildSelectFields(idDealerProvider)} ${baseFrom} ${cursorSql} ${orderSql} LIMIT ?`,
      [...baseParams, ...cursorParams, opts.pageSize + 1],
    )

    const hasMore = rows.length > opts.pageSize
    const pageRows = hasMore ? rows.slice(0, opts.pageSize) : rows

    // El COUNT va SIN la condición del cursor: es el total del período (badge),
    // no "cuántas quedan después de la fila X".
    const countRows: { total: number | string }[] = await this.srs.query(
      `SELECT COUNT(*) AS total ${baseFrom}`,
      baseParams,
    )
    const total = Number(countRows[0]?.total ?? 0)

    const results = pageRows.map((r) => this.toRow(r))

    const last = pageRows[pageRows.length - 1]
    const nextCursor =
      hasMore && last
        ? {
            value: String(sort === 'employee' ? (last.nombre ?? '') : (last.punch_in_cursor ?? '')),
            id: Number(last.id),
          }
        : null

    return { results, pageSize: opts.pageSize, total, hasMore, nextCursor }
  }

  /** Mapea la fila cruda a la forma que ya consume el frontend (`TtkListRow`). */
  private toRow(r: Record<string, unknown>): PunchListRowDto {
    const rolDpto = parseJson<{ department?: string; role?: string }>(r.rol_dpto)
    const badPunch = parseJson<{ res?: string }>(r.bad_punch)
    const idPaymentType = toNumberOrNull(r.id_payment_type)
    const fixedById = toNumberOrNull(r.fixed_by)

    return {
      id: Number(r.id),

      punchInGmt0: epochToIso(r.punch_in_epoch),
      punchOutGmt0: epochToIso(r.punch_out_epoch),
      breakStartGmt0: epochToIso(r.break_start_epoch),
      breakEndGmt0: epochToIso(r.break_end_epoch),

      timeWork: toStringOrNull(r.time_work) ?? toStringOrNull(r.total_time_work) ?? '00:00',
      timeBreak: toStringOrNull(r.time_break) ?? '00:00',
      numberWork: toNumberOrNull(r.number_work),
      numberBrake: toNumberOrNull(r.number_break),

      estado: Number(r.estado ?? 1),
      hasLog: Number(r.has_log) ? 1 : 0,
      manualCreate: Number(r.manual_create ?? 0),

      fixedAt: toStringOrNull(r.fixed_at),
      fixedBy:
        fixedById && fixedById > 0
          ? { id: fixedById, nombre: String(r.fixed_by_nombre ?? '') }
          : null,
      fixedErrorSnapshot: toStringOrNull(r.fixed_error_snapshot),

      usuario: {
        id: Number(r.id_usuario),
        nombre: String(r.nombre ?? ''),
        thumbnailUuid: toStringOrNull(r.thumbnail_uuid),
      },
      rolDpto: rolDpto ? { role: rolDpto.role ?? null, department: rolDpto.department ?? null } : null,
      dealer: { id: Number(r.id_dealer), razonSocial: String(r.razon_social ?? '') },
      badPunch: badPunch?.res ? { res: String(badPunch.res) } : null,
      objPaymentType:
        idPaymentType && idPaymentType > 0
          ? { id: idPaymentType, name: String(r.payment_type_name ?? '') }
          : null,

      hourlyRate: toNumberOrNull(r.hourly_rate),
      typePayment: toNumberOrNull(r.type_payment),

      idPunchInLogValidation: toNumberOrNull(r.id_punch_in_log_validation),
      idBreakStartLogValidation: toNumberOrNull(r.id_break_start_log_validation),
      idBreakEndLogValidation: toNumberOrNull(r.id_break_end_log_validation),
      idPunchOutLogValidation: toNumberOrNull(r.id_punch_out_log_validation),
      idPunchInLogFingerValidation: toNumberOrNull(r.id_punch_in_log_finger_validation),
      idBreakStartLogFingerValidation: toNumberOrNull(r.id_break_start_log_finger_validation),
      idBreakEndLogFingerValidation: toNumberOrNull(r.id_break_end_log_finger_validation),
      idPunchOutLogFingerValidation: toNumberOrNull(r.id_punch_out_log_finger_validation),
    }
  }
}
