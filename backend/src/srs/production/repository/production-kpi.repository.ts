import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { OPEN_WORKFLOW_STATUSES, WorkflowStatus } from '../entity/workflow.srsentity'
import { ProductionKpiDto, WoStatusSliceDto } from '../dto/production-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  buildDealerFilterSql,
  woCompletedPeriodColumn,
  woDoneAtJoinScoped,
  woPeriodColumn,
} from '../../shared/kpi/srs-kpi-dealer-filter'

@Injectable()
export class ProductionKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getProductionKpis(filter: SrsKpiFilter): Promise<ProductionKpiDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, filterDateDone } = filter
    const dealer = buildDealerFilterSql('invoice', idUsuario, dealerIds)
    const drDealer = buildDealerFilterSql('dailyReport', idUsuario, dealerIds)
    const woDate = woPeriodColumn(filterDateDone)
    const woCompletedDate = woCompletedPeriodColumn(filterDateDone)
    const doneJoin = woDoneAtJoinScoped(WorkflowStatus.DONE, filterDateDone)
    const invoicePeriodParams = [idDealerProvider, ...dealer.params, fechaDesde, fechaHasta]
    const doneJoinParams = [idDealerProvider, fechaDesde, fechaHasta]
    const completedParams = [...doneJoinParams, ...invoicePeriodParams]

    const [completedRows, valueParts, inspectionRows] = await Promise.all([
      this.srs.query(
        `SELECT
           COUNT(DISTINCT i.id) AS woCompleted,
           ROUND(
             AVG(
               CASE
                 WHEN done.done_at IS NOT NULL AND done.done_at >= i.fecha_alta
                 THEN TIMESTAMPDIFF(MINUTE, i.fecha_alta, done.done_at)
               END
             ) / 60,
             1
           ) AS avgCycleHours,
           ROUND(
             100 * SUM(
               i.promise_datetime IS NOT NULL
               AND done.done_at IS NOT NULL
               AND done.done_at <= i.promise_datetime
             ) / NULLIF(SUM(i.promise_datetime IS NOT NULL), 0),
             1
           ) AS onTimePct
         FROM INVOICE i
         ${dealer.join}
         ${doneJoin}
         WHERE i.estado = 1
           AND i.id_workflow = ${WorkflowStatus.DONE}
           AND i.id_dealer_provider = ?
           ${dealer.and}
           AND ${woCompletedDate} BETWEEN ? AND ?`,
        completedParams,
      ),
      this.loadProductionValueParts(
        idDealerProvider,
        idUsuario,
        dealerIds,
        dealer,
        drDealer,
        woDate,
        fechaDesde,
        fechaHasta,
      ),
      this.srs.query(
        `SELECT ROUND(100 * SUM(i.inspected = 0) / NULLIF(SUM(i.inspected IN (0, 1)), 0), 1) AS inspectionFailPct
         FROM INVOICE i
         ${dealer.join}
         WHERE i.estado = 1
           AND i.id_dealer_provider = ?
           ${dealer.and}
           AND DATE(i.inspected_date) BETWEEN ? AND ?`,
        invoicePeriodParams,
      ),
    ])

    const c = completedRows[0] ?? {}
    const ins = inspectionRows[0] ?? {}

    return {
      woCompleted: Number(c.woCompleted ?? 0),
      productionValue: valueParts,
      avgCycleHours: Number(c.avgCycleHours ?? 0),
      onTimePct: Number(c.onTimePct ?? 0),
      inspectionFailPct: Number(ins.inspectionFailPct ?? 0),
    }
  }

  private async loadProductionValueParts(
    idDealerProvider: number,
    idUsuario: number,
    dealerIds: number[],
    dealer: ReturnType<typeof buildDealerFilterSql>,
    drDealer: ReturnType<typeof buildDealerFilterSql>,
    woDate: string,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<number> {
    const dealerPlaceholders = dealerIds.map(() => '?').join(',')
    const stmtRestriction = ` AND RESTRICTION_DEALER_V2(?, c.id) = 1 AND c.id IN (${dealerPlaceholders})`
    const stmtParams = [idUsuario, ...dealerIds]
    const invoicePeriodParams = [idDealerProvider, ...dealer.params, fechaDesde, fechaHasta]
    const drParams = [idDealerProvider, ...drDealer.params, fechaDesde, fechaHasta]
    const stmtPeriodParams = [idDealerProvider, ...stmtParams, fechaDesde, fechaHasta]

    const [woRows, drRows, ttkRows, genRows] = await Promise.all([
      this.srs.query(
        `SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0) AS value
         FROM INVOICE i
         JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         ${dealer.join}
         WHERE i.estado = 1 AND i.id_dealer_provider = ?
           ${dealer.and}
           AND ${woDate} BETWEEN ? AND ?`,
        invoicePeriodParams,
      ),
      this.srs.query(
        `SELECT IFNULL(ROUND(SUM(GET_SERVICES_TOTAL_BY_DAILY_REPORT(ldr.id)), 2), 0) AS value
         FROM DAILY_REPORT ldr
         ${drDealer.join}
         WHERE ldr.id_dealer_provider = ?
           ${drDealer.and}
           AND DATE(ldr.fecha_desde) BETWEEN ? AND ?`,
        drParams,
      ),
      this.srs.query(
        `SELECT IFNULL(SUM(GET_TOTAL_BY_STATEMENT(invs.id, invs.discount, NULL, invs.discount_type, NULL)), 0) AS value
         FROM INVOICE_STATEMENT invs
         JOIN CONTRATISTA c ON c.id = invs.id_dealer
         WHERE invs.estado = 1 AND invs.statement_type = 5 AND invs.id_dealer_provider = ?
           ${stmtRestriction}
           AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?`,
        stmtPeriodParams,
      ),
      this.srs.query(
        `SELECT IFNULL(SUM(
           IFNULL(CASE WHEN isir.id_employee_work IS NULL THEN isir.generic_qty ELSE 1 END, 0)
           * IFNULL(isir.amount, 0)
         ), 0) AS value
         FROM INVOICE_STATEMENT invs
         JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = invs.id
         JOIN CONTRATISTA c ON c.id = invs.id_dealer
         WHERE invs.estado = 1 AND invs.statement_type = 6 AND invs.id_dealer_provider = ?
           ${stmtRestriction}
           AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?`,
        stmtPeriodParams,
      ),
    ])

    return (
      Number(woRows[0]?.value ?? 0) +
      Number(drRows[0]?.value ?? 0) +
      Number(ttkRows[0]?.value ?? 0) +
      Number(genRows[0]?.value ?? 0)
    )
  }

  async getOpenPipeline(filter: SrsKpiFilter): Promise<WoStatusSliceDto[]> {
    const dealer = buildDealerFilterSql('invoice', filter.idUsuario, filter.dealerIds)
    const rows = await this.srs.query(
      `SELECT w.descripcion AS status, COUNT(*) AS count
       FROM INVOICE i
       JOIN WORKFLOW w ON w.id = i.id_workflow
       ${dealer.join}
       WHERE i.estado = 1
         AND i.id_workflow IN (${OPEN_WORKFLOW_STATUSES.join(',')})
         AND i.id_dealer_provider = ?
         ${dealer.and}
       GROUP BY w.id, w.descripcion
       ORDER BY w.ordenamiento`,
      [filter.idDealerProvider, ...dealer.params],
    )
    return rows.map((r: any) => ({ status: r.status, count: Number(r.count) }))
  }

  async getDealerProduction(filter: SrsKpiFilter): Promise<{ dealer: string; wos: number; value: number }[]> {
    const woDate = woPeriodColumn(filter.filterDateDone)
    const rows = await this.srs.query(
      `SELECT c.razon_social                                  AS dealer,
              COUNT(DISTINCT i.id)                             AS wos,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)   AS value
       FROM INVOICE i
       JOIN DEPARTMENT d  ON d.id = i.id_department
       JOIN CONTRATISTA c ON c.id = d.id_dealer
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         AND RESTRICTION_DEALER_V2(?, c.id) = 1
         AND c.id IN (${filter.dealerIds.map(() => '?').join(',')})
         AND ${woDate} BETWEEN ? AND ?
       GROUP BY c.id, c.razon_social
       ORDER BY value DESC`,
      [
        filter.idDealerProvider,
        filter.idUsuario,
        ...filter.dealerIds,
        filter.fechaDesde,
        filter.fechaHasta,
      ],
    )
    return rows.map((r: any) => ({ dealer: r.dealer, wos: Number(r.wos), value: Number(r.value) }))
  }
}
