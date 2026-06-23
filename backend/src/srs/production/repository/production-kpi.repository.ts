import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { OPEN_WORKFLOW_STATUSES, WorkflowStatus } from '../entity/workflow.srsentity'
import { ProductionKpiDto, WoStatusSliceDto } from '../dto/production-kpi.dto'

/**
 * DAO de KPIs de producción contra la base LEGACY de SRS (solo lectura).
 *
 *  - SOLO acceso a datos. Nada de lógica de negocio.
 *  - TODA query nace filtrada por `idDealerProvider` (tenant). El provider NO se
 *    recibe del cliente: lo inyecta el service desde request.user.
 *  - Subquery `done` = fecha en que cada WO pasó a Done (workflow 7). El filtro de
 *    tenant se empuja vía el JOIN con INVOICE (que sí lo tiene).
 */
@Injectable()
export class ProductionKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  /** WOs completadas + valor + ciclo + on-time del período (KPIs 1.1-1.7). */
  async getProductionKpis(
    idDealerProvider: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<ProductionKpiDto> {
    // "Done en el período" = date_last_chg_workflow (misma columna que usa production.php),
    // no la fecha del LOG. Validado contra la base (prov 79 may-2025 => 22.093 WOs).
    const completedRows = await this.srs.query(
      `SELECT
         COUNT(DISTINCT i.id)                                            AS woCompleted,
         ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.fecha_alta, i.date_last_chg_workflow)) / 60, 1) AS avgCycleHours,
         ROUND(100 * SUM(i.promise_datetime IS NOT NULL AND i.date_last_chg_workflow <= i.promise_datetime)
               / NULLIF(SUM(i.promise_datetime IS NOT NULL), 0), 1)     AS onTimePct
       FROM INVOICE i
       WHERE i.estado = 1
         AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         AND DATE(i.date_last_chg_workflow) BETWEEN ? AND ?`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // Production value = 3 buckets del reporte legacy (production.php / ProductionReportDao):
    //   B1 servicios de WO (por date_last_chg_workflow) + DAILY_REPORT
    //   B2 statements TTK (statement_type=5, GET_TOTAL_BY_STATEMENT con descuento)
    //   B3 genéricos (statement_type=6)
    // Validado 1:1 contra la base (prov 79, may-2025 => 1.640.631,60).
    const valueRows = await this.srs.query(
      `SELECT
         ( IFNULL((SELECT SUM(isr.price * IFNULL(isr.qty, 1))
                   FROM INVOICE_SERVICE_REL isr
                   JOIN INVOICE i ON i.id = isr.id_invoice
                   WHERE i.estado = 1 AND i.id_dealer_provider = ?
                     AND DATE(i.date_last_chg_workflow) BETWEEN ? AND ?), 0)
         + IFNULL((SELECT ROUND(SUM(GET_SERVICES_TOTAL_BY_DAILY_REPORT(ldr.id)), 2)
                   FROM DAILY_REPORT ldr
                   WHERE ldr.id_dealer_provider = ?
                     AND DATE(ldr.fecha_desde) BETWEEN ? AND ?), 0)
         + IFNULL((SELECT SUM(GET_TOTAL_BY_STATEMENT(invs.id, invs.discount, NULL, invs.discount_type, NULL))
                   FROM INVOICE_STATEMENT invs
                   WHERE invs.estado = 1 AND invs.statement_type = 5 AND invs.id_dealer_provider = ?
                     AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?), 0)
         + IFNULL((SELECT SUM(IFNULL(CASE WHEN isir.id_employee_work IS NULL THEN isir.generic_qty ELSE 1 END, 0)
                              * IFNULL(isir.amount, 0))
                   FROM INVOICE_STATEMENT invs
                   JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = invs.id
                   WHERE invs.estado = 1 AND invs.statement_type = 6 AND invs.id_dealer_provider = ?
                     AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?), 0)
         ) AS productionValue`,
      [
        idDealerProvider, fechaDesde, fechaHasta,
        idDealerProvider, fechaDesde, fechaHasta,
        idDealerProvider, fechaDesde, fechaHasta,
        idDealerProvider, fechaDesde, fechaHasta,
      ],
    )

    const backlogRows = await this.srs.query(
      `SELECT
         COUNT(*)                                          AS openBacklog,
         SUM(i.fecha_alta < NOW() - INTERVAL 7 DAY)        AS backlogOver7d
       FROM INVOICE i
       WHERE i.estado = 1
         AND i.id_workflow IN (${OPEN_WORKFLOW_STATUSES.join(',')})
         AND i.id_dealer_provider = ?`,
      [idDealerProvider],
    )

    const approvalRows = await this.srs.query(
      `SELECT
         SUM(i.approved = 0)                                              AS pendingApproval,
         ROUND(AVG(CASE WHEN i.approved = 1 AND i.approved_date BETWEEN ? AND ?
                        THEN TIMESTAMPDIFF(MINUTE, i.fecha_alta, i.approved_date) END) / 60, 1)
                                                                          AS avgApprovalHours
       FROM INVOICE i
       WHERE i.estado = 1
         AND i.id_dealer_provider = ?`,
      [fechaDesde, fechaHasta, idDealerProvider],
    )

    const inspectionRows = await this.srs.query(
      `SELECT ROUND(100 * SUM(i.inspected = 0) / NULLIF(SUM(i.inspected IN (0, 1)), 0), 1) AS inspectionFailPct
       FROM INVOICE i
       WHERE i.estado = 1
         AND i.id_dealer_provider = ?
         AND i.inspected_date BETWEEN ? AND ?`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    const c = completedRows[0] ?? {}
    const v = valueRows[0] ?? {}
    const b = backlogRows[0] ?? {}
    const a = approvalRows[0] ?? {}
    const ins = inspectionRows[0] ?? {}

    return {
      woCompleted: Number(c.woCompleted ?? 0),
      productionValue: Number(v.productionValue ?? 0),
      avgCycleHours: Number(c.avgCycleHours ?? 0),
      onTimePct: Number(c.onTimePct ?? 0),
      openBacklog: Number(b.openBacklog ?? 0),
      backlogOver7d: Number(b.backlogOver7d ?? 0),
      pendingApproval: Number(a.pendingApproval ?? 0),
      avgApprovalHours: Number(a.avgApprovalHours ?? 0),
      inspectionFailPct: Number(ins.inspectionFailPct ?? 0),
    }
  }

  /** 1.5 pipeline de WOs abiertas por estado (para el gráfico de torta). */
  async getOpenPipeline(idDealerProvider: number): Promise<WoStatusSliceDto[]> {
    const rows = await this.srs.query(
      `SELECT w.descripcion AS status, COUNT(*) AS count
       FROM INVOICE i
       JOIN WORKFLOW w ON w.id = i.id_workflow
       WHERE i.estado = 1
         AND i.id_workflow IN (${OPEN_WORKFLOW_STATUSES.join(',')})
         AND i.id_dealer_provider = ?
       GROUP BY w.id, w.descripcion
       ORDER BY w.ordenamiento`,
      [idDealerProvider],
    )
    return rows.map((r: any) => ({ status: r.status, count: Number(r.count) }))
  }

  /**
   * 1.8 Producción por dealer (tabla): WOs + valor del período.
   * Filtra por provider Y por los dealers permitidos al usuario
   * (RESTRICTION_DEALER_V2, función que ya vive en la base).
   */
  async getDealerProduction(
    idDealerProvider: number,
    idUsuario: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<{ dealer: string; wos: number; value: number }[]> {
    const rows = await this.srs.query(
      `SELECT c.razon_social                                  AS dealer,
              COUNT(DISTINCT i.id)                             AS wos,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)   AS value
       FROM INVOICE i
       JOIN DEPARTMENT d  ON d.id = i.id_department
       JOIN CONTRATISTA c ON c.id = d.id_dealer
       JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
             FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = ${WorkflowStatus.DONE}
             GROUP BY lw.id_work_order) done ON done.id_work_order = i.id
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         AND RESTRICTION_DEALER_V2(?, c.id) = 1
         AND done.done_at BETWEEN ? AND ?
       GROUP BY c.id, c.razon_social
       ORDER BY value DESC`,
      [idDealerProvider, idUsuario, fechaDesde, fechaHasta],
    )
    return rows.map((r: any) => ({ dealer: r.dealer, wos: Number(r.wos), value: Number(r.value) }))
  }
}
