import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  buildDealerFilterSql,
  buildDealerRestrictionClause,
} from '../../shared/kpi/srs-kpi-dealer-filter'
import type {
  PunchDealerRankingByTypeDto,
  PunchDealerRankingEmployeeRow,
  PunchDealerRankingRowDto,
} from '../dto/punch-dealer-ranking.dto'
import {
  fixLedgerInList,
  PENDING_ERROR_TOTAL_TYPES,
  typesForMode,
  v2TypesInList,
} from './punch-error-types'
import { FAKE_GPS_EXISTS_SQL, WITHOUT_SALARY_SQL } from './punch-flag-sql'

export interface DealerRankingOptions {
  /** Lista blanca YA parseada (`parseErrorTypes`); va interpolada con `errorTypesInList`. */
  errorTypes: readonly number[]
  /** Nombre o parte del nombre del empleado. Vacío = sin filtro. */
  search?: string
  /**
   * Sale de la policy (`resolveDeletedVisibility`). Sólo pesa en Corrected: sin
   * `Time Tracking > Delete (web)` (68) no cuentan las correcciones sobre ponchadas
   * después eliminadas, igual que `getFixFrom()` en PHP.
   */
  includeDeletedFixes: boolean
}

type SqlPart = { sql: string; params: (string | number)[] }

type RawRow = Record<string, unknown>

/**
 * Number() OBLIGATORIO en todos los COUNT/SUM: el driver de MariaDB los devuelve
 * como string. Declararlos `number` en TS no transforma nada, y sin esto el XLSX
 * escribe texto en columnas que tienen que ser numéricas.
 */
function mapByType(
  r: RawRow,
  mode: 'pending' | 'corrected',
  errorTypes: readonly number[],
): PunchDealerRankingByTypeDto {
  const enabled = typesForMode(errorTypes, mode)
  const byType: PunchDealerRankingByTypeDto = {}
  if (enabled.includes(1)) byType.clockOutMissing = Number(r.clockOutMissing ?? 0)
  if (enabled.includes(2)) byType.breakMissing = Number(r.breakMissing ?? 0)
  if (enabled.includes(3)) byType.shift20hPlus = Number(r.shift20hPlus ?? 0)
  if (enabled.includes(4)) byType.withoutSalary = Number(r.withoutSalary ?? 0)
  if (enabled.includes(5)) byType.manual = Number(r.manual ?? 0)
  if (enabled.includes(6)) byType.deleted = Number(r.deleted ?? 0)
  if (enabled.includes(7)) byType.paymentTypeChange = Number(r.paymentTypeChange ?? 0)
  if (enabled.includes(8)) byType.fakeGps = Number(r.fakeGps ?? 0)
  return byType
}

function mapDealerRow(
  r: RawRow,
  withPunches: boolean,
  mode: 'pending' | 'corrected',
  errorTypes: readonly number[],
): PunchDealerRankingRowDto {
  return {
    idDealer: Number(r.idDealer),
    dealerName: String(r.dealerName ?? ''),
    total: Number(r.total ?? 0),
    punches: withPunches ? Number(r.punches ?? 0) : null,
    byType: mapByType(r, mode, errorTypes),
  }
}

function mapEmployeeRow(
  r: RawRow,
  withPunches: boolean,
  mode: 'pending' | 'corrected',
  errorTypes: readonly number[],
): PunchDealerRankingEmployeeRow {
  return {
    idEmployee: Number(r.idEmployee),
    employeeName: String(r.employeeName ?? ''),
    ...mapDealerRow(r, withPunches, mode, errorTypes),
  }
}

/** Mismo criterio que Grouped: el término va recortado, y sólo si no queda vacío. */
function searchPart(search?: string): SqlPart {
  const term = search?.trim()
  return term ? { sql: ' AND u.nombre LIKE ?', params: [`%${term}%`] } : { sql: '', params: [] }
}

/**
 * Ranking de dealers del Dashboard y hojas de su export.
 *
 * Es espejo del CÁLCULO de `TTKEmployeeDao::loadDashboardSummary` (`$topDealersSql`
 * y `$topDealersFixedSql` + `getFixFrom()`), no de todo su filtro: no porta
 * `restrictPayrollByUser`, que PHP pone sólo a usuarios que no ven el Dashboard.
 * Cambia a propósito:
 * - sin `LIMIT 5`: la tarjeta toma los primeros 5 de la misma lista que el modal;
 * - el nombre sale de `GET_DEALER_NAME_BY_PROVIDER` (regla dealer-display-name-by-provider);
 * - los empates se ordenan por nombre (PHP no desempataba).
 *
 * Pending cuenta ponchadas con error HOY: `TTK_PUNCH_WITH_ERROR_V2` clasifica cada
 * ponchada en UN solo código, así que una ponchada es un error. Corrected cuenta
 * EVENTOS de la bitácora (una ponchada con dos tipos arreglados suma dos) y, aparte,
 * ponchadas distintas, que es lo que cuenta la vista Grouped a la que lleva el click.
 */
