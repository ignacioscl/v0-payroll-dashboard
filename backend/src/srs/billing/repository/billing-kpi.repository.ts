import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import {
  BillingKpiDto,
  BillingPeriodCollectionKpiDto,
  BillingWeekRowDto,
  UnbilledAgingBucketDto,
  UnbilledDealerRowDto,
} from '../dto/billing-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  buildDealerFilterSql,
  woPeriodColumn,
  woStatusFilterSql,
} from '../../shared/kpi/srs-kpi-dealer-filter'
import { enumerateWeekBuckets, fillWeeklyGaps, weekEndInclusive } from '../../shared/kpi/srs-kpi-week'
import { applyZeroFilter, woHasPositiveTotalSql } from '../../shared/kpi/srs-kpi-zero-filter'
import { woServiceNotInvoicedSql } from '../../shared/kpi/srs-kpi-generic'
import {
  billedBaseOpts,
  billedStatementCohortSql,
  billedOpenCountSql,
  collectionRatePct,
  genericBilledLinesSql,
  roundMoney,
  ttkBilledLinesSql,
  woBilledLinesSql,
  woPartialOverlapCountSql,
} from '../../shared/kpi/srs-kpi-billed-lines'

/** Ventana hacia atrás para WOs Done sin facturar (aging / por dealer). */
export const UNBILLED_LOOKBACK_MONTHS = 6

function money(v: unknown): number {
  return Number(v ?? 0)
}

