/**
 * Single source of billed money for Billing and Open AR KPIs.
 * WO / TTK / generic lines with invoice net factor, unique WO services, and paid = line or statement.
 */

import {
  StatementType,
  WO_STATEMENT_TYPES,
  statementTypesSqlIn,
} from '../../billing/entity/invoice-statement.srsentity'
import { mysqlWeekBucketStartExpr } from './srs-kpi-dealer-filter'
import type { SrsKpiDealerFilterSql } from './srs-kpi-dealer-filter'
import {
  billedJoinsParams,
  billedJoinsSql,
  genericLineAmountSql,
  genericProratedValueSql,
  genericRangeOverlapSql,
  statementNetFactorSql,
} from './srs-kpi-generic'
import {
  applyZeroFilter,
  genericLineNonZeroSql,
  statementNetNonZeroSql,
  ttkAmountNonZeroSql,
  woServiceLineNonZeroSql,
} from './srs-kpi-zero-filter'

export type BilledGroupBy = 'none' | 'month' | 'week' | 'statement'

export type DateRange = { fechaDesde: string; fechaHasta: string }

export type DateBucket = { start: string; end: string }

export interface BilledLinesSql {
  sql: string
  params: unknown[]
}

export interface BilledLinesOpts {
  idDealerProvider: number
  dealer: SrsKpiDealerFilterSql
  includeZero: boolean
  range?: DateRange | null
  groupBy?: BilledGroupBy
  debtOnly?: boolean
  withPeriodSplit?: boolean
  withAvgDoneToInvoiced?: boolean
  withOver60?: boolean
  idsOnly?: boolean
  monthBuckets?: DateBucket[]
  weekBuckets?: DateBucket[]
}

const PAID = 'ps.id_statement IS NOT NULL OR pl.id_statement_inv_rel IS NOT NULL'
const UNPAID = 'ps.id_statement IS NULL AND pl.id_statement_inv_rel IS NULL'
const AR_OVER_60_GENERIC_FROM = "'1900-01-01'"
const AR_OVER_60_GENERIC_TO = 'DATE_SUB(CURDATE(), INTERVAL 61 DAY)'

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function collectionRatePct(collected: number, invoiced: number): number {
  return invoiced > 0 ? Math.round((collected / invoiced) * 1000) / 10 : 0
}

function sqlDateLit(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`invalid KPI date: ${value}`)
  }
  return `'${value}'`
}

function bucketSelect(groupBy: BilledGroupBy | undefined, dateExpr: string): string {
  if (groupBy === 'month') {
    return `DATE_FORMAT(${dateExpr}, '%Y-%m-01') AS bucketStart,`
  }
  if (groupBy === 'week') {
    return `${mysqlWeekBucketStartExpr(`DATE(${dateExpr})`)} AS bucketStart,`
  }
  if (groupBy === 'statement') {
    return 's.id AS bucketStart,'
  }
  return ''
}

function bucketGroup(groupBy: BilledGroupBy | undefined): string {
  return groupBy === 'month' || groupBy === 'week' || groupBy === 'statement' ? ' GROUP BY 1' : ''
}

function rangeParams(range?: DateRange | null): string[] {
  return range ? [range.fechaDesde, range.fechaHasta] : []
}

function dateRangeSql(dateExpr: string, range?: DateRange | null): string {
  if (!range) return ''
  return ` AND ${dateExpr} >= ? AND ${dateExpr} < DATE_ADD(?, INTERVAL 1 DAY)`
}

function bucketTableSql(alias: string, buckets: DateBucket[]): { sql: string; params: string[] } {
  const selects = buckets.map(() => 'SELECT ? AS ms, ? AS me')
  const params: string[] = []
  for (const b of buckets) {
    params.push(b.start, b.end)
  }
  return { sql: `(${selects.join(' UNION ALL ')}) ${alias}`, params }
}

