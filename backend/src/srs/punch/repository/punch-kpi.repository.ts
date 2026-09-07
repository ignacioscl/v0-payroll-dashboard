import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { PunchKpiDto } from '../dto/punch-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql, buildDealerRestrictionClause } from '../../shared/kpi/srs-kpi-dealer-filter'

@Injectable()
export class PunchKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getPunchKpis(filter: SrsKpiFilter, includeDeletedFixes = false): Promise<PunchKpiDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)

    const totals = await this.srs.query(
      `SELECT COUNT(*)                                  AS totalPunches,
              SUM(t.err IN (1, 2, 3))                   AS errorsTotal,
              SUM(t.err = 1)                            AS missingPunchOut,
              SUM(t.err = 2)                            AS missingBreakEnd,
              SUM(t.manual)                             AS manualPunches,
              ROUND(100 * SUM(t.err IN (1, 2, 3)) / NULLIF(COUNT(*), 0), 1) AS errorRatePct
       FROM (
         SELECT TTK_PUNCH_WITH_ERROR_V2(tew.id, '') err,
                IFNULL(tew.manual_create, 0) = 1       manual
         FROM TTK_EMPLOYEE_WORK tew
         ${ttk.join}
         WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
           ${ttk.and}
           AND DATE(tew.punch_in) BETWEEN ? AND ?
       ) t`,
      [idDealerProvider, ...ttk.params, fechaDesde, fechaHasta],
    )

    // `adminCorrections` sale del ledger, no de `tew.fixed_at`: esa marca sólo se
    // pone cuando la ponchada queda sin NINGÚN error y se limpia al re-romperse.
    //
    // Va en consulta APARTE, no joineada al FROM de arriba: un join al ledger
    // multiplicaría `missingOut` y `manual` por la cantidad de eventos.
    // El dealer se resuelve sobre `f`, que es donde el ledger lo congela al corregir.
    const fixScope = buildDealerRestrictionClause(idUsuario, dealerIds, skipDealerRestriction)
    const deletedFixesSql = includeDeletedFixes ? '' : ' AND tew.estado = 1'
    const corrections = await this.srs.query(
      `SELECT COUNT(*) AS adminCorrections
       FROM TTK_PUNCH_ERROR_FIX f
       INNER JOIN TTK_EMPLOYEE_WORK tew
               ON tew.id = f.id_ttk_employee_work
              AND tew.id_dealer_provider = f.id_dealer_provider
       JOIN CONTRATISTA c ON c.id = f.id_dealer
       WHERE f.id_dealer_provider = ?${deletedFixesSql}
         ${fixScope.and}
         AND f.punch_date BETWEEN ? AND ?`,
      [idDealerProvider, ...fixScope.params, fechaDesde, fechaHasta],
    )

    const deleted = await this.srs.query(
      `SELECT COUNT(*) AS deletedPunches
       FROM TTK_EMPLOYEE_WORK tew
       ${ttk.join}
       WHERE tew.estado = 0 AND tew.id_dealer_provider = ?
         ${ttk.and}
         AND DATE(tew.punch_in) BETWEEN ? AND ?`,
      [idDealerProvider, ...ttk.params, fechaDesde, fechaHasta],
    )

    // Mide lo mismo —cuánto tardan en arreglar— pero por EVENTO y sin depender de que
    // la ponchada haya quedado 100% sana. El período se selecciona por `f.punch_date`,
    // igual que todo el resto del paquete.
    const delay = await this.srs.query(
      `SELECT ROUND(AVG(DATEDIFF(f.fixed_at, f.punch_date)), 1) AS avgCorrectionDelayDays
       FROM TTK_PUNCH_ERROR_FIX f
       INNER JOIN TTK_EMPLOYEE_WORK tew
               ON tew.id = f.id_ttk_employee_work
              AND tew.id_dealer_provider = f.id_dealer_provider
       JOIN CONTRATISTA c ON c.id = f.id_dealer
       WHERE f.id_dealer_provider = ?${deletedFixesSql}
         ${fixScope.and}
         AND f.punch_date BETWEEN ? AND ?`,
      [idDealerProvider, ...fixScope.params, fechaDesde, fechaHasta],
    )

    const t = totals[0] ?? {}

    return {
      totalPunches: Number(t.totalPunches ?? 0),
      errorRatePct: Number(t.errorRatePct ?? 0),
      missingPunchOut: Number(t.missingPunchOut ?? 0),
      missingBreakEnd: Number(t.missingBreakEnd ?? 0),
      manualPunches: Number(t.manualPunches ?? 0),
      adminCorrections: Number(corrections[0]?.adminCorrections ?? 0),
      avgCorrectionDelayDays: Number(delay[0]?.avgCorrectionDelayDays ?? 0),
      deletedPunches: Number(deleted[0]?.deletedPunches ?? 0),
    }
  }

  /**
   * Ranking de empleados con más ponchadas problemáticas.
   *
   * Tres cosas que esta consulta hacía mal y acá se arreglan:
   *
   * 1. **No podía ejecutarse.** `usuarios` no tiene `id` ni `apellido` (tiene
   *    `id_usuario` y `nombre`): daba `ERROR 1054 Unknown column 'u.apellido'`.
   *    Nunca se notó porque la pantalla `/kpis` usa datos mock y este endpoint no
   *    tiene ningún caller de frontend.
   * 2. **El nombre de dealer pelado** no cumple `dealer-display-name-by-provider`.
   * 3. **`corrected` se leía del estado actual, y eso miente**: un error corregido
   *    desaparece del estado, así que el empleado que más errores generó y más
   *    rápido se los arreglaron aparecía limpio. Ahora sale del registro de
   *    correcciones, y `total` lo incluye: es "ponchadas con incidencia vigente
   *    **o** con corrección registrada", las dos columnas sobre el mismo conjunto.
   *
   * El `LEFT JOIN` sobre un `SELECT DISTINCT` no multiplica filas aunque haya varios
   * eventos por ponchada, y deja `corrected` dentro del mismo `OR` que `total`: la
   * desigualdad `corrected <= total` se cumple por construcción, no por buena
   * voluntad. Cuenta PONCHADAS, a propósito distinto del card, que cuenta eventos.
   */
  async getOffenders(filter: SrsKpiFilter): Promise<any[]> {
    const dealerScope = buildDealerRestrictionClause(
      filter.idUsuario,
      filter.dealerIds,
      filter.skipDealerRestriction,
    )
    const rows = await this.srs.query(
      `SELECT u.id_usuario                                              AS idUsuario,
              u.nombre                                                  AS employee,
              GET_DEALER_NAME_BY_PROVIDER(?, c.id)                      AS dealer,
              SUM(tew.punch_out IS NULL AND tew.fecha < CURDATE())      AS missingOut,
              SUM(tew.manual_create = 1)                                AS manual,
              SUM(fx.corrected IS NOT NULL)                             AS corrected,
              SUM((tew.punch_out IS NULL AND tew.fecha < CURDATE())
                  OR tew.manual_create = 1
                  OR fx.corrected IS NOT NULL)                          AS total
       FROM TTK_EMPLOYEE_WORK tew
       JOIN usuarios u    ON u.id_usuario = tew.id_author
       JOIN CONTRATISTA c ON c.id         = tew.id_dealer
       LEFT JOIN (SELECT DISTINCT f.id_ttk_employee_work AS id, 1 AS corrected
                    FROM TTK_PUNCH_ERROR_FIX f
                   WHERE f.id_dealer_provider = ?
                     AND f.punch_date BETWEEN ? AND ?) fx ON fx.id = tew.id
       WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
         ${dealerScope.and}
         AND tew.fecha BETWEEN ? AND ?
       GROUP BY u.id_usuario, employee, dealer
       HAVING total > 0
       ORDER BY total DESC
       LIMIT 10`,
      [
        // El label de dealer y el subquery del ledger van en el SELECT / FROM:
        // sus binds preceden a los del WHERE exterior.
        filter.idDealerProvider,
        filter.idDealerProvider,
        filter.fechaDesde,
        filter.fechaHasta,
        filter.idDealerProvider,
        ...dealerScope.params,
        filter.fechaDesde,
        filter.fechaHasta,
      ],
    )
    return rows.map((r: any) => ({
      employee: r.employee,
      dealer: r.dealer,
      missingOut: Number(r.missingOut),
      manual: Number(r.manual),
      corrected: Number(r.corrected),
      total: Number(r.total),
    }))
  }
}
