import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { CollectionsByMonthRowDto } from '../dto/collections-by-month.dto'
import { CollectionsKpiDto } from '../dto/collections-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql, buildDealerRestrictionClause } from '../../shared/kpi/srs-kpi-dealer-filter'
import {
  buildMonthWindow,
  fillMonthlyGaps,
  monthEndInclusive,
  parseHistoryMonths,
} from '../../shared/kpi/srs-kpi-month'
import {
  applyZeroFilter,
  statementHasPositiveTotalSql,
  woServiceLinePositiveSql,
} from '../../shared/kpi/srs-kpi-zero-filter'
import { billedJoinsSql, woServiceNotInvoicedSql } from '../../shared/kpi/srs-kpi-generic'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import {
  WO_STATEMENT_TYPES,
  statementTypesSqlIn,
} from '../../billing/entity/invoice-statement.srsentity'
import {
  billedOpenCountSql,
  collectionRatePct,
  genericBilledLinesSql,
  roundMoney,
  ttkBilledLinesSql,
  woBilledLinesSql,
  type BilledLinesOpts,
} from '../../shared/kpi/srs-kpi-billed-lines'

/** BILLING_WO_REL → statement id without OR + correlated IN (full-table killer). */
const BILLING_STATEMENT_LINK = `
  SELECT bwr.id_statement AS id_statement, bwr.id_billing AS id_billing
  FROM BILLING_WO_REL bwr
  WHERE bwr.id_statement IS NOT NULL
  UNION ALL
  SELECT r.id_statement AS id_statement, bwr.id_billing AS id_billing
  FROM BILLING_WO_REL bwr
  INNER JOIN INVOICE_STATEMENT_INV_REL r ON r.id = bwr.id_statement_inv_rel
  WHERE bwr.id_statement_inv_rel IS NOT NULL`

function money(v: unknown): number {
  return Number(v ?? 0)
}

function emptyCollectionsMonth(monthStart: string): CollectionsByMonthRowDto {
  return {
    monthStart,
    woInvoicedValue: 0,
    ttkInvoicedValue: 0,
    genericInvoicedValue: 0,
    woUnbilledValue: 0,
    producedValue: 0,
    collectedValue: 0,
    pendingCollectionValue: 0,
    collectionRatePct: 0,
  }
}

function monthKey(value: unknown): string {
  return String(value).slice(0, 10)
}

