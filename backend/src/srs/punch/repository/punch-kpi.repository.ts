import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { PunchKpiDto } from '../dto/punch-kpi.dto'

/**
 * DAO de KPIs de calidad de ponchadas (TTK_EMPLOYEE_WORK) contra la base legacy SRS.
 * Read-only, filtrado por `idDealerProvider` (tenant). Excluye días en curso
 * (`fecha < CURDATE()`) al medir punch-out / break-end faltantes.
 */
@Injectable()
export class PunchKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getPunchKpis(
    idDealerProvider: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<PunchKpiDto> {
    // 4.1 Totales + error rate. El error lo define la función del legacy
    // TTK_PUNCH_WITH_ERROR_V2 (1=clockout, 2=break, 3=20h+). NO se filtra CURDATE.
    // Fecha por DATE(punch_in) (igual que TTKEmployeeDao). Validado contra la base
    // (prov 79 may-2025 => 12.117 punches / 4.694 errores / clockout 2 / break 4.692).
    const totals = await this.srs.query(
      `SELECT COUNT(*)                                  AS totalPunches,
              SUM(t.err IN (1, 2, 3))                   AS errorsTotal,
              SUM(t.err = 1)                            AS missingPunchOut,
              SUM(t.err = 2)                            AS missingBreakEnd,
              SUM(t.manual)                             AS manualPunches,
              SUM(t.fixed)                              AS adminCorrections,
              ROUND(100 * SUM(t.err IN (1, 2, 3)) / NULLIF(COUNT(*), 0), 1) AS errorRatePct
       FROM (
         SELECT TTK_PUNCH_WITH_ERROR_V2(tew.id, '') err,
                IFNULL(tew.manual_create, 0) = 1       manual,
                tew.fixed_at IS NOT NULL               fixed
         FROM TTK_EMPLOYEE_WORK tew
         WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
           AND DATE(tew.punch_in) BETWEEN ? AND ?
       ) t`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // 4.2 Deleted punches (estado = 0)
    const deleted = await this.srs.query(
      `SELECT COUNT(*) AS deletedPunches
       FROM TTK_EMPLOYEE_WORK tew
       WHERE tew.estado = 0 AND tew.id_dealer_provider = ?
         AND DATE(tew.punch_in) BETWEEN ? AND ?`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // 4.3 Correction delay (ponchada -> fix)
    const delay = await this.srs.query(
      `SELECT ROUND(AVG(DATEDIFF(tew.fixed_at, tew.punch_in)), 1) AS avgCorrectionDelayDays
       FROM TTK_EMPLOYEE_WORK tew
       WHERE tew.estado = 1 AND tew.fixed_at IS NOT NULL AND tew.id_dealer_provider = ?
         AND DATE(tew.fixed_at) BETWEEN ? AND ?`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    const t = totals[0] ?? {}

    return {
      totalPunches: Number(t.totalPunches ?? 0),
      errorRatePct: Number(t.errorRatePct ?? 0),
      missingPunchOut: Number(t.missingPunchOut ?? 0),
      missingBreakEnd: Number(t.missingBreakEnd ?? 0),
      manualPunches: Number(t.manualPunches ?? 0),
      adminCorrections: Number(t.adminCorrections ?? 0),
      avgCorrectionDelayDays: Number(delay[0]?.avgCorrectionDelayDays ?? 0),
      deletedPunches: Number(deleted[0]?.deletedPunches ?? 0),
    }
  }

  /**
   * 4.4 Reincidentes (top 10). Filtra por provider Y por los dealers permitidos
   * al usuario (RESTRICTION_DEALER_V2, función ya existente en la base).
   */
  async getOffenders(
    idDealerProvider: number,
    idUsuario: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<any[]> {
    const rows = await this.srs.query(
      `SELECT CONCAT(u.nombre, ' ', u.apellido)                         AS employee,
              c.razon_social                                            AS dealer,
              SUM(tew.punch_out IS NULL AND tew.fecha < CURDATE())      AS missingOut,
              SUM(tew.manual_create = 1)                                AS manual,
              SUM(tew.fixed_at IS NOT NULL)                             AS corrected,
              SUM((tew.punch_out IS NULL AND tew.fecha < CURDATE())
                  OR tew.manual_create = 1
                  OR tew.fixed_at IS NOT NULL)                          AS total
       FROM TTK_EMPLOYEE_WORK tew
       JOIN usuarios u    ON u.id = tew.id_author
       JOIN CONTRATISTA c ON c.id = tew.id_dealer
       WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
         AND RESTRICTION_DEALER_V2(?, c.id) = 1
         AND tew.fecha BETWEEN ? AND ?
       GROUP BY u.id, employee, dealer
       HAVING total > 0
       ORDER BY total DESC
       LIMIT 10`,
      [idDealerProvider, idUsuario, fechaDesde, fechaHasta],
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
