import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { StatementType } from '../../billing/entity/invoice-statement.srsentity'
import { OPEN_WORKFLOW_STATUSES, WorkflowStatus } from '../entity/workflow.srsentity'
import { ProductionKpiDto, ProductionWeekRowDto, DealerProductionRowDto, WoStatusSliceDto } from '../dto/production-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  buildDealerFilterSql,
  buildDealerRestrictionClause,
  mysqlWeekBucketStartExpr,
  woCompletedPeriodColumn,
  woDoneAtJoinScoped,
  woPeriodColumn,
  woStatusFilterSql,
} from '../../shared/kpi/srs-kpi-dealer-filter'

@Injectable()
export class ProductionKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getProductionKpis(filter: SrsKpiFilter): Promise<ProductionKpiDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, filterDateDone, skipDealerRestriction } =
      filter
    const dealer = buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction)
    const drDealer = buildDealerFilterSql('dailyReport', idUsuario, dealerIds, skipDealerRestriction)
    const woDate = woPeriodColumn(filterDateDone)
    const woPeriod = woCompletedPeriodColumn(filterDateDone)
    const woStatus = woStatusFilterSql(filterDateDone, WorkflowStatus.DONE)
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
           ${woStatus}
           AND i.id_dealer_provider = ?
           ${dealer.and}
           AND ${woPeriod} BETWEEN ? AND ?`,
        completedParams,
      ),
      this.loadProductionValueParts(
        idDealerProvider,
        idUsuario,
        dealerIds,
        dealer,
        drDealer,
        filterDateDone,
        woDate,
        fechaDesde,
        fechaHasta,
        skipDealerRestriction,
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
    filterDateDone: boolean,
    woDate: string,
    fechaDesde: string,
    fechaHasta: string,
    skipDealerRestriction: boolean,
  ): Promise<number> {
    const woStatus = woStatusFilterSql(filterDateDone, WorkflowStatus.DONE)
    const stmtScope = buildDealerRestrictionClause(idUsuario, dealerIds, skipDealerRestriction)
    const invoicePeriodParams = [idDealerProvider, ...dealer.params, fechaDesde, fechaHasta]
    const drParams = [idDealerProvider, ...drDealer.params, fechaDesde, fechaHasta]
    const stmtPeriodParams = [idDealerProvider, ...stmtScope.params, fechaDesde, fechaHasta]

    const [woRows, drRows, ttkRows, genRows] = await Promise.all([
      this.srs.query(
        `SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0) AS value
         FROM INVOICE i
         JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         ${dealer.join}
         WHERE i.estado = 1
           ${woStatus}
           AND i.id_dealer_provider = ?
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
         WHERE invs.estado = 1 AND invs.statement_type = ${StatementType.TTK} AND invs.id_dealer_provider = ?
           ${stmtScope.and}
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
         WHERE invs.estado = 1 AND invs.statement_type = ${StatementType.GENERIC} AND invs.id_dealer_provider = ?
           ${stmtScope.and}
           AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?`,
        stmtPeriodParams,
      ),
    ])

    return this.roundMoney(
      Number(woRows[0]?.value ?? 0) +
        Number(drRows[0]?.value ?? 0) +
        Number(ttkRows[0]?.value ?? 0) +
        Number(genRows[0]?.value ?? 0),
    )
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100
  }

  async getOpenPipeline(filter: SrsKpiFilter): Promise<WoStatusSliceDto[]> {
    const dealer = buildDealerFilterSql(
      'invoice',
      filter.idUsuario,
      filter.dealerIds,
      filter.skipDealerRestriction,
    )
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

  async getDealerProduction(filter: SrsKpiFilter): Promise<DealerProductionRowDto[]> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, filterDateDone, skipDealerRestriction } =
      filter
    const dealer = buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction)
    const drDealer = buildDealerFilterSql('dailyReport', idUsuario, dealerIds, skipDealerRestriction)
    const woPeriod = woCompletedPeriodColumn(filterDateDone)
    const woStatus = woStatusFilterSql(filterDateDone, WorkflowStatus.DONE)
    const stmtScope = buildDealerRestrictionClause(idUsuario, dealerIds, skipDealerRestriction)
    const invoicePeriodParams = [idDealerProvider, ...dealer.params, fechaDesde, fechaHasta]
    const drParams = [idDealerProvider, ...drDealer.params, fechaDesde, fechaHasta]
    const stmtPeriodParams = [idDealerProvider, ...stmtScope.params, fechaDesde, fechaHasta]
    const goalParams = [idDealerProvider, fechaHasta, fechaDesde, idDealerProvider, ...stmtScope.params]

    const [woRows, drRows, ttkRows, genRows, goalRows] = await Promise.all([
      this.srs.query(
        `SELECT c.id AS dealerId,
                GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealer,
                COUNT(DISTINCT i.id) AS wos,
                IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0) AS value
         FROM INVOICE i
         ${dealer.join}
         LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         WHERE i.estado = 1
           ${woStatus}
           AND i.id_dealer_provider = ?
           ${dealer.and}
           AND ${woPeriod} BETWEEN ? AND ?
         GROUP BY c.id
         ORDER BY value DESC`,
        [idDealerProvider, ...invoicePeriodParams],
      ),
      this.srs.query(
        `SELECT c.id AS dealerId,
                GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealer,
                IFNULL(ROUND(SUM(GET_SERVICES_TOTAL_BY_DAILY_REPORT(ldr.id)), 2), 0) AS value
         FROM DAILY_REPORT ldr
         ${drDealer.join}
         WHERE ldr.id_dealer_provider = ?
           ${drDealer.and}
           AND DATE(ldr.fecha_desde) BETWEEN ? AND ?
         GROUP BY c.id`,
        [idDealerProvider, ...drParams],
      ),
      this.srs.query(
        `SELECT c.id AS dealerId,
                GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealer,
                IFNULL(SUM(GET_TOTAL_BY_STATEMENT(invs.id, invs.discount, NULL, invs.discount_type, NULL)), 0) AS value
         FROM INVOICE_STATEMENT invs
         JOIN CONTRATISTA c ON c.id = invs.id_dealer
         WHERE invs.estado = 1 AND invs.statement_type = ${StatementType.TTK} AND invs.id_dealer_provider = ?
           ${stmtScope.and}
           AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?
         GROUP BY c.id`,
        [idDealerProvider, ...stmtPeriodParams],
      ),
      this.srs.query(
        `SELECT c.id AS dealerId,
                GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealer,
                IFNULL(SUM(
                  IFNULL(CASE WHEN isir.id_employee_work IS NULL THEN isir.generic_qty ELSE 1 END, 0)
                  * IFNULL(isir.amount, 0)
                ), 0) AS value
         FROM INVOICE_STATEMENT invs
         JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = invs.id
         JOIN CONTRATISTA c ON c.id = invs.id_dealer
         WHERE invs.estado = 1 AND invs.statement_type = ${StatementType.GENERIC} AND invs.id_dealer_provider = ?
           ${stmtScope.and}
           AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?
         GROUP BY c.id`,
        [idDealerProvider, ...stmtPeriodParams],
      ),
      this.srs.query(
        `SELECT c.id AS dealerId,
                GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealer,
                IFNULL(dr.goal_report, 0) * (DATEDIFF(?, ?) + 1) AS goal
         FROM DEALER_REL dr
         JOIN CONTRATISTA c ON c.id = dr.id_dealer_customer
         WHERE dr.estado = 1
           AND dr.fecha_end IS NULL
           AND dr.id_dealer_provider = ?
           ${stmtScope.and}`,
        goalParams,
      ),
    ])

    type DealerAcc = { dealer: string; wos: number; value: number; goal: number }
    const byDealer = new Map<number, DealerAcc>()

    const ensure = (dealerId: number, dealerName: string): DealerAcc => {
      const existing = byDealer.get(dealerId)
      if (existing) return existing
      const row = { dealer: dealerName, wos: 0, value: 0, goal: 0 }
      byDealer.set(dealerId, row)
      return row
    }

    for (const row of goalRows) {
      const acc = ensure(Number(row.dealerId), row.dealer)
      acc.goal = Number(row.goal ?? 0)
    }

    for (const row of woRows) {
      const acc = ensure(Number(row.dealerId), row.dealer)
      acc.wos = Number(row.wos ?? 0)
      acc.value += Number(row.value ?? 0)
    }

    for (const row of [...drRows, ...ttkRows, ...genRows]) {
      const acc = ensure(Number(row.dealerId), row.dealer)
      acc.value += Number(row.value ?? 0)
    }

    return Array.from(byDealer.values())
      .map((row) => {
        const value = this.roundMoney(row.value)
        const goal = this.roundMoney(row.goal)
        return {
          dealer: row.dealer,
          wos: row.wos,
          value,
          goal,
          attainmentPct: goal > 0 ? Math.round((value / goal) * 1000) / 10 : 0,
        }
      })
      .filter((row) => row.wos > 0 || row.value > 0)
      .sort((a, b) => b.value - a.value)
  }

  async getProductionByWeek(filter: SrsKpiFilter): Promise<ProductionWeekRowDto[]> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, filterDateDone, skipDealerRestriction } =
      filter
    const dealer = buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction)
    const drDealer = buildDealerFilterSql('dailyReport', idUsuario, dealerIds, skipDealerRestriction)
    const woPeriod = woCompletedPeriodColumn(filterDateDone)
    const woStatus = woStatusFilterSql(filterDateDone, WorkflowStatus.DONE)
    const woWeekStart = mysqlWeekBucketStartExpr(woPeriod)
    const drWeekStart = mysqlWeekBucketStartExpr('DATE(ldr.fecha_desde)')
    const stmtWeekStart = mysqlWeekBucketStartExpr('DATE(invs.fecha_desde)')
    const stmtScope = buildDealerRestrictionClause(idUsuario, dealerIds, skipDealerRestriction)
    const invoicePeriodParams = [fechaDesde, idDealerProvider, ...dealer.params, fechaDesde, fechaHasta]
    const drParams = [fechaDesde, idDealerProvider, ...drDealer.params, fechaDesde, fechaHasta]
    const stmtPeriodParams = [fechaDesde, idDealerProvider, ...stmtScope.params, fechaDesde, fechaHasta]

    const [woRows, drRows, ttkRows, genRows] = await Promise.all([
      this.srs.query(
        `SELECT ${woWeekStart} AS weekStart,
                COUNT(DISTINCT i.id) AS woCompleted,
                IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0) AS value
         FROM INVOICE i
         ${dealer.join}
         LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         WHERE i.estado = 1
           ${woStatus}
           AND i.id_dealer_provider = ?
           ${dealer.and}
           AND ${woPeriod} BETWEEN ? AND ?
         GROUP BY weekStart
         ORDER BY weekStart`,
        invoicePeriodParams,
      ),
      this.srs.query(
        `SELECT ${drWeekStart} AS weekStart,
                IFNULL(ROUND(SUM(GET_SERVICES_TOTAL_BY_DAILY_REPORT(ldr.id)), 2), 0) AS value
         FROM DAILY_REPORT ldr
         ${drDealer.join}
         WHERE ldr.id_dealer_provider = ?
           ${drDealer.and}
           AND DATE(ldr.fecha_desde) BETWEEN ? AND ?
         GROUP BY weekStart
         ORDER BY weekStart`,
        drParams,
      ),
      this.srs.query(
        `SELECT ${stmtWeekStart} AS weekStart,
                IFNULL(SUM(GET_TOTAL_BY_STATEMENT(invs.id, invs.discount, NULL, invs.discount_type, NULL)), 0) AS value
         FROM INVOICE_STATEMENT invs
         JOIN CONTRATISTA c ON c.id = invs.id_dealer
         WHERE invs.estado = 1 AND invs.statement_type = ${StatementType.TTK} AND invs.id_dealer_provider = ?
           ${stmtScope.and}
           AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?
         GROUP BY weekStart
         ORDER BY weekStart`,
        stmtPeriodParams,
      ),
      this.srs.query(
        `SELECT ${stmtWeekStart} AS weekStart,
                IFNULL(SUM(
                  IFNULL(CASE WHEN isir.id_employee_work IS NULL THEN isir.generic_qty ELSE 1 END, 0)
                  * IFNULL(isir.amount, 0)
                ), 0) AS value
         FROM INVOICE_STATEMENT invs
         JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = invs.id
         JOIN CONTRATISTA c ON c.id = invs.id_dealer
         WHERE invs.estado = 1 AND invs.statement_type = ${StatementType.GENERIC} AND invs.id_dealer_provider = ?
           ${stmtScope.and}
           AND invs.fecha_desde >= ? AND invs.fecha_hasta <= ?
         GROUP BY weekStart
         ORDER BY weekStart`,
        stmtPeriodParams,
      ),
    ])

    const byWeek = new Map<string, ProductionWeekRowDto>()

    const mergeValue = (rows: any[], includeWoCount: boolean) => {
      for (const row of rows) {
        const weekStart = String(row.weekStart).slice(0, 10)
        const existing = byWeek.get(weekStart) ?? {
          weekStart,
          woCompleted: 0,
          productionValue: 0,
        }
        if (includeWoCount) {
          existing.woCompleted = Number(row.woCompleted ?? 0)
        }
        existing.productionValue = this.roundMoney(
          existing.productionValue + Number(row.value ?? 0),
        )
        byWeek.set(weekStart, existing)
      }
    }

    mergeValue(woRows, true)
    mergeValue(drRows, false)
    mergeValue(ttkRows, false)
    mergeValue(genRows, false)

    return this.fillWeeklyGaps(Array.from(byWeek.values()), fechaDesde, fechaHasta)
  }

  private fillWeeklyGaps(
    rows: ProductionWeekRowDto[],
    fechaDesde: string,
    fechaHasta: string,
  ): ProductionWeekRowDto[] {
    const byStart = new Map(rows.map((r) => [r.weekStart, r]))
    const rangeStart = this.parseDateOnly(fechaDesde)
    const rangeEnd = this.parseDateOnly(fechaHasta)
    const isoRangeStart = this.startOfIsoWeek(rangeStart)
    const firstBucket =
      isoRangeStart.getTime() < rangeStart.getTime() ? new Date(rangeStart) : isoRangeStart
    const endBucket = this.startOfIsoWeek(rangeEnd)
    const filled: ProductionWeekRowDto[] = []
    let cursor = new Date(firstBucket)
    let isFirstPartialWeek =
      firstBucket.getTime() === rangeStart.getTime() && firstBucket.getTime() > isoRangeStart.getTime()

    while (cursor <= endBucket) {
      const weekStart = this.formatDateOnly(cursor)
      filled.push(
        byStart.get(weekStart) ?? {
          weekStart,
          woCompleted: 0,
          productionValue: 0,
        },
      )

      if (isFirstPartialWeek) {
        cursor = new Date(isoRangeStart)
        cursor.setUTCDate(isoRangeStart.getUTCDate() + 7)
        isFirstPartialWeek = false
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }
    }

    return filled
  }

  private parseDateOnly(value: string): Date {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }

  private formatDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  private startOfIsoWeek(date: Date): Date {
    const day = date.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const weekStart = new Date(date)
    weekStart.setUTCDate(date.getUTCDate() + diff)
    return weekStart
  }
}
