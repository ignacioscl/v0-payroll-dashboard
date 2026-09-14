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
  PunchDealerRankingEmployeeRow,
  PunchDealerRankingRowDto,
} from '../dto/punch-dealer-ranking.dto'
import { errorTypesInList } from './punch-error-types'

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
function mapDealerRow(r: RawRow, withPunches: boolean): PunchDealerRankingRowDto {
  return {
    idDealer: Number(r.idDealer),
    dealerName: String(r.dealerName ?? ''),
    total: Number(r.total ?? 0),
    punches: withPunches ? Number(r.punches ?? 0) : null,
    byType: {
      clockOutMissing: Number(r.clockOutMissing ?? 0),
      breakMissing: Number(r.breakMissing ?? 0),
      shift20hPlus: Number(r.shift20hPlus ?? 0),
    },
  }
}

function mapEmployeeRow(r: RawRow, withPunches: boolean): PunchDealerRankingEmployeeRow {
  return {
    idEmployee: Number(r.idEmployee),
    employeeName: String(r.employeeName ?? ''),
    ...mapDealerRow(r, withPunches),
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
    const source = this.pendingSource(filter, opts)
    const rows: RawRow[] = await this.srs.query(
      `SELECT x.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, x.id_dealer)  AS dealerName,
              COUNT(*)                                     AS total,
              SUM(x.err = 1)                               AS clockOutMissing,
              SUM(x.err = 2)                               AS breakMissing,
              SUM(x.err = 3)                               AS shift20hPlus
       FROM (
         SELECT tew.id_dealer, TTK_PUNCH_WITH_ERROR_V2(tew.id, '') AS err
         ${source.sql}
       ) x
       WHERE x.err IN (${errorTypesInList(opts.errorTypes)})
       GROUP BY x.id_dealer
       ORDER BY total DESC, dealerName ASC, x.id_dealer ASC`,
      // El provider del nombre (SELECT) va ANTES que los binds del FROM.
      [filter.idDealerProvider, ...source.params],
    )
    return rows.map((r) => mapDealerRow(r, false))
  }

  async getCorrectedByDealer(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<PunchDealerRankingRowDto[]> {
    const source = this.correctedSource(filter, opts)
    const rows: RawRow[] = await this.srs.query(
      `SELECT f.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, f.id_dealer)  AS dealerName,
              COUNT(*)                                     AS total,
              COUNT(DISTINCT f.id_ttk_employee_work)       AS punches,
              SUM(f.error_type = 1)                        AS clockOutMissing,
              SUM(f.error_type = 2)                        AS breakMissing,
              SUM(f.error_type = 3)                        AS shift20hPlus
       ${source.sql}
       GROUP BY f.id_dealer
       ORDER BY total DESC, dealerName ASC, f.id_dealer ASC`,
      [filter.idDealerProvider, ...source.params],
    )
    return rows.map((r) => mapDealerRow(r, true))
  }

  /** Hoja Employees en Pending: una fila por empleado y dealer. */
  async getPendingByEmployee(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<PunchDealerRankingEmployeeRow[]> {
    const source = this.pendingSource(filter, opts)
    // El nombre del empleado se proyecta ADENTRO del subselect: afuera `u` no
    // existe (la primera versión lo usaba ahí y daba ERROR 1054).
    const rows: RawRow[] = await this.srs.query(
      `SELECT x.id_author                                  AS idEmployee,
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
         ${source.sql}
       ) x
       WHERE x.err IN (${errorTypesInList(opts.errorTypes)})
       GROUP BY x.id_author, x.employeeName, x.id_dealer
       ORDER BY total DESC, x.employeeName ASC, dealerName ASC`,
      [filter.idDealerProvider, ...source.params],
    )
    return rows.map((r) => mapEmployeeRow(r, false))
  }

  /** Hoja Employees en Corrected: cuenta al DUEÑO de la ponchada (`f.id_employee`, D3). */
  async getCorrectedByEmployee(
    filter: SrsKpiFilter,
    opts: DealerRankingOptions,
  ): Promise<PunchDealerRankingEmployeeRow[]> {
    const source = this.correctedSource(filter, opts)
    const rows: RawRow[] = await this.srs.query(
      `SELECT f.id_employee                                AS idEmployee,
              u.nombre                                     AS employeeName,
              f.id_dealer                                  AS idDealer,
              GET_DEALER_NAME_BY_PROVIDER(?, f.id_dealer)  AS dealerName,
              COUNT(*)                                     AS total,
              COUNT(DISTINCT f.id_ttk_employee_work)       AS punches,
              SUM(f.error_type = 1)                        AS clockOutMissing,
              SUM(f.error_type = 2)                        AS breakMissing,
              SUM(f.error_type = 3)                        AS shift20hPlus
       ${source.sql}
       GROUP BY f.id_employee, u.nombre, f.id_dealer
       ORDER BY total DESC, employeeName ASC, dealerName ASC`,
      [filter.idDealerProvider, ...source.params],
    )
    return rows.map((r) => mapEmployeeRow(r, true))
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
  private pendingSource(filter: SrsKpiFilter, opts: DealerRankingOptions): SqlPart {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
    const search = searchPart(opts.search)
    return {
      sql: `FROM TTK_EMPLOYEE_WORK tew
         ${ttk.join}
         INNER JOIN usuarios u ON u.id_usuario = tew.id_author
         WHERE tew.estado = 1
           AND tew.id_dealer_provider = ?
           ${ttk.and}
           AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
           ${search.sql}`,
      // Cada bloque aporta sus binds EN EL ORDEN EN QUE SU SQL APARECE EN EL TEXTO.
      params: [idDealerProvider, ...ttk.params, fechaDesde, fechaHasta, ...search.params],
    }
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
         AND f.error_type IN (${errorTypesInList(opts.errorTypes)})
         ${search.sql}`,
      params: [idDealerProvider, ...fixScope.params, fechaDesde, fechaHasta, ...search.params],
    }
  }
}
