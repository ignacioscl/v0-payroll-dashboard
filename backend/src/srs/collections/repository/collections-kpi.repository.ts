import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { CollectionsByMonthRowDto } from '../dto/collections-by-month.dto'
import { CollectionsKpiDto } from '../dto/collections-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'
import {
  buildMonthWindow,
  fillMonthlyGaps,
  parseHistoryMonths,
} from '../../shared/kpi/srs-kpi-month'
import {
  applyZeroFilter,
  statementHasPositiveTotalSql,
} from '../../shared/kpi/srs-kpi-zero-filter'

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

@Injectable()
export class CollectionsKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

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
    const stmt = buildDealerFilterSql('statement', idUsuario, dealerIds, skipDealerRestriction)
    const [dso, ar] = await Promise.all([
      this.srs.query(
        `SELECT ROUND(AVG(DATEDIFF(pay.paid_at, s.fecha_create)), 1) AS dsoDays
         FROM INVOICE_STATEMENT s
         ${stmt.join}
         JOIN (
           SELECT link.id_statement, MAX(b.fecha) AS paid_at
           FROM (${BILLING_STATEMENT_LINK}) link
           JOIN BILLING b ON b.id = link.id_billing AND b.estado = 1
           WHERE b.id_dealer_provider = ?
           GROUP BY link.id_statement
           HAVING MAX(b.fecha) >= ? AND MAX(b.fecha) < DATE_ADD(?, INTERVAL 1 DAY)
         ) pay ON pay.id_statement = s.id
         WHERE s.estado = 1 AND s.id_dealer_provider = ?
           ${stmt.and}
           AND IS_STATEMENT_BILLED(s.id) = 1${stmtZero}`,
        [idDealerProvider, fechaDesde, fechaHasta, idDealerProvider, ...stmt.params],
      ),
      this.srs.query(
        `SELECT COUNT(*)                                                 AS openStatements,
                ROUND(IFNULL(SUM(t.notBilled), 0), 2)                    AS outstandingAr,
                ROUND(100 * SUM(CASE WHEN t.ageDays > 60 THEN t.notBilled ELSE 0 END)
                      / NULLIF(SUM(t.notBilled), 0), 1)                  AS arOver60Pct
         FROM (
           SELECT GET_TOTAL_BY_STATEMENT_NOT_BILLED(s.id, s.discount, NULL, s.discount_type, s.statement_type, NULL) notBilled,
                  DATEDIFF(NOW(), s.fecha_create) ageDays
           FROM INVOICE_STATEMENT s
           ${stmt.join}
           WHERE s.estado = 1 AND s.id_dealer_provider = ?
             ${stmt.and}
             AND IS_STATEMENT_BILLED(s.id) = 0${stmtZero}
         ) t`,
        [idDealerProvider, ...stmt.params],
      ),
    ])

    const a = ar[0] ?? {}

    return {
      outstandingAr: Number(a.outstandingAr ?? 0),
      dsoDays: Number(dso[0]?.dsoDays ?? 0),
      arOver60Pct: Number(a.arOver60Pct ?? 0),
      openStatements: Number(a.openStatements ?? 0),
    }
  }

  async getCollectionsByMonth(
    filter: SrsKpiFilter,
    historyMonthsRaw?: string | number,
  ): Promise<CollectionsByMonthRowDto[]> {
    const historyMonths = parseHistoryMonths(historyMonthsRaw)
    const { rangeStart, rangeEnd, monthStarts } = buildMonthWindow(filter.fechaHasta, historyMonths)
    const stmtZero = applyZeroFilter(filter.includeZero, statementHasPositiveTotalSql('s'))
    const stmt = buildDealerFilterSql(
      'statement',
      filter.idUsuario,
      filter.dealerIds,
      filter.skipDealerRestriction,
    )
    const params = [filter.idDealerProvider, ...stmt.params, rangeStart, rangeEnd]

    const rows = await this.srs.query(
      `SELECT DATE_FORMAT(s.fecha_desde, '%Y-%m-01')                    AS monthStart,
              COUNT(*)                                                  AS statementsIssued,
              ROUND(IFNULL(SUM(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0), 2) AS invoicedValue,
              SUM(CASE WHEN IS_STATEMENT_BILLED(s.id) = 1 THEN 1 ELSE 0 END) AS collectedStatements,
              ROUND(IFNULL(SUM(
                GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)
                - GET_TOTAL_BY_STATEMENT_NOT_BILLED(s.id, s.discount, NULL, s.discount_type, s.statement_type, NULL)
              ), 0), 2) AS collectedValue
       FROM INVOICE_STATEMENT s
       ${stmt.join}
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         ${stmt.and}
         AND DATE(s.fecha_desde) >= ?
         AND DATE(s.fecha_desde) <= ?${stmtZero}
       GROUP BY monthStart
       ORDER BY monthStart`,
      params,
    )

    const mapped: CollectionsByMonthRowDto[] = rows.map((r: any) => {
      const invoicedValue = Number(r.invoicedValue ?? 0)
      const collectedValue = Number(r.collectedValue ?? 0)
      const collectionRatePct =
        invoicedValue > 0 ? Math.round((collectedValue / invoicedValue) * 1000) / 10 : 0
      return {
        monthStart: String(r.monthStart).slice(0, 10),
        statementsIssued: Number(r.statementsIssued ?? 0),
        invoicedValue,
        collectedStatements: Number(r.collectedStatements ?? 0),
        collectedValue,
        collectionRatePct,
      }
    })

    return fillMonthlyGaps(mapped, monthStarts, (monthStart) => ({
      monthStart,
      statementsIssued: 0,
      invoicedValue: 0,
      collectedStatements: 0,
      collectedValue: 0,
      collectionRatePct: 0,
    }))
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