function periodContainedSql(s: string, range?: DateRange | null): string {
  if (!range) return '0'
  return `${s}.fecha_desde >= ${sqlDateLit(range.fechaDesde)} AND ${s}.fecha_hasta <= ${sqlDateLit(range.fechaHasta)}`
}

export function woBilledLinesSql(opts: BilledLinesOpts): BilledLinesSql {
  const groupBy = opts.groupBy ?? 'none'
  const factor = statementNetFactorSql('s')
  const lineAmt = `isr.price * IFNULL(isr.qty, 1) * ${factor}`
  const lineZero = applyZeroFilter(opts.includeZero, woServiceLineNonZeroSql())
  const unpaid = opts.debtOnly
  const idsOnly = opts.idsOnly
  const params: unknown[] = []

  if (!idsOnly && groupBy === 'week') {
    if (!opts.range) {
      throw new Error('woBilledLinesSql week grouping requires range')
    }
    params.push(opts.range.fechaDesde)
  }

  const derived = `(
    SELECT r.id AS rel_id, s.id AS stmt_id, r.id_invoice, r.id_invoice_service,
      ROW_NUMBER() OVER (PARTITION BY r.id_invoice, r.id_invoice_service ORDER BY s.id) AS rn,
      MAX(CASE WHEN ${PAID} THEN 1 ELSE 0 END)
        OVER (PARTITION BY r.id_invoice, r.id_invoice_service) AS paid
    FROM INVOICE_STATEMENT s
    JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND IFNULL(r.only_timecard, 0) = 0
    ${billedJoinsSql('s.id', 'r.id')}
    WHERE s.estado = 1 AND s.id_dealer_provider = ?
      AND s.statement_type IN (${statementTypesSqlIn(WO_STATEMENT_TYPES)})
  ) w`

  params.push(...billedJoinsParams(opts.idDealerProvider), opts.idDealerProvider)

  let selectSql: string
  if (idsOnly) {
    selectSql = 'SELECT DISTINCT w.stmt_id AS id'
  } else {
    const split = opts.withPeriodSplit
      ? `,
      ROUND(IFNULL(SUM(CASE WHEN ${periodContainedSql('s', opts.range)} THEN ${lineAmt} ELSE 0 END), 0), 2) AS invoicedInRange,
      ROUND(IFNULL(SUM(CASE WHEN ${periodContainedSql('s', opts.range)} AND w.paid = 1 THEN ${lineAmt} ELSE 0 END), 0), 2) AS collectedInRange`
      : ''
    const lag = opts.withAvgDoneToInvoiced
      ? `,
      ROUND(AVG(DATEDIFF(s.fecha_create, i.date_last_chg_workflow)), 1) AS avgDoneToInvoicedDays`
      : ''
    const over60 = opts.withOver60
      ? `,
      ROUND(IFNULL(SUM(CASE WHEN i.fecha_alta < DATE_SUB(CURDATE(), INTERVAL 60 DAY) THEN ${lineAmt} ELSE 0 END), 0), 2) AS invoicedOver60`
      : ''
    selectSql = `SELECT ${bucketSelect(groupBy, 'i.fecha_alta')}
      ROUND(IFNULL(SUM(${lineAmt}), 0), 2) AS invoiced,
      ROUND(IFNULL(SUM(CASE WHEN w.paid = 1 THEN ${lineAmt} END), 0), 2) AS collected${split}${lag}${over60}`
  }

  const sql = `${selectSql}
FROM ${derived}
JOIN INVOICE_STATEMENT s ON s.id = w.stmt_id
JOIN INVOICE i ON i.id = w.id_invoice AND i.estado = 1
${opts.dealer.join}
JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id AND isr.id_service_invoice = w.id_invoice_service
WHERE w.rn = 1
  AND i.id_dealer_provider = ?
  ${opts.dealer.and}
  ${dateRangeSql('i.fecha_alta', opts.range)}
  ${unpaid ? 'AND w.paid = 0' : ''}${lineZero}${idsOnly ? '' : bucketGroup(groupBy)}`

  params.push(opts.idDealerProvider, ...opts.dealer.params, ...rangeParams(opts.range))
  return { sql, params }
}