@Injectable()
export class CollectionsKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  private billedBase(
    filter: SrsKpiFilter,
    range: { fechaDesde: string; fechaHasta: string } | null,
  ): { wo: BilledLinesOpts; ttk: BilledLinesOpts; gen: BilledLinesOpts } {
    const { idDealerProvider, idUsuario, dealerIds, includeZero, skipDealerRestriction } = filter
    const common = { idDealerProvider, includeZero, range }
    return {
      wo: {
        ...common,
        dealer: buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction),
      },
      ttk: {
        ...common,
        dealer: buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction),
      },
      gen: {
        ...common,
        dealer: buildDealerFilterSql('statement', idUsuario, dealerIds, skipDealerRestriction),
      },
    }
  }

  async getCollectionsKpis(filter: SrsKpiFilter): Promise<CollectionsKpiDto> {
    const {
      idDealerProvider,
      idUsuario,
      dealerIds,
      fechaDesde,
      fechaHasta,
      includeZero,
      skipDealerRestriction,
    } = filter
    const stmtZero = applyZeroFilter(includeZero, statementHasPositiveTotalSql('s'))
    const stmt = buildDealerRestrictionClause(idUsuario, dealerIds, skipDealerRestriction)
    const { wo, ttk, gen } = this.billedBase(filter, null)
    const owingOpts = { debtOnly: true, groupBy: 'statement' as const, withOver60: true }
    const woOwing = woBilledLinesSql({ ...wo, ...owingOpts })
    const ttkOwing = ttkBilledLinesSql({ ...ttk, ...owingOpts })
    const genOwing = genericBilledLinesSql({ ...gen, ...owingOpts })
    // One pass per invoice: total debt, over-60 debt and open invoices (net unpaid ≠ 0,
    // with the toggle on or off).
    const debtQ = billedOpenCountSql(woOwing, ttkOwing, genOwing, true)

    // Drive from payments in range, then STRAIGHT_JOIN statements. MariaDB 10.3 otherwise
    // nested-loops CONTRATISTA → every invoice and runs IS_STATEMENT_BILLED /
    // GET_TOTAL_BY_STATEMENT (~90k rows) before applying the payment window.
    const [dso, debt] = await Promise.all([
      this.srs.query(
        `SELECT ROUND(AVG(DATEDIFF(pay.paid_at, s.fecha_create)), 1) AS dsoDays
         FROM (
           SELECT link.id_statement, MAX(b.fecha) AS paid_at
           FROM (${BILLING_STATEMENT_LINK}) link
           JOIN BILLING b ON b.id = link.id_billing AND b.estado = 1
           WHERE b.id_dealer_provider = ?
           GROUP BY link.id_statement
           HAVING MAX(b.fecha) >= ? AND MAX(b.fecha) < DATE_ADD(?, INTERVAL 1 DAY)
         ) pay
         STRAIGHT_JOIN INVOICE_STATEMENT s ON s.id = pay.id_statement
         STRAIGHT_JOIN CONTRATISTA c ON c.id = s.id_dealer
         WHERE s.estado = 1 AND s.id_dealer_provider = ?
           ${stmt.and}
           AND IS_STATEMENT_BILLED(s.id) = 1${stmtZero}`,
        [idDealerProvider, fechaDesde, fechaHasta, idDealerProvider, ...stmt.params],
      ),
      this.srs.query(debtQ.sql, debtQ.params),
    ])

    const outstandingAr = roundMoney(money(debt[0]?.debt))
    const over60 = roundMoney(money(debt[0]?.debtOver60))

    return {
      outstandingAr,
      dsoDays: Number(dso[0]?.dsoDays ?? 0),
      arOver60Pct: outstandingAr > 0 ? Math.round((over60 / outstandingAr) * 1000) / 10 : 0,
      openStatements: Number(debt[0]?.unpaidStatements ?? 0),
    }
  }

  async getCollectionsByMonth(
    filter: SrsKpiFilter,
    historyMonthsRaw?: string | number,
  ): Promise<CollectionsByMonthRowDto[]> {
    const historyMonths = parseHistoryMonths(historyMonthsRaw)
    const { rangeStart, rangeEnd, monthStarts } = buildMonthWindow(filter.fechaHasta, historyMonths)
    const { idDealerProvider, idUsuario, dealerIds, includeZero, skipDealerRestriction } = filter
    const woLineZero = applyZeroFilter(includeZero, woServiceLinePositiveSql())
    const inv = buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction)
    const billed = billedJoinsSql
    const notInvoiced = woServiceNotInvoicedSql()
    const range = { fechaDesde: rangeStart, fechaHasta: rangeEnd }
    const { wo, ttk, gen } = this.billedBase(filter, range)
    const monthBuckets = monthStarts.map((ms) => ({
      start: ms,
      end: monthEndInclusive(ms, rangeEnd),
    }))

    const woQ = woBilledLinesSql({ ...wo, groupBy: 'month' })
    const ttkQ = ttkBilledLinesSql({ ...ttk, groupBy: 'month' })
    const genQ = genericBilledLinesSql({ ...gen, groupBy: 'month', monthBuckets })

    const [woRows, ttkRows, genRows, unbilledRows] = await Promise.all([
      this.srs.query(woQ.sql, woQ.params),
      this.srs.query(ttkQ.sql, ttkQ.params),
      this.srs.query(genQ.sql, genQ.params),
      this.srs.query(
        `SELECT DATE_FORMAT(i.fecha_alta, '%Y-%m-01') AS monthStart,
          ROUND(IFNULL(SUM(CASE WHEN r.id IS NULL AND i.id_workflow = ${WorkflowStatus.DONE} AND ${notInvoiced}
            THEN isr.price * IFNULL(isr.qty, 1) END), 0), 2) AS woUnbilledValue
         FROM INVOICE i
         ${inv.join}
         JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         LEFT JOIN (INVOICE_STATEMENT_INV_REL r
           JOIN INVOICE_STATEMENT s ON s.id = r.id_statement AND s.estado = 1
            AND s.statement_type IN (${statementTypesSqlIn(WO_STATEMENT_TYPES)}))
           ON r.id_invoice = i.id AND r.id_invoice_service = isr.id_service_invoice AND IFNULL(r.only_timecard, 0) = 0
         ${billed('r.id_statement', 'r.id')}
         WHERE i.estado = 1 AND i.id_dealer_provider = ?
           ${inv.and}
           AND i.fecha_alta >= ? AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)${woLineZero}
         GROUP BY monthStart`,
        [idDealerProvider, idDealerProvider, idDealerProvider, ...inv.params, rangeStart, rangeEnd],
      ),
    ])

    const woBy = new Map<string, any>(woRows.map((r: any) => [monthKey(r.bucketStart), r]))
    const ttkBy = new Map<string, any>(ttkRows.map((r: any) => [monthKey(r.bucketStart), r]))
    const genBy = new Map<string, any>(genRows.map((r: any) => [monthKey(r.bucketStart), r]))
    const unbilledBy = new Map<string, any>(unbilledRows.map((r: any) => [monthKey(r.monthStart), r]))
    const present = new Set([...woBy.keys(), ...ttkBy.keys(), ...genBy.keys(), ...unbilledBy.keys()])

    const mapped: CollectionsByMonthRowDto[] = [...present].map((monthStart) => {
      const woRow = woBy.get(monthStart)
      const ttkRow = ttkBy.get(monthStart)
      const genRow = genBy.get(monthStart)
      const woInvoicedValue = money(woRow?.invoiced)
      const ttkInvoicedValue = money(ttkRow?.invoiced)
      const genericInvoicedValue = money(genRow?.invoiced)
      const woUnbilledValue = money(unbilledBy.get(monthStart)?.woUnbilledValue)
      const invoiced = roundMoney(woInvoicedValue + ttkInvoicedValue + genericInvoicedValue)
      const collectedValue = roundMoney(
        money(woRow?.collected) + money(ttkRow?.collected) + money(genRow?.collected),
      )
      const producedValue = roundMoney(invoiced + woUnbilledValue)
      const pendingCollectionValue = roundMoney(invoiced - collectedValue)
      return {
        monthStart,
        woInvoicedValue,
        ttkInvoicedValue,
        genericInvoicedValue,
        woUnbilledValue,
        producedValue,
        collectedValue,
        pendingCollectionValue,
        collectionRatePct: collectionRatePct(collectedValue, invoiced),
      }
    })

    return fillMonthlyGaps(mapped, monthStarts, emptyCollectionsMonth)
  }

  async getArAging(filter: SrsKpiFilter): Promise<{ bucket: string; statements: number; value: number }[]> {
    const stmt = buildDealerFilterSql('statement', filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const stmtZero = applyZeroFilter(filter.includeZero, statementHasPositiveTotalSql('s'))
    const rows = await this.srs.query(
      `SELECT CASE WHEN t.ageDays <= 30 THEN '0-30 days'
                   WHEN t.ageDays <= 60 THEN '31-60 days'
                   WHEN t.ageDays <= 90 THEN '61-90 days'
                   ELSE '90+ days' END        AS bucket,
              COUNT(*)                        AS statements,
              ROUND(IFNULL(SUM(t.notBilled), 0), 2) AS value
       FROM (
         SELECT GET_TOTAL_BY_STATEMENT_NOT_BILLED(s.id, s.discount, NULL, s.discount_type, s.statement_type, NULL) notBilled,
                DATEDIFF(NOW(), s.fecha_create) ageDays
         FROM INVOICE_STATEMENT s
         ${stmt.join}
         WHERE s.estado = 1 AND s.id_dealer_provider = ?
           ${stmt.and}
           AND IS_STATEMENT_BILLED(s.id) = 0${stmtZero}
       ) t
       GROUP BY bucket
       ORDER BY MIN(t.ageDays)`,
      [filter.idDealerProvider, ...stmt.params],
    )
    return rows.map((r: any) => ({
      bucket: r.bucket,
      statements: Number(r.statements),
      value: Number(r.value),
    }))
  }
}
