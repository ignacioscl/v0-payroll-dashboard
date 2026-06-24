import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import { WO_STATEMENT_TYPES, statementTypesSqlIn } from '../entity/invoice-statement.srsentity'
import { BillingKpiDto } from '../dto/billing-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'

@Injectable()
export class BillingKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getBillingKpis(filter: SrsKpiFilter): Promise<BillingKpiDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta } = filter
    const stmt = buildDealerFilterSql('statement', idUsuario, dealerIds)
    const inv = buildDealerFilterSql('invoice', idUsuario, dealerIds)

    const invoiced = await this.srs.query(
      `SELECT COUNT(*)                                                                   AS statementsIssued,
              ROUND(IFNULL(SUM(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0), 2) AS invoicedValue,
              ROUND(IFNULL(AVG(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0))    AS avgInvoiceValue
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.fecha_desde >= ? AND s.fecha_hasta <= ?`,
      [idDealerProvider, ...stmt.params, fechaDesde, fechaHasta],
    )

    const unbilled = await this.srs.query(
      `SELECT COUNT(*) AS unbilledWos,
              ROUND(IFNULL(SUM((SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)
                                FROM INVOICE_SERVICE_REL isr WHERE isr.id_invoice = i.id)), 0), 2) AS unbilledValue
       FROM INVOICE i
       ${inv.join}
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         ${inv.and}
         AND DATE(i.date_last_chg_workflow) BETWEEN ? AND ?
         AND WO_IS_FULL_INVOICED(i.id) = 0`,
      [idDealerProvider, ...inv.params, fechaDesde, fechaHasta],
    )

    const lag = await this.srs.query(
      `SELECT ROUND(AVG(DATEDIFF(s.fecha_create, i.date_last_chg_workflow)), 1) AS avgDoneToInvoicedDays
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND r.id_invoice IS NOT NULL
       JOIN INVOICE i ON i.id = r.id_invoice
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.fecha_desde >= ? AND s.fecha_hasta <= ?`,
      [idDealerProvider, ...stmt.params, fechaDesde, fechaHasta],
    )

    const sent = await this.srs.query(
      `SELECT ROUND(100 * SUM(s.sended = 1) / NULLIF(COUNT(*), 0), 1) AS sentPct,
              SUM(s.sended = 0)                                       AS unsentStatements
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.fecha_desde >= ? AND s.fecha_hasta <= ?`,
      [idDealerProvider, ...stmt.params, fechaDesde, fechaHasta],
    )

    const partialOverlap = await this.srs.query(
      `SELECT COUNT(*) AS partialOverlapWoStatements
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.statement_type IN (${statementTypesSqlIn(WO_STATEMENT_TYPES)})
         AND s.fecha_desde <= ? AND s.fecha_hasta >= ?
         AND (s.fecha_desde < ? OR s.fecha_hasta > ?)`,
      [idDealerProvider, ...stmt.params, fechaHasta, fechaDesde, fechaDesde, fechaHasta],
    )

    const i = invoiced[0] ?? {}
    const u = unbilled[0] ?? {}
    const l = lag[0] ?? {}
    const s = sent[0] ?? {}
    const po = partialOverlap[0] ?? {}

    return {
      invoicedValue: Number(i.invoicedValue ?? 0),
      statementsIssued: Number(i.statementsIssued ?? 0),
      avgInvoiceValue: Number(i.avgInvoiceValue ?? 0),
      unbilledWos: Number(u.unbilledWos ?? 0),
      unbilledValue: Number(u.unbilledValue ?? 0),
      avgDoneToInvoicedDays: Number(l.avgDoneToInvoicedDays ?? 0),
      sentPct: Number(s.sentPct ?? 0),
      unsentStatements: Number(s.unsentStatements ?? 0),
      partialOverlapWoStatements: Number(po.partialOverlapWoStatements ?? 0),
    }
  }

  async getUnbilledAging(filter: SrsKpiFilter): Promise<{ bucket: string; wos: number; value: number }[]> {
    const inv = buildDealerFilterSql('invoice', filter.idUsuario, filter.dealerIds)
    const doneSub = `
      SELECT lw.id_work_order, MAX(lw.fecha) done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw
      WHERE lw.id_workflow = ${WorkflowStatus.DONE}
      GROUP BY lw.id_work_order`
    const rows = await this.srs.query(
      `SELECT CASE WHEN DATEDIFF(NOW(), done.done_at) <= 7  THEN '0-7 days'
                   WHEN DATEDIFF(NOW(), done.done_at) <= 14 THEN '8-14 days'
                   WHEN DATEDIFF(NOW(), done.done_at) <= 30 THEN '15-30 days'
                   ELSE '31+ days' END                              AS bucket,
              COUNT(DISTINCT i.id)                                  AS wos,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)        AS value
       FROM INVOICE i
       JOIN (${doneSub}) done ON done.id_work_order = i.id
       ${inv.join}
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       LEFT JOIN INVOICE_STATEMENT_INV_REL stl ON stl.id_invoice = i.id
       LEFT JOIN INVOICE_STATEMENT st ON st.id = stl.id_statement AND st.estado = 1
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         ${inv.and}
         AND st.id IS NULL
       GROUP BY bucket`,
      [filter.idDealerProvider, ...inv.params],
    )
    return rows.map((r: any) => ({ bucket: r.bucket, wos: Number(r.wos), value: Number(r.value) }))
  }
}