export function ttkBilledLinesSql(opts: BilledLinesOpts): BilledLinesSql {
  const groupBy = opts.groupBy ?? 'none'
  const factor = statementNetFactorSql('s')
  const lineAmt = `isir.amount * ${factor}`
  const lineZero = applyZeroFilter(opts.includeZero, ttkAmountNonZeroSql())
  const unpaid = opts.debtOnly
  const idsOnly = opts.idsOnly
  const params: unknown[] = []

  if (!idsOnly && groupBy === 'week') {
    if (!opts.range) {
      throw new Error('ttkBilledLinesSql week grouping requires range')
    }
    params.push(opts.range.fechaDesde)
  }

  let selectSql: string
  if (idsOnly) {
    selectSql = 'SELECT DISTINCT s.id AS id'
  } else {
    const split = opts.withPeriodSplit
      ? `,
      ROUND(IFNULL(SUM(CASE WHEN ${periodContainedSql('s', opts.range)} THEN ${lineAmt} ELSE 0 END), 0), 2) AS invoicedInRange,
      ROUND(IFNULL(SUM(CASE WHEN ${periodContainedSql('s', opts.range)} AND (${PAID}) THEN ${lineAmt} ELSE 0 END), 0), 2) AS collectedInRange`
      : ''
    const over60 = opts.withOver60
      ? `,
      ROUND(IFNULL(SUM(CASE WHEN tew.punch_in < DATE_SUB(CURDATE(), INTERVAL 60 DAY) THEN ${lineAmt} ELSE 0 END), 0), 2) AS invoicedOver60`
      : ''
    selectSql = `SELECT ${bucketSelect(groupBy, 'tew.punch_in')}
      ROUND(IFNULL(SUM(${lineAmt}), 0), 2) AS invoiced,
      ROUND(IFNULL(SUM(CASE WHEN ${PAID} THEN ${lineAmt} END), 0), 2) AS collected${split}${over60}`
  }

  params.push(opts.idDealerProvider, ...billedJoinsParams(opts.idDealerProvider), opts.idDealerProvider)

  const sql = `${selectSql}
FROM INVOICE_STATEMENT s
JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
  AND isir.id_employee_work IS NOT NULL AND IFNULL(isir.only_timecard, 0) = 0
JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work AND tew.estado = 1
  AND tew.id_dealer_provider = ?
${opts.dealer.join}
${billedJoinsSql('s.id', 'isir.id')}
WHERE s.estado = 1 AND s.id_dealer_provider = ?
  AND s.statement_type IN (${StatementType.TTK}, ${StatementType.GENERIC})
  ${opts.dealer.and}
  ${dateRangeSql('tew.punch_in', opts.range)}
  ${unpaid ? `AND ${UNPAID}` : ''}${lineZero}${idsOnly ? '' : bucketGroup(groupBy)}`

  params.push(...opts.dealer.params, ...rangeParams(opts.range))
  return { sql, params }
}

function genericOver60Expr(): string {
  const prorated = genericProratedValueSql(AR_OVER_60_GENERIC_FROM, AR_OVER_60_GENERIC_TO)
  const overlap = genericRangeOverlapSql(AR_OVER_60_GENERIC_FROM, AR_OVER_60_GENERIC_TO)
  return `CASE WHEN ${overlap} THEN ${prorated} ELSE 0 END`
}

function genericValueForOpts(opts: BilledLinesOpts, buckets: DateBucket[] | undefined): string {
  if (buckets) {
    return genericProratedValueSql('mo.ms', 'mo.me')
  }
  if (opts.range) {
    return genericProratedValueSql(sqlDateLit(opts.range.fechaDesde), sqlDateLit(opts.range.fechaHasta))
  }
  return genericLineAmountSql()
}

