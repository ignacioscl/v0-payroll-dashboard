import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import { BillingKpiDto } from '../dto/billing-kpi.dto'

/**
 * DAO de KPIs de billing (INVOICE_STATEMENT) contra la base legacy SRS (read-only).
 * Toda query filtrada por `idDealerProvider` (tenant). Solo acceso a datos.
 */
@Injectable()
export class BillingKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  // Valor de un statement: líneas con amount valen generic_qty*amount; las que apuntan
  // a una WO valen la suma de sus servicios. Se excluye only_timecard.
  private readonly statementValueSub = `
    SELECT r.id_statement,
           SUM(CASE WHEN r.amount IS NOT NULL THEN IFNULL(r.generic_qty, 1) * r.amount
                    ELSE (SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)
                          FROM INVOICE_SERVICE_REL isr WHERE isr.id_invoice = r.id_invoice) END) value
    FROM INVOICE_STATEMENT_INV_REL r
    WHERE r.only_timecard = 0
    GROUP BY r.id_statement`

  private readonly doneSub = `
    SELECT lw.id_work_order, MAX(lw.fecha) done_at
    FROM LOG_WO_WORKFLOW_CHANGE lw
    WHERE lw.id_workflow = ${WorkflowStatus.DONE}
    GROUP BY lw.id_work_order`

  async getBillingKpis(
    idDealerProvider: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<BillingKpiDto> {
    // 2.1 Invoiced $ / Statements / Avg — valor real del statement = GET_TOTAL_BY_STATEMENT
    // (aplica discount/discount_type/tax, igual que el billing legacy). Fecha = día completo.
    // Validado contra la base (prov 79 may-2025 => $1.835.188,15).
    const invoiced = await this.srs.query(
      `SELECT COUNT(*)                                                                   AS statementsIssued,
              ROUND(IFNULL(SUM(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0), 2) AS invoicedValue,
              ROUND(IFNULL(AVG(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0))    AS avgInvoiceValue
       FROM INVOICE_STATEMENT s
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         AND s.fecha_create >= ? AND s.fecha_create < DATE_ADD(?, INTERVAL 1 DAY)`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // 2.2 Done, not invoiced (unbilled) — WOs Done en el período no totalmente
    // facturadas, vía WO_IS_FULL_INVOICED (función del legacy). Sin fan-out.
    // Validado contra la base (prov 79 may-2025 => 4.130 WOs / $10.049,43).
    const unbilled = await this.srs.query(
      `SELECT COUNT(*) AS unbilledWos,
              ROUND(IFNULL(SUM((SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)
                                FROM INVOICE_SERVICE_REL isr WHERE isr.id_invoice = i.id)), 0), 2) AS unbilledValue
       FROM INVOICE i
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         AND DATE(i.date_last_chg_workflow) BETWEEN ? AND ?
         AND WO_IS_FULL_INVOICED(i.id) = 0`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // 2.3 Avg días WO Done -> Invoiced (done = date_last_chg_workflow)
    const lag = await this.srs.query(
      `SELECT ROUND(AVG(DATEDIFF(s.fecha_create, i.date_last_chg_workflow)), 1) AS avgDoneToInvoicedDays
       FROM INVOICE_STATEMENT s
       JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND r.id_invoice IS NOT NULL
       JOIN INVOICE i ON i.id = r.id_invoice
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         AND s.fecha_create >= ? AND s.fecha_create < DATE_ADD(?, INTERVAL 1 DAY)`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // 2.4 Sent %
    const sent = await this.srs.query(
      `SELECT ROUND(100 * SUM(s.sended = 1) / NULLIF(COUNT(*), 0), 1) AS sentPct,
              SUM(s.sended = 0)                                       AS unsentStatements
       FROM INVOICE_STATEMENT s
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         AND s.fecha_create >= ? AND s.fecha_create < DATE_ADD(?, INTERVAL 1 DAY)`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    const i = invoiced[0] ?? {}
    const u = unbilled[0] ?? {}
    const l = lag[0] ?? {}
    const s = sent[0] ?? {}

    return {
      invoicedValue: Number(i.invoicedValue ?? 0),
      statementsIssued: Number(i.statementsIssued ?? 0),
      avgInvoiceValue: Number(i.avgInvoiceValue ?? 0),
      unbilledWos: Number(u.unbilledWos ?? 0),
      unbilledValue: Number(u.unbilledValue ?? 0),
      avgDoneToInvoicedDays: Number(l.avgDoneToInvoicedDays ?? 0),
      sentPct: Number(s.sentPct ?? 0),
      unsentStatements: Number(s.unsentStatements ?? 0),
    }
  }

  /** 2.2 Aging de WOs Done sin facturar, por bucket. */
  async getUnbilledAging(
    idDealerProvider: number,
  ): Promise<{ bucket: string; wos: number; value: number }[]> {
    const rows = await this.srs.query(
      `SELECT CASE WHEN DATEDIFF(NOW(), done.done_at) <= 7  THEN '0-7 days'
                   WHEN DATEDIFF(NOW(), done.done_at) <= 14 THEN '8-14 days'
                   WHEN DATEDIFF(NOW(), done.done_at) <= 30 THEN '15-30 days'
                   ELSE '31+ days' END                              AS bucket,
              COUNT(DISTINCT i.id)                                  AS wos,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)        AS value
       FROM INVOICE i
       JOIN (${this.doneSub}) done ON done.id_work_order = i.id
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       LEFT JOIN INVOICE_STATEMENT_INV_REL stl ON stl.id_invoice = i.id
       LEFT JOIN INVOICE_STATEMENT st ON st.id = stl.id_statement AND st.estado = 1
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         AND st.id IS NULL
       GROUP BY bucket`,
      [idDealerProvider],
    )
    return rows.map((r: any) => ({ bucket: r.bucket, wos: Number(r.wos), value: Number(r.value) }))
  }
}