@Injectable()
export class PunchDealerRankingRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getPendingByDealer(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<PunchDealerRankingRowDto[]> {
    const sql = this.pendingAggregateSql(opts, 'dealer')
    if (!sql) return []
    const source = this.punchSource(filter, opts, 'tew.estado = 1')
    const rows: RawRow[] = await this.srs.query(sql.split('__SOURCE__').join(source.sql), [
      filter.idDealerProvider,
      ...source.params,
    ])
    return rows.map((r) => mapDealerRow(r, false, 'pending', opts.errorTypes))
  }

  async getCorrectedByDealer(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<PunchDealerRankingRowDto[]> {
    return this.mergeCorrected(
      await this.correctedLedgerByDealer(filter, opts),
      await this.liveCorrectedByDealer(filter, opts),
      opts.errorTypes,
      false,
    )
  }

  async getPendingByEmployee(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<PunchDealerRankingEmployeeRow[]> {
    const sql = this.pendingAggregateSql(opts, 'employee')
    if (!sql) return []
    const source = this.punchSource(filter, opts, 'tew.estado = 1')
    const rows: RawRow[] = await this.srs.query(sql.split('__SOURCE__').join(source.sql), [
      filter.idDealerProvider,
      ...source.params,
    ])
    return rows.map((r) => mapEmployeeRow(r, false, 'pending', opts.errorTypes))
  }

  async getCorrectedByEmployee(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<PunchDealerRankingEmployeeRow[]> {
    return this.mergeCorrectedEmployees(
      await this.correctedLedgerByEmployee(filter, opts),
      await this.liveCorrectedByEmployee(filter, opts),
      opts.errorTypes,
    )
  }

  /**
   * FROM + WHERE de Pending, el mismo para la hoja Dealers y la de Employees.
   *
   * - El provider sale del contexto (tenant), nunca del pedido.
   * - Scope de dealers: `RESTRICTION_DEALER_V2` + la lista del header (sólo la lista
   *   para Admin 1/2), vía `buildDealerFilterSql('ttk')`.
   * - `tew.punch_in` es DATETIME: rango semiabierto `[desde, hasta + 1 día)`, para
   *   no comerse el último día (regla mysql-date-ranges).
   */
  private punchSource(filter: SrsKpiFilter, opts: DealerRankingOptions, extraAnd: string): SqlPart {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
    const search = searchPart(opts.search)
    return {
      sql: `FROM TTK_EMPLOYEE_WORK tew
         ${ttk.join}
         INNER JOIN usuarios u ON u.id_usuario = tew.id_author
         WHERE ${extraAnd}
           AND tew.id_dealer_provider = ?
           ${ttk.and}
           AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
           ${search.sql}`,
      params: [idDealerProvider, ...ttk.params, fechaDesde, fechaHasta, ...search.params],
    }
  }

  private pendingAggregateSql(
    opts: DealerRankingOptions,
    kind: 'dealer' | 'employee',
  ): string | null {
    const types = opts.errorTypes
    const has4 = types.includes(4)
    const has8 = types.includes(8)
    const v2 = v2TypesInList(types)
    const hasTotal = types.some((t) => PENDING_ERROR_TOTAL_TYPES.includes(t))
    if (!hasTotal && !has8) return null

    if (!has4 && !has8) {
      if (!v2) return null
      if (kind === 'dealer') {
        return `SELECT x.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, x.id_dealer)  AS dealerName,
              COUNT(*)                                     AS total,
              SUM(x.err = 1)                               AS clockOutMissing,
              SUM(x.err = 2)                               AS breakMissing,
              SUM(x.err = 3)                               AS shift20hPlus
       FROM (
         SELECT tew.id_dealer, TTK_PUNCH_WITH_ERROR_V2(tew.id, '') AS err
         __SOURCE__
       ) x
       WHERE x.err IN (${v2})
       GROUP BY x.id_dealer
       ORDER BY total DESC, dealerName ASC, x.id_dealer ASC`
      }
      return `SELECT x.id_author                                  AS idEmployee,
              x.employeeName                               AS employeeName,
              x.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, x.id_dealer)  AS dealerName,
              COUNT(*)                                     AS total,
              SUM(x.err = 1)                               AS clockOutMissing,
              SUM(x.err = 2)                               AS breakMissing,
              SUM(x.err = 3)                               AS shift20hPlus
       FROM (
         SELECT tew.id_author, u.nombre AS employeeName, tew.id_dealer,
                TTK_PUNCH_WITH_ERROR_V2(tew.id, '') AS err
         __SOURCE__
       ) x
       WHERE x.err IN (${v2})
       GROUP BY x.id_author, x.employeeName, x.id_dealer
       ORDER BY total DESC, x.employeeName ASC, dealerName ASC`
    }

    const inTotalParts: string[] = []
    if (v2) inTotalParts.push(`TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (${v2})`)
    if (has4) inTotalParts.push(WITHOUT_SALARY_SQL)
    const inTotalSql = inTotalParts.length ? inTotalParts.join(' OR ') : '0'
    const where = has8 ? 'x.in_total = 1 OR x.fake_gps = 1' : 'x.in_total = 1'
    const innerCols =
      kind === 'employee'
        ? `tew.id, tew.id_author, u.nombre AS employeeName, tew.id_dealer,`
        : `tew.id, tew.id_dealer,`

    const inner = `SELECT ${innerCols}
                TTK_PUNCH_WITH_ERROR_V2(tew.id, '') AS err,
                CASE WHEN ${WITHOUT_SALARY_SQL} THEN 1 ELSE 0 END AS without_salary,
                CASE WHEN ${FAKE_GPS_EXISTS_SQL} THEN 1 ELSE 0 END AS fake_gps,
                CASE WHEN (${inTotalSql}) THEN 1 ELSE 0 END AS in_total
         __SOURCE__`

    if (kind === 'dealer') {
      return `SELECT x.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, x.id_dealer)  AS dealerName,
              COUNT(DISTINCT CASE WHEN x.in_total = 1 THEN x.id END) AS total,
              SUM(x.err = 1)                               AS clockOutMissing,
              SUM(x.err = 2)                               AS breakMissing,
              SUM(x.err = 3)                               AS shift20hPlus,
              SUM(x.without_salary)                        AS withoutSalary,
              SUM(x.fake_gps)                              AS fakeGps
       FROM (${inner}) x
       WHERE ${where}
       GROUP BY x.id_dealer
       ORDER BY total DESC, dealerName ASC, x.id_dealer ASC`
    }

    return `SELECT x.id_author                                  AS idEmployee,
              x.employeeName                               AS employeeName,
              x.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, x.id_dealer)  AS dealerName,
              COUNT(DISTINCT CASE WHEN x.in_total = 1 THEN x.id END) AS total,
              SUM(x.err = 1)                               AS clockOutMissing,
              SUM(x.err = 2)                               AS breakMissing,
              SUM(x.err = 3)                               AS shift20hPlus,
              SUM(x.without_salary)                        AS withoutSalary,
              SUM(x.fake_gps)                              AS fakeGps
       FROM (${inner}) x
       WHERE ${where}
       GROUP BY x.id_author, x.employeeName, x.id_dealer
       ORDER BY total DESC, x.employeeName ASC, dealerName ASC`
  }

  private async correctedLedgerByDealer(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<RawRow[]> {
    const ledger = fixLedgerInList(opts.errorTypes)
    if (!ledger) return []
    const source = this.correctedSource(filter, { ...opts, errorTypes: ledger.split(',').map(Number) })
    return this.srs.query(
      `SELECT f.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, f.id_dealer)  AS dealerName,
              COUNT(*)                                     AS total,
              COUNT(DISTINCT f.id_ttk_employee_work)       AS punches,
              SUM(f.error_type = 1)                        AS clockOutMissing,
              SUM(f.error_type = 2)                        AS breakMissing,
              SUM(f.error_type = 3)                        AS shift20hPlus,
              SUM(f.error_type = 4)                        AS withoutSalary,
              SUM(f.error_type = 7)                        AS paymentTypeChange
       ${source.sql}
       GROUP BY f.id_dealer
       ORDER BY total DESC, dealerName ASC, f.id_dealer ASC`,
      [filter.idDealerProvider, ...source.params],
    )
  }

  private async correctedLedgerByEmployee(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<RawRow[]> {
    const ledger = fixLedgerInList(opts.errorTypes)
    if (!ledger) return []
    const source = this.correctedSource(filter, { ...opts, errorTypes: ledger.split(',').map(Number) })
    return this.srs.query(
      `SELECT f.id_employee                                AS idEmployee,
              u.nombre                                     AS employeeName,
              f.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, f.id_dealer)  AS dealerName,
              COUNT(*)                                     AS total,
              COUNT(DISTINCT f.id_ttk_employee_work)       AS punches,
              SUM(f.error_type = 1)                        AS clockOutMissing,
              SUM(f.error_type = 2)                        AS breakMissing,
              SUM(f.error_type = 3)                        AS shift20hPlus,
              SUM(f.error_type = 4)                        AS withoutSalary,
              SUM(f.error_type = 7)                        AS paymentTypeChange
       ${source.sql}
       GROUP BY f.id_employee, u.nombre, f.id_dealer
       ORDER BY total DESC, employeeName ASC, dealerName ASC`,
      [filter.idDealerProvider, ...source.params],
    )
  }

  private async liveCorrectedByDealer(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<{ manual: RawRow[]; deleted: RawRow[] }> {
    return {
      manual: opts.errorTypes.includes(5)
        ? await this.liveCountByDealer(filter, opts, 'tew.manual_create = 1 AND tew.estado = 1')
        : [],
      deleted: opts.errorTypes.includes(6)
        ? await this.liveCountByDealer(filter, opts, 'tew.estado = 0')
        : [],
    }
  }

  private async liveCorrectedByEmployee(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<{ manual: RawRow[]; deleted: RawRow[] }> {
    return {
      manual: opts.errorTypes.includes(5)
        ? await this.liveCountByEmployee(filter, opts, 'tew.manual_create = 1 AND tew.estado = 1')
        : [],
      deleted: opts.errorTypes.includes(6)
        ? await this.liveCountByEmployee(filter, opts, 'tew.estado = 0')
        : [],
    }
  }

  private async liveCountByDealer(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
    extraAnd: string,
  ): Promise<RawRow[]> {
    const source = this.punchSource(filter, opts, extraAnd)
    return this.srs.query(
      `SELECT tew.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, tew.id_dealer)  AS dealerName,
              COUNT(*)                                       AS n
       ${source.sql}
       GROUP BY tew.id_dealer`,
      [filter.idDealerProvider, ...source.params],
    )
  }

  private async liveCountByEmployee(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
    extraAnd: string,
  ): Promise<RawRow[]> {
    const source = this.punchSource(filter, opts, extraAnd)
    return this.srs.query(
      `SELECT tew.id_author                                  AS idEmployee,
              u.nombre                                       AS employeeName,
              tew.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, tew.id_dealer)  AS dealerName,
              COUNT(*)                                       AS n
       ${source.sql}
       GROUP BY tew.id_author, u.nombre, tew.id_dealer`,
      [filter.idDealerProvider, ...source.params],
    )
  }

  private mergeCorrected(
    ledger: RawRow[],
    live: { manual: RawRow[]; deleted: RawRow[] },
    errorTypes: readonly number[],
    _withEmployee: boolean,
  ): PunchDealerRankingRowDto[] {
    const byKey = new Map<string, PunchDealerRankingRowDto>()
    const put = (r: RawRow) => {
      const mapped = mapDealerRow(r, true, 'corrected', errorTypes)
      byKey.set(String(mapped.idDealer), mapped)
    }
    for (const r of ledger) put(r)
    for (const r of live.manual) {
      const id = Number(r.idDealer)
      const cur =
        byKey.get(String(id)) ??
        mapDealerRow(
          { ...r, total: 0, punches: 0, clockOutMissing: 0, breakMissing: 0, shift20hPlus: 0 },
          true,
          'corrected',
          errorTypes,
        )
      cur.byType.manual = Number(r.n ?? 0)
      // Suma al total como la tarjeta Corrected del resumen: sin esto un dealer con
      // sólo manuales quedaba en 0 y el orden salía de la bitácora sola.
      cur.total += Number(r.n ?? 0)
      cur.punches = (cur.punches ?? 0) + Number(r.n ?? 0)
      byKey.set(String(id), cur)
    }
    for (const r of live.deleted) {
      const id = Number(r.idDealer)
      const cur =
        byKey.get(String(id)) ??
        mapDealerRow(
          { ...r, total: 0, punches: 0, clockOutMissing: 0, breakMissing: 0, shift20hPlus: 0 },
          true,
          'corrected',
          errorTypes,
        )
      cur.byType.deleted = Number(r.n ?? 0)
      cur.total += Number(r.n ?? 0)
      cur.punches = (cur.punches ?? 0) + Number(r.n ?? 0)
      byKey.set(String(id), cur)
    }
    return [...byKey.values()].sort(
      (a, b) => b.total - a.total || a.dealerName.localeCompare(b.dealerName) || a.idDealer - b.idDealer,
    )
  }

  private mergeCorrectedEmployees(
    ledger: RawRow[],
    live: { manual: RawRow[]; deleted: RawRow[] },
    errorTypes: readonly number[],
  ): PunchDealerRankingEmployeeRow[] {
    const byKey = new Map<string, PunchDealerRankingEmployeeRow>()
    const keyOf = (r: { idEmployee: number; idDealer: number }) => `${r.idEmployee}:${r.idDealer}`
    const put = (r: RawRow) => {
      const mapped = mapEmployeeRow(r, true, 'corrected', errorTypes)
      byKey.set(keyOf(mapped), mapped)
    }
    for (const r of ledger) put(r)
    for (const r of live.manual) {
      const mapped = mapEmployeeRow(
        { ...r, total: 0, punches: 0, clockOutMissing: 0, breakMissing: 0, shift20hPlus: 0 },
        true,
        'corrected',
        errorTypes,
      )
      const cur = byKey.get(keyOf(mapped)) ?? mapped
      cur.byType.manual = Number(r.n ?? 0)
      cur.total += Number(r.n ?? 0)
      cur.punches = (cur.punches ?? 0) + Number(r.n ?? 0)
      byKey.set(keyOf(cur), cur)
    }
    for (const r of live.deleted) {
      const mapped = mapEmployeeRow(
        { ...r, total: 0, punches: 0, clockOutMissing: 0, breakMissing: 0, shift20hPlus: 0 },
        true,
        'corrected',
        errorTypes,
      )
      const cur = byKey.get(keyOf(mapped)) ?? mapped
      cur.byType.deleted = Number(r.n ?? 0)
      cur.total += Number(r.n ?? 0)
      cur.punches = (cur.punches ?? 0) + Number(r.n ?? 0)
      byKey.set(keyOf(cur), cur)
    }
    return [...byKey.values()].sort(
      (a, b) =>
        b.total - a.total ||
        a.employeeName.localeCompare(b.employeeName) ||
        a.dealerName.localeCompare(b.dealerName),
    )
  }

  /**
   * FROM + WHERE de Corrected, sobre la bitácora (espejo de `getFixFrom()`).
   *
   * - El provider va en `f` Y en el join a `tew`: `f.id_dealer_provider` está
   *   denormalizado y su FK apunta a CONTRATISTA, no al provider de la ponchada.
   * - El dealer se resuelve sobre `f.id_dealer`, que es donde la bitácora lo congela
   *   al corregir (mismo criterio que punch-kpi.repository.ts).
   * - `f.punch_date` es DATE: rango cerrado en los dos extremos.
   * - `u` es el dueño de la ponchada (`f.id_employee`): de ahí sale la búsqueda y,
   *   en la hoja Employees, el nombre.
   */
  private correctedSource(filter: SrsKpiFilter, opts: DealerRankingOptions): SqlPart {
    const ledger = fixLedgerInList(opts.errorTypes)
    const typesSql = ledger ?? 'NULL'
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const fixScope = buildDealerRestrictionClause(idUsuario, dealerIds, skipDealerRestriction)
    const deletedFixesSql = opts.includeDeletedFixes ? '' : ' AND tew.estado = 1'
    const search = searchPart(opts.search)
    return {
      sql: `FROM TTK_PUNCH_ERROR_FIX f
       INNER JOIN TTK_EMPLOYEE_WORK tew
               ON tew.id = f.id_ttk_employee_work
              AND tew.id_dealer_provider = f.id_dealer_provider
       JOIN CONTRATISTA c ON c.id = f.id_dealer
       INNER JOIN usuarios u ON u.id_usuario = f.id_employee
       WHERE f.id_dealer_provider = ?${deletedFixesSql}
         ${fixScope.and}
         AND f.punch_date >= ? AND f.punch_date <= ?
         AND f.error_type IN (${typesSql})
         ${search.sql}`,
      params: [idDealerProvider, ...fixScope.params, fechaDesde, fechaHasta, ...search.params],
    }
  }
}