export function genericBilledLinesSql(opts: BilledLinesOpts): BilledLinesSql {
  const groupBy = opts.groupBy ?? 'none'
  const lineZero = applyZeroFilter(opts.includeZero, genericLineNonZeroSql())
  const unpaid = opts.debtOnly
  const idsOnly = opts.idsOnly

  const buckets =
    groupBy === 'week' ? opts.weekBuckets : groupBy === 'month' ? opts.monthBuckets : undefined
  if ((groupBy === 'month' || groupBy === 'week') && !idsOnly && (!buckets || buckets.length === 0)) {
    throw new Error('genericBilledLinesSql grouping requires buckets')
  }

  const overlapLit =
    opts.range && !buckets
      ? genericRangeOverlapSql(sqlDateLit(opts.range.fechaDesde), sqlDateLit(opts.range.fechaHasta))
      : ''

  const billed = billedJoinsSql('s.id', 'isir.id')
  const unpaidSql = unpaid ? `AND ${UNPAID}` : ''

  if (idsOnly) {
    const params: unknown[] = [
      ...billedJoinsParams(opts.idDealerProvider),
      opts.idDealerProvider,
      ...opts.dealer.params,
    ]
    const sql = `SELECT DISTINCT s.id AS id
FROM INVOICE_STATEMENT s
${opts.dealer.join}
JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
  AND isir.id_employee_work IS NULL AND IFNULL(isir.only_timecard, 0) = 0
${billed}
WHERE s.estado = 1 AND s.statement_type = ${StatementType.GENERIC}
  AND s.id_dealer_provider = ?
  ${opts.dealer.and}
  ${overlapLit ? `AND ${overlapLit}` : ''}
  ${unpaidSql}${lineZero}`
    return { sql, params }
  }

  const valueExpr = genericValueForOpts(opts, buckets)
  const split = opts.withPeriodSplit
    ? `,
      ROUND(IFNULL(SUM(CASE WHEN ${periodContainedSql('s', opts.range)} THEN ${valueExpr} ELSE 0 END), 0), 2) AS invoicedInRange,
      ROUND(IFNULL(SUM(CASE WHEN ${periodContainedSql('s', opts.range)} AND (${PAID}) THEN ${valueExpr} ELSE 0 END), 0), 2) AS collectedInRange`
    : ''
  const over60 = opts.withOver60
    ? `,
      ROUND(IFNULL(SUM(${genericOver60Expr()}), 0), 2) AS invoicedOver60`
    : ''
  const bucketCol = buckets ? 'mo.ms AS bucketStart,' : groupBy === 'statement' ? 's.id AS bucketStart,' : ''
  const selectSql = `SELECT ${bucketCol}
      ROUND(IFNULL(SUM(${valueExpr}), 0), 2) AS invoiced,
      ROUND(IFNULL(SUM(CASE WHEN ${PAID} THEN ${valueExpr} END), 0), 2) AS collected${split}${over60}`

  if (buckets) {
    const table = bucketTableSql('mo', buckets)
    const sql = `${selectSql}
FROM ${table.sql}
JOIN INVOICE_STATEMENT s ON s.estado = 1 AND s.statement_type = ${StatementType.GENERIC}
  AND s.id_dealer_provider = ?
  AND ${genericRangeOverlapSql('mo.ms', 'mo.me')}
${opts.dealer.join}
JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
  AND isir.id_employee_work IS NULL AND IFNULL(isir.only_timecard, 0) = 0
${billed}
WHERE 1=1
  ${opts.dealer.and}
  ${unpaidSql}${lineZero}
GROUP BY mo.ms`
    return {
      sql,
      params: [
        ...table.params,
        opts.idDealerProvider,
        ...billedJoinsParams(opts.idDealerProvider),
        ...opts.dealer.params,
      ],
    }
  }

  const sql = `${selectSql}
FROM INVOICE_STATEMENT s
${opts.dealer.join}
JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
  AND isir.id_employee_work IS NULL AND IFNULL(isir.only_timecard, 0) = 0
${billed}
WHERE s.estado = 1 AND s.statement_type = ${StatementType.GENERIC}
  AND s.id_dealer_provider = ?
  ${opts.dealer.and}
  ${overlapLit ? `AND ${overlapLit}` : ''}
  ${unpaidSql}${lineZero}${groupBy === 'statement' ? ' GROUP BY 1' : ''}`
  return {
    sql,
    params: [
      ...billedJoinsParams(opts.idDealerProvider),
      opts.idDealerProvider,
      ...opts.dealer.params,
    ],
  }
}