@Injectable()
export class BillingKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getBillingKpis(filter: SrsKpiFilter): Promise<BillingKpiDto> {
    const {
      idDealerProvider,
      idUsuario,
      dealerIds,
      fechaDesde,
      fechaHasta,
      includeZero,
      filterDateDone,
      skipDealerRestriction,
    } = filter
    const woZero = applyZeroFilter(includeZero, woHasPositiveTotalSql('i'))
    const inv = buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction)
    const invPeriodParams = [idDealerProvider, ...inv.params, fechaDesde, fechaHasta]
    // WO Not Invoiced follows the same "Filter Date Completed" switch as the cards and the
    // Closing Report, so the three still add up with the box ticked (Tarea 10).
    const unbilledPeriodCol = woPeriodColumn(filterDateDone)
    const { wo, ttk, gen } = billedBaseOpts(filter)

    // Income cards value the work billed with the discount of its invoice (C1).
    const woMoney = woBilledLinesSql({
      ...wo,
      withPeriodSplit: true,
      withAvgDoneToInvoiced: true,
      productionValue: true,
    })
    const ttkMoney = ttkBilledLinesSql({ ...ttk, withPeriodSplit: true, productionValue: true })
    const genMoney = genericBilledLinesSql({ ...gen, withPeriodSplit: true, productionValue: true })
    const woIds = woBilledLinesSql({ ...wo, idsOnly: true })
    const ttkIds = ttkBilledLinesSql({ ...ttk, idsOnly: true })
    const genIds = genericBilledLinesSql({ ...gen, idsOnly: true })
    const cohort = billedStatementCohortSql(woIds, ttkIds, genIds, includeZero)
    const overlap = woPartialOverlapCountSql(woIds, includeZero, fechaDesde, fechaHasta)

    const [unbilled, woInvoiced, ttkInvoiced, genericInvoiced, issued, partialOverlap] = await Promise.all([
      this.srs.query(
      `SELECT COUNT(DISTINCT i.id) AS unbilledWos,
              ROUND(IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0), 2) AS unbilledWoTotalValue,
              IFNULL(SUM(CASE WHEN isr.id_invoice IS NOT NULL AND ${woServiceNotInvoicedSql()} THEN 1 ELSE 0 END), 0) AS unbilledServices,
              ROUND(IFNULL(SUM(CASE WHEN isr.id_invoice IS NOT NULL AND ${woServiceNotInvoicedSql()}
                THEN isr.price * IFNULL(isr.qty, 1) END), 0), 2) AS unbilledValue
       FROM INVOICE i
       ${inv.join}
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1
         AND i.id_dealer_provider = ?
         ${inv.and}
         ${woStatusFilterSql(filterDateDone, WorkflowStatus.DONE)}
         AND ${unbilledPeriodCol} >= ? AND ${unbilledPeriodCol} < DATE_ADD(?, INTERVAL 1 DAY)
         AND WO_IS_FULL_INVOICED(i.id) = 0${woZero}`,
        invPeriodParams,
      ),
      this.srs.query(woMoney.sql, woMoney.params),
      this.srs.query(ttkMoney.sql, ttkMoney.params),
      this.srs.query(genMoney.sql, genMoney.params),
      this.srs.query(cohort.sql, cohort.params),
      this.srs.query(overlap.sql, overlap.params),
    ])

    const u = unbilled[0] ?? {}
    const woRow = woInvoiced[0] ?? {}
    const ttkRow = ttkInvoiced[0] ?? {}
    const genRow = genericInvoiced[0] ?? {}
    const i = issued[0] ?? {}
    const po = partialOverlap[0] ?? {}

    const woTotal = money(woRow.invoiced)
    const woInRange = money(woRow.invoicedInRange)
    const ttkTotal = money(ttkRow.invoiced)
    const ttkInRange = money(ttkRow.invoicedInRange)
    const genTotal = money(genRow.invoiced)
    const genInRange = money(genRow.invoicedInRange)
    const invoicedValue = roundMoney(woTotal + ttkTotal + genTotal)
    const statementsIssued = Number(i.statementsIssued ?? 0)

    return {
      invoicedValue,
      statementsIssued,
      avgInvoiceValue: statementsIssued > 0 ? Math.round(invoicedValue / statementsIssued) : 0,
      unbilledWos: Number(u.unbilledWos ?? 0),
      unbilledValue: money(u.unbilledValue),
      unbilledServices: Number(u.unbilledServices ?? 0),
      unbilledWoTotalValue: money(u.unbilledWoTotalValue),
      avgDoneToInvoicedDays: money(woRow.avgDoneToInvoicedDays),
      sentPct: money(i.sentPct),
      unsentStatements: Number(i.unsentStatements ?? 0),
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
    return roundMoney(total - inRange)
  }

  async getUnbilledAging(filter: SrsKpiFilter): Promise<UnbilledAgingBucketDto[]> {
    const inv = buildDealerFilterSql('invoice', filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const woZero = applyZeroFilter(filter.includeZero, woHasPositiveTotalSql('i'))
    const rows = await this.srs.query(
      `SELECT CASE WHEN DATEDIFF(NOW(), DATE(i.fecha_alta)) <= 7  THEN '0-7 days'
                   WHEN DATEDIFF(NOW(), DATE(i.fecha_alta)) <= 14 THEN '8-14 days'
                   WHEN DATEDIFF(NOW(), DATE(i.fecha_alta)) <= 30 THEN '15-30 days'
                   ELSE '31+ days' END                              AS bucket,
              COUNT(DISTINCT i.id)                                  AS wos,
              ROUND(IFNULL(SUM(CASE WHEN isr.id_invoice IS NOT NULL AND ${woServiceNotInvoicedSql()}
                THEN isr.price * IFNULL(isr.qty, 1) END), 0), 2) AS value
       FROM INVOICE i
       ${inv.join}
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         ${inv.and}
         AND i.fecha_alta >= DATE_SUB(CURDATE(), INTERVAL ${UNBILLED_LOOKBACK_MONTHS} MONTH)
         AND WO_IS_FULL_INVOICED(i.id) = 0${woZero}
       GROUP BY bucket`,
      [filter.idDealerProvider, ...inv.params],
    )
    return rows.map((r: any) => ({ bucket: r.bucket, wos: Number(r.wos), value: Number(r.value) }))
  }

  async getBillingByWeek(filter: SrsKpiFilter): Promise<BillingWeekRowDto[]> {
    const { fechaDesde, fechaHasta } = filter
    const { wo, ttk, gen } = billedBaseOpts(filter)
    const weekBuckets = enumerateWeekBuckets(fechaDesde, fechaHasta).map((start) => ({
      start,
      end: weekEndInclusive(start, fechaHasta),
    }))
    const woQ = woBilledLinesSql({ ...wo, groupBy: 'week' })
    const ttkQ = ttkBilledLinesSql({ ...ttk, groupBy: 'week' })
    const genQ = genericBilledLinesSql({ ...gen, groupBy: 'week', weekBuckets })
    const [woRows, ttkRows, genRows] = await Promise.all([
      this.srs.query(woQ.sql, woQ.params),
      this.srs.query(ttkQ.sql, ttkQ.params),
      this.srs.query(genQ.sql, genQ.params),
    ])
    const byWeek = new Map<string, number>()
    const add = (rows: any[]) => {
      for (const r of rows) {
        const key = String(r.bucketStart).slice(0, 10)
        byWeek.set(key, roundMoney((byWeek.get(key) ?? 0) + money(r.invoiced)))
      }
    }
    add(woRows)
    add(ttkRows)
    add(genRows)
    const mapped: BillingWeekRowDto[] = [...byWeek.entries()].map(([weekStart, invoicedValue]) => ({
      weekStart,
      invoicedValue,
    }))
    return fillWeeklyGaps(mapped, fechaDesde, fechaHasta, (weekStart) => ({
      weekStart,
      invoicedValue: 0,
    }))
  }

  async getUnbilledByDealer(filter: SrsKpiFilter): Promise<UnbilledDealerRowDto[]> {
    const inv = buildDealerFilterSql('invoice', filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const woZero = applyZeroFilter(filter.includeZero, woHasPositiveTotalSql('i'))
    const rows = await this.srs.query(
      `SELECT c.id                                                  AS dealerId,
              GET_DEALER_NAME_BY_PROVIDER(?, c.id)                  AS dealer,
              COUNT(DISTINCT i.id)                                  AS wos,
              IFNULL(SUM(CASE WHEN isr.id_invoice IS NOT NULL AND ${woServiceNotInvoicedSql()} THEN 1 ELSE 0 END), 0) AS services,
              ROUND(IFNULL(SUM(CASE WHEN isr.id_invoice IS NOT NULL AND ${woServiceNotInvoicedSql()}
                THEN isr.price * IFNULL(isr.qty, 1) END), 0), 2) AS value,
              MAX(DATEDIFF(NOW(), DATE(i.fecha_alta)))              AS oldestDays
       FROM INVOICE i
       ${inv.join}
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         ${inv.and}
         AND i.fecha_alta >= DATE_SUB(CURDATE(), INTERVAL ${UNBILLED_LOOKBACK_MONTHS} MONTH)
         AND WO_IS_FULL_INVOICED(i.id) = 0${woZero}
       GROUP BY c.id
       ORDER BY value DESC`,
      [filter.idDealerProvider, filter.idDealerProvider, ...inv.params],
    )
    return rows.map((r: any) => ({
      dealerId: Number(r.dealerId),
      dealer: r.dealer,
      wos: Number(r.wos),
      services: Number(r.services ?? 0),
      value: Number(r.value),
      oldestDays: Number(r.oldestDays ?? 0),
    }))
  }

  async getPeriodCollectionKpis(filter: SrsKpiFilter): Promise<BillingPeriodCollectionKpiDto> {
    const { includeZero } = filter
    const { wo, ttk, gen } = billedBaseOpts(filter)
    // Billed valuation (real money) plus the Income valuation in the same pass (V21).
    const woMoney = woBilledLinesSql({ ...wo, withPeriodSplit: true, withProductionSplit: true })
    const ttkMoney = ttkBilledLinesSql({ ...ttk, withPeriodSplit: true, withProductionSplit: true })
    const genMoney = genericBilledLinesSql({ ...gen, withPeriodSplit: true, withProductionSplit: true })
    const woIds = woBilledLinesSql({ ...wo, idsOnly: true })
    const ttkIds = ttkBilledLinesSql({ ...ttk, idsOnly: true })
    const genIds = genericBilledLinesSql({ ...gen, idsOnly: true })
    const woOwing = woBilledLinesSql({ ...wo, debtOnly: true, groupBy: 'statement' })
    const ttkOwing = ttkBilledLinesSql({ ...ttk, debtOnly: true, groupBy: 'statement' })
    const genOwing = genericBilledLinesSql({ ...gen, debtOnly: true, groupBy: 'statement' })
    const cohort = billedStatementCohortSql(woIds, ttkIds, genIds, includeZero)
    const unpaidQ = billedOpenCountSql(woOwing, ttkOwing, genOwing)

    const [woRows, ttkRows, genRows, issued, unpaid] = await Promise.all([
      this.srs.query(woMoney.sql, woMoney.params),
      this.srs.query(ttkMoney.sql, ttkMoney.params),
      this.srs.query(genMoney.sql, genMoney.params),
      this.srs.query(cohort.sql, cohort.params),
      this.srs.query(unpaidQ.sql, unpaidQ.params),
    ])

    const invoicedValue = roundMoney(
      money(woRows[0]?.invoiced) + money(ttkRows[0]?.invoiced) + money(genRows[0]?.invoiced),
    )
    const collectedValue = roundMoney(
      money(woRows[0]?.collected) + money(ttkRows[0]?.collected) + money(genRows[0]?.collected),
    )
    const unpaidInPeriodValue = roundMoney(invoicedValue - collectedValue)
    const statementsIssued = Number(issued[0]?.statementsIssued ?? 0)
    // Same lines as the three Income invoiced cards, so Unpaid = WO + TTK + Generic Invoiced −
    // Collected closes with the numbers on screen. The three cards now count every line of the
    // range — WO by its date, punches by their punch date and the free lines of a generic
    // prorated over the days that fall inside — so Collected and Unpaid follow those same lines
    // (D2/D3), not only the invoices whose period is wholly inside the range.
    // Production valuation (work × the discount of its invoice, no tax): the big Collected
    // number and the collection rate.
    const w = woRows[0] ?? {}
    const tk = ttkRows[0] ?? {}
    const g = genRows[0] ?? {}
    const incomeInvoicedValue = roundMoney(
      money(w.invoicedProduction) + money(tk.invoicedProduction) + money(g.invoicedProduction),
    )
    const incomeCollectedValue = roundMoney(
      money(w.collectedProduction) + money(tk.collectedProduction) + money(g.collectedProduction),
    )
    // Same lines, actual money (with tax and discount): the subtitles.
    const incomeInvoicedRealValue = roundMoney(
      money(w.invoiced) + money(tk.invoiced) + money(g.invoiced),
    )
    const incomeCollectedRealValue = roundMoney(
      money(w.collected) + money(tk.collected) + money(g.collected),
    )

    return {
      incomeInvoicedValue,
      incomeCollectedValue,
      incomeInvoicedRealValue,
      incomeCollectedRealValue,
      incomeCollectionRatePct: collectionRatePct(incomeCollectedValue, incomeInvoicedValue),
      invoicedValue,
      statementsIssued,
      avgInvoiceValue: statementsIssued > 0 ? Math.round(invoicedValue / statementsIssued) : 0,
      collectedValue,
      collectionRatePct: collectionRatePct(collectedValue, invoicedValue),
      unpaidInPeriodValue,
      unpaidInPeriodStatements: Number(unpaid[0]?.unpaidStatements ?? 0),
    }
  }
}
