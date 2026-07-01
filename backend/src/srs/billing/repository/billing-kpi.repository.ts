import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import {
  StatementType,
  WO_STATEMENT_TYPES,
  statementTypesSqlIn,
} from '../entity/invoice-statement.srsentity'
import {
  BillingKpiDto,
  BillingWeekRowDto,
  UnbilledAgingBucketDto,
  UnbilledDealerRowDto,
} from '../dto/billing-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  buildDealerFilterSql,
  mysqlWeekBucketStartExpr,
} from '../../shared/kpi/srs-kpi-dealer-filter'
import { fillWeeklyGaps } from '../../shared/kpi/srs-kpi-week'

/** Ventana hacia atrás para WOs Done sin facturar (aging / por dealer). */
export const UNBILLED_LOOKBACK_MONTHS = 6

@Injectable()
export class BillingKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getBillingKpis(filter: SrsKpiFilter): Promise<BillingKpiDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const stmt = buildDealerFilterSql('statement', idUsuario, dealerIds, skipDealerRestriction)
    const inv = buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction)
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
    const stmtPeriodParams = [idDealerProvider, ...stmt.params, fechaDesde, fechaHasta]
    const invPeriodParams = [idDealerProvider, ...inv.params, fechaDesde, fechaHasta]
    const ttkPeriodParams = [idDealerProvider, ...ttk.params, fechaDesde, fechaHasta]

    const [
      invoiced,
      unbilled,
      lag,
      sent,
      partialOverlap,
      woInvoiced,
      ttkInvoiced,
      genericInvoiced,
    ] = await Promise.all([
      this.srs.query(
      `SELECT COUNT(*)                                                                   AS statementsIssued,
              ROUND(IFNULL(SUM(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0), 2) AS invoicedValue,
              ROUND(IFNULL(AVG(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0))    AS avgInvoiceValue
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.fecha_desde >= ? AND s.fecha_hasta <= ?`,
        stmtPeriodParams,
      ),
      this.srs.query(
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
        invPeriodParams,
      ),
      this.srs.query(
      `SELECT ROUND(AVG(DATEDIFF(s.fecha_create, i.date_last_chg_workflow)), 1) AS avgDoneToInvoicedDays
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND r.id_invoice IS NOT NULL
       JOIN INVOICE i ON i.id = r.id_invoice
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.fecha_desde >= ? AND s.fecha_hasta <= ?`,
        stmtPeriodParams,
      ),
      this.srs.query(
      `SELECT ROUND(100 * SUM(s.sended = 1) / NULLIF(COUNT(*), 0), 1) AS sentPct,
              SUM(s.sended = 0)                                       AS unsentStatements
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.fecha_desde >= ? AND s.fecha_hasta <= ?`,
        stmtPeriodParams,
      ),
      this.srs.query(
      `SELECT COUNT(*) AS partialOverlapWoStatements
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.statement_type IN (${statementTypesSqlIn(WO_STATEMENT_TYPES)})
         AND s.fecha_desde <= ? AND s.fecha_hasta >= ?
         AND (s.fecha_desde < ? OR s.fecha_hasta > ?)`,
        [idDealerProvider, ...stmt.params, fechaHasta, fechaDesde, fechaDesde, fechaHasta],
      ),
      this.srs.query(
        `SELECT ROUND(IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0), 2) AS woInvoicedValue,
                ROUND(IFNULL(SUM(
                  CASE WHEN s.fecha_desde >= ? AND s.fecha_hasta <= ?
                  THEN isr.price * IFNULL(isr.qty, 1) ELSE 0 END
                ), 0), 2) AS woInvoicedInRangeValue
         FROM INVOICE i
         ${inv.join}
         JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         JOIN INVOICE_STATEMENT_INV_REL r ON r.id_invoice = i.id
           AND r.id_invoice_service = isr.id_service_invoice
           AND IFNULL(r.only_timecard, 0) = 0
         JOIN INVOICE_STATEMENT s ON s.id = r.id_statement AND s.estado = 1
           AND s.statement_type IN (${statementTypesSqlIn(WO_STATEMENT_TYPES)})
         WHERE i.estado = 1 AND i.id_dealer_provider = ?
           ${inv.and}
           AND DATE(i.date_last_chg_workflow) BETWEEN ? AND ?`,
        [fechaDesde, fechaHasta, ...invPeriodParams],
      ),
      this.srs.query(
        `SELECT ROUND(IFNULL(SUM(isir.amount), 0), 2) AS ttkInvoicedValue,
                ROUND(IFNULL(SUM(
                  CASE WHEN s.fecha_desde >= ? AND s.fecha_hasta <= ?
                  THEN isir.amount ELSE 0 END
                ), 0), 2) AS ttkInvoicedInRangeValue
         FROM TTK_EMPLOYEE_WORK tew
         ${ttk.join}
         JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_employee_work = tew.id
           AND IFNULL(isir.only_timecard, 0) = 0
         JOIN INVOICE_STATEMENT s ON s.id = isir.id_statement AND s.estado = 1
           AND s.statement_type = ${StatementType.TTK}
         WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
           ${ttk.and}
           AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)`,
        [fechaDesde, fechaHasta, ...ttkPeriodParams],
      ),
      this.srs.query(
        `SELECT ROUND(IFNULL(SUM(
           GET_TOTAL_INV_GENERIC_DATE_RAGE(isir.generic_qty, s.fecha_desde, s.fecha_hasta, isir.amount, ?, ?)
         ), 0), 2) AS genericInvoicedValue,
                ROUND(IFNULL(SUM(
                  CASE WHEN s.fecha_desde >= ? AND s.fecha_hasta <= ?
                  THEN GET_TOTAL_INV_GENERIC_DATE_RAGE(isir.generic_qty, s.fecha_desde, s.fecha_hasta, isir.amount, ?, ?)
                  ELSE 0 END
                ), 0), 2) AS genericInvoicedInRangeValue
         FROM INVOICE_STATEMENT s
         ${stmt.join}
         JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
           AND IFNULL(isir.only_timecard, 0) = 0
         WHERE s.estado = 1 AND s.statement_type = ${StatementType.GENERIC}
           AND s.id_dealer_provider = ?
           ${stmt.and}
           AND (
             ? BETWEEN s.fecha_desde AND s.fecha_hasta
             OR ? BETWEEN s.fecha_desde AND s.fecha_hasta
             OR (s.fecha_desde >= ? AND s.fecha_hasta <= DATE_ADD(?, INTERVAL 1 DAY))
           )`,
        [
          fechaDesde,
          fechaHasta,
          fechaDesde,
          fechaHasta,
          fechaDesde,
          fechaHasta,
          idDealerProvider,
          ...stmt.params,
          fechaDesde,
          fechaHasta,
          fechaDesde,
          fechaHasta,
        ],
      ),
    ])

    const i = invoiced[0] ?? {}
    const u = unbilled[0] ?? {}
    const l = lag[0] ?? {}
    const s = sent[0] ?? {}
    const po = partialOverlap[0] ?? {}
    const wo = woInvoiced[0] ?? {}
    const ttkRow = ttkInvoiced[0] ?? {}
    const gen = genericInvoiced[0] ?? {}

    const woTotal = Number(wo.woInvoicedValue ?? 0)
    const woInRange = Number(wo.woInvoicedInRangeValue ?? 0)
    const ttkTotal = Number(ttkRow.ttkInvoicedValue ?? 0)
    const ttkInRange = Number(ttkRow.ttkInvoicedInRangeValue ?? 0)
    const genTotal = Number(gen.genericInvoicedValue ?? 0)
    const genInRange = Number(gen.genericInvoicedInRangeValue ?? 0)

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
      woInvoicedValue: woTotal,
      woInvoicedInRangeValue: woInRange,
      woInvoicedOutsideRangeValue: this.splitOutside(woTotal, woInRange),
      ttkInvoicedValue: ttkTotal,
      ttkInvoicedInRangeValue: ttkInRange,
      ttkInvoicedOutsideRangeValue: this.splitOutside(ttkTotal, ttkInRange),
      genericInvoicedValue: genTotal,
      genericInvoicedInRangeValue: genInRange,
      genericInvoicedOutsideRangeValue: this.splitOutside(genTotal, genInRange),
    }
  }

  private splitOutside(total: number, inRange: number): number {
    return Math.round(Math.max(0, total - inRange) * 100) / 100
  }

  async getUnbilledAging(filter: SrsKpiFilter): Promise<UnbilledAgingBucketDto[]> {
    const inv = buildDealerFilterSql('invoice', filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    // WO en workflow DONE → i.date_last_chg_workflow ES la fecha de paso a Done (sin LOG).
    // Solo backlog de los últimos N meses + NOT EXISTS (filtra a las no facturadas antes
    // de traer las service lines; evita materializar el join sobre las WO ya facturadas).
    const rows = await this.srs.query(
      `SELECT CASE WHEN DATEDIFF(NOW(), DATE(i.date_last_chg_workflow)) <= 7  THEN '0-7 days'
                   WHEN DATEDIFF(NOW(), DATE(i.date_last_chg_workflow)) <= 14 THEN '8-14 days'
                   WHEN DATEDIFF(NOW(), DATE(i.date_last_chg_workflow)) <= 30 THEN '15-30 days'
                   ELSE '31+ days' END                              AS bucket,
              COUNT(DISTINCT i.id)                                  AS wos,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)        AS value
       FROM INVOICE i
       ${inv.join}
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         ${inv.and}
         AND DATE(i.date_last_chg_workflow) >= DATE_SUB(CURDATE(), INTERVAL ${UNBILLED_LOOKBACK_MONTHS} MONTH)
         AND NOT EXISTS (
           SELECT 1 FROM INVOICE_STATEMENT_INV_REL stl
           JOIN INVOICE_STATEMENT st ON st.id = stl.id_statement AND st.estado = 1
           WHERE stl.id_invoice = i.id
         )
       GROUP BY bucket`,
      [filter.idDealerProvider, ...inv.params],
    )
    return rows.map((r: any) => ({ bucket: r.bucket, wos: Number(r.wos), value: Number(r.value) }))
  }

  async getBillingByWeek(filter: SrsKpiFilter): Promise<BillingWeekRowDto[]> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const stmt = buildDealerFilterSql('statement', idUsuario, dealerIds, skipDealerRestriction)
    const weekStart = mysqlWeekBucketStartExpr('DATE(s.fecha_desde)')
    const rows = await this.srs.query(
      `SELECT ${weekStart} AS weekStart,
              ROUND(IFNULL(SUM(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0), 2) AS invoicedValue
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND s.fecha_desde >= ? AND s.fecha_hasta <= ?
       GROUP BY weekStart
       ORDER BY weekStart`,
      [fechaDesde, idDealerProvider, ...stmt.params, fechaDesde, fechaHasta],
    )
    const mapped: BillingWeekRowDto[] = rows.map((r: any) => ({
      weekStart: String(r.weekStart).slice(0, 10),
      invoicedValue: Number(r.invoicedValue ?? 0),
    }))
    return fillWeeklyGaps(mapped, fechaDesde, fechaHasta, (weekStart) => ({
      weekStart,
      invoicedValue: 0,
    }))
  }

  async getUnbilledByDealer(filter: SrsKpiFilter): Promise<UnbilledDealerRowDto[]> {
    const inv = buildDealerFilterSql('invoice', filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    // Igual que el aging: WO en DONE → date_last_chg_workflow es la fecha de Done (sin LOG),
    // backlog de los últimos N meses, anti-join con NOT EXISTS.
    const rows = await this.srs.query(
      `SELECT GET_DEALER_NAME_BY_PROVIDER(?, c.id)                  AS dealer,
              COUNT(DISTINCT i.id)                                  AS wos,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)        AS value,
              MAX(DATEDIFF(NOW(), DATE(i.date_last_chg_workflow)))  AS oldestDays
       FROM INVOICE i
       ${inv.join}
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         ${inv.and}
         AND DATE(i.date_last_chg_workflow) >= DATE_SUB(CURDATE(), INTERVAL ${UNBILLED_LOOKBACK_MONTHS} MONTH)
         AND NOT EXISTS (
           SELECT 1 FROM INVOICE_STATEMENT_INV_REL stl
           JOIN INVOICE_STATEMENT st ON st.id = stl.id_statement AND st.estado = 1
           WHERE stl.id_invoice = i.id
         )
       GROUP BY c.id
       ORDER BY value DESC`,
      [filter.idDealerProvider, filter.idDealerProvider, ...inv.params],
    )
    return rows.map((r: any) => ({
      dealer: r.dealer,
      wos: Number(r.wos),
      value: Number(r.value),
      oldestDays: Number(r.oldestDays ?? 0),
    }))
  }
}