export function billedStatementCohortSql(
  woIds: BilledLinesSql,
  ttkIds: BilledLinesSql,
  genIds: BilledLinesSql,
  includeZero: boolean,
): BilledLinesSql {
  const zero = applyZeroFilter(includeZero, statementNetNonZeroSql('s'))
  return {
    sql: `SELECT COUNT(*) AS statementsIssued,
            ROUND(100 * SUM(s.sended = 1) / NULLIF(COUNT(*), 0), 1) AS sentPct,
            IFNULL(SUM(s.sended = 0), 0) AS unsentStatements
          FROM (${woIds.sql} UNION ${ttkIds.sql} UNION ${genIds.sql}) ids
          JOIN INVOICE_STATEMENT s ON s.id = ids.id
          WHERE 1=1${zero}`,
    params: [...woIds.params, ...ttkIds.params, ...genIds.params],
  }
}

/**
 * Invoices that still owe something: net unpaid lines summed per invoice ≠ 0.
 * Pass the three sources with debtOnly + groupBy 'statement' (all with or all without
 * withOver60, so the UNION columns match). An invoice whose only unpaid lines are $0,
 * or whose net is $0, owes nothing and is not counted, whatever the "Include zero value"
 * toggle says. Also returns the debt total (and over-60 part) from the same pass.
 */
export function billedOpenCountSql(
  woDebt: BilledLinesSql,
  ttkDebt: BilledLinesSql,
  genDebt: BilledLinesSql,
  withOver60 = false,
): BilledLinesSql {
  return {
    sql: `SELECT SUM(CASE WHEN ROUND(owing.debt, 2) <> 0 THEN 1 ELSE 0 END) AS unpaidStatements,
            ROUND(IFNULL(SUM(owing.debt), 0), 2) AS debt${withOver60 ? `,
            ROUND(IFNULL(SUM(owing.debtOver60), 0), 2) AS debtOver60` : ''}
          FROM (
            SELECT SUM(x.invoiced) AS debt${withOver60 ? ', SUM(x.invoicedOver60) AS debtOver60' : ''}
            FROM (${woDebt.sql} UNION ALL ${ttkDebt.sql} UNION ALL ${genDebt.sql}) x
            GROUP BY x.bucketStart
          ) owing`,
    params: [...woDebt.params, ...ttkDebt.params, ...genDebt.params],
  }
}

export function woPartialOverlapCountSql(
  woIds: BilledLinesSql,
  includeZero: boolean,
  fechaDesde: string,
  fechaHasta: string,
): BilledLinesSql {
  const zero = applyZeroFilter(includeZero, statementNetNonZeroSql('s'))
  return {
    sql: `SELECT COUNT(*) AS partialOverlapWoStatements
          FROM (${woIds.sql}) ids
          JOIN INVOICE_STATEMENT s ON s.id = ids.id
          WHERE (s.fecha_desde < ${sqlDateLit(fechaDesde)} OR s.fecha_hasta > ${sqlDateLit(fechaHasta)})${zero}`,
    params: [...woIds.params],
  }
}
