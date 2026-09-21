/**
 * Single source of billed money for Billing, Open AR and the Invoice list.
 * WO / TTK / generic lines with the invoice factor, unique WO services, and paid = line or statement.
 *
 * Two valuations (C1 of plans/plan-invoices-parcial-rango/PLAN.md):
 * - default 'net': tax + discount, real money (Open AR, the money subtitles).
 * - productionValue: the work billed × the invoice discount, no tax, rounded to cents per line.
 *   That is what the Income cards, Partial Invoiced of the list and the Closing Report count, so
 *   the three add up to the same number.
 *
 * TTK statements (type 5) and the punches inside a generic (type 6) are split: the punches of a
 * generic belong to the generic builder, like in the Closing Report.
 */

import {
  StatementType,
  WO_STATEMENT_TYPES,
  statementTypesSqlIn,
} from '../../billing/entity/invoice-statement.srsentity'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import {
  buildDealerFilterSql,
  mysqlWeekBucketStartExpr,
  woPeriodColumn,
  woStatusFilterSql,
} from './srs-kpi-dealer-filter'
import type { SrsKpiDealerFilterSql } from './srs-kpi-dealer-filter'
import {
  billedJoinsParams,
  billedJoinsSql,
  genericLineAmountSql,
  genericProratedValueSql,
  genericRangeOverlapSql,
  lineValuationFactorSql,
  payingBillingJoinsParams,
  payingBillingJoinsSql,
  statementNetFactorSql,
} from './srs-kpi-generic'
import type { LineValuation } from './srs-kpi-generic'
import {
  applyZeroFilter,
  genericLineNonZeroSql,
  statementNetNonZeroSql,
  ttkAmountNonZeroSql,
  woServiceLineNonZeroSql,
} from './srs-kpi-zero-filter'

export type BilledGroupBy = 'none' | 'month' | 'week' | 'statement' | 'row'

export type DateRange = { fechaDesde: string; fechaHasta: string }

export type DateBucket = { start: string; end: string }

export interface BilledLinesSql {
  sql: string
  params: unknown[]
}

export interface BilledLinesOpts {
  idDealerProvider: number
  dealer: SrsKpiDealerFilterSql
  /**
   * Dealer scope of the punches inside a generic (CONTRATISTA on tew.id_dealer). Only the generic
   * builder uses it; without it those punches fall back to the statement dealer scope.
   */
  punchDealer?: SrsKpiDealerFilterSql
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
  /**
   * Value lines as billed production: work × the invoice discount, no tax, rounded to cents per
   * line (C1). A WO with no invoice has no discount.
   */
  productionValue?: boolean
  /**
   * With withPeriodSplit: also return invoicedProduction / collectedProduction (all lines) and
   * invoicedInRangeProduction / collectedInRangeProduction (whole invoices), valued like
   * productionValue, in the same pass as the billed columns.
   */
  withProductionSplit?: boolean
  /** Restrict to these statement ids (the page of the invoice list). */
  statementIdIn?: number[]
  /** WO lines by Done date (i.date_last_chg_workflow + workflow DONE) instead of created date. */
  filterDateDone?: boolean
}

/** What billedBaseOpts needs from a KPI filter or from the invoice list filter. */
export interface BilledBaseFilter {
  idDealerProvider: number
  idUsuario: number
  dealerIds: number[]
  fechaDesde: string
  fechaHasta: string
  includeZero: boolean
  skipDealerRestriction: boolean
  filterDateDone?: boolean
}

const PAID = 'ps.id_statement IS NOT NULL OR pl.id_statement_inv_rel IS NOT NULL'
const UNPAID = 'ps.id_statement IS NULL AND pl.id_statement_inv_rel IS NULL'
const AR_OVER_60_GENERIC_FROM = "'1900-01-01'"
const AR_OVER_60_GENERIC_TO = 'DATE_SUB(CURDATE(), INTERVAL 61 DAY)'

/** Row of the invoice list a line counts in (3.1): 1 balance, 2 whole-invoice payment, 3 own payment. */
const ROW_KEYS_SELECT = `s.id AS stmtId,
      CASE WHEN plr.id_billing IS NOT NULL THEN 3
           WHEN psr.id_billing IS NOT NULL THEN 2 ELSE 1 END AS rowKind,
      COALESCE(plr.id_billing, psr.id_billing) AS rowIdBilling,
      CASE WHEN plr.id_billing IS NOT NULL THEN plr.nro_billed END AS rowNroBilled`

export const ROW_KEY_COLUMNS = ['stmtId', 'rowKind', 'rowIdBilling', 'rowNroBilled'] as const

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

function sqlIdList(ids: number[]): string {
  const clean = ids.map((id) => {
    const n = Number(id)
    if (!Number.isInteger(n)) throw new Error(`invalid statement id: ${id}`)
    return n
  })
  return clean.join(',')
}

/** AND s.id IN (…) for the page of the invoice list; '' when there is no restriction. */
function statementIdInSql(opts: BilledLinesOpts, idExpr: string): string {
  if (!opts.statementIdIn) return ''
  if (opts.statementIdIn.length === 0) return ' AND 1 = 0'
  return ` AND ${idExpr} IN (${sqlIdList(opts.statementIdIn)})`
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
  if (groupBy === 'row') return ' GROUP BY 1, 2, 3, 4'
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

/** In-range invoiced / collected columns for one valuation, with a column-name suffix. */
function periodSplitCols(
  range: DateRange | null | undefined,
  amt: string,
  paidExpr: string,
  suffix = '',
): string {
  const inRange = periodContainedSql('s', range)
  return `,
      ROUND(IFNULL(SUM(CASE WHEN ${inRange} THEN ${amt} ELSE 0 END), 0), 2) AS invoicedInRange${suffix},
      ROUND(IFNULL(SUM(CASE WHEN ${inRange} AND ${paidExpr} THEN ${amt} ELSE 0 END), 0), 2) AS collectedInRange${suffix}`
}

function periodSplitSql(opts: BilledLinesOpts, lineAmt: string, productionAmt: string, paidExpr: string): string {
  if (!opts.withPeriodSplit) return ''
  const billed = periodSplitCols(opts.range, lineAmt, paidExpr)
  if (!opts.withProductionSplit) return billed
  return `${billed},
      ROUND(IFNULL(SUM(${productionAmt}), 0), 2) AS invoicedProduction,
      ROUND(IFNULL(SUM(CASE WHEN ${paidExpr} THEN ${productionAmt} END), 0), 2) AS collectedProduction${periodSplitCols(opts.range, productionAmt, paidExpr, 'Production')}`
}

/** Money columns a builder returns, in SELECT order — the generic wrapper re-sums them. */
function billedValueColumns(opts: BilledLinesOpts): string[] {
  if (opts.groupBy === 'row') return ['partialInvoiced']
  const cols = ['invoiced', 'collected']
  if (opts.withPeriodSplit) {
    cols.push('invoicedInRange', 'collectedInRange')
    if (opts.withProductionSplit) {
      cols.push(
        'invoicedProduction',
        'collectedProduction',
        'invoicedInRangeProduction',
        'collectedInRangeProduction',
      )
    }
  }
  if (opts.withOver60) cols.push('invoicedOver60')
  return cols
}

function billedKeyColumns(opts: BilledLinesOpts): string[] {
  if (opts.groupBy === 'row') return [...ROW_KEY_COLUMNS]
  const g = opts.groupBy ?? 'none'
  return g === 'month' || g === 'week' || g === 'statement' ? ['bucketStart'] : []
}

/** Re-aggregate the two generic sources (free lines + punches) into one result set. */
function sumParts(parts: BilledLinesSql[], keyCols: string[], valueCols: string[]): BilledLinesSql {
  if (parts.length === 1) return parts[0]
  const keys = keyCols.map((c) => `g.${c}`).join(', ')
  const values = valueCols.map((c) => `ROUND(IFNULL(SUM(g.${c}), 0), 2) AS ${c}`).join(',\n      ')
  const group = keyCols.length ? ` GROUP BY ${keyCols.map((_, i) => i + 1).join(', ')}` : ''
  return {
    sql: `SELECT ${keys ? `${keys},\n      ` : ''}${values}
FROM (
${parts.map((p) => p.sql).join('\nUNION ALL\n')}
) g${group}`,
    params: parts.flatMap((p) => p.params),
  }
}

/**
 * Same options for KPIs and for the invoice list, so both count the same lines.
 * rangeOverride: undefined = the filter period; null = no period; otherwise that range.
 */
export function billedBaseOpts(
  filter: BilledBaseFilter,
  rangeOverride?: DateRange | null,
): {
  range: DateRange | null
  wo: BilledLinesOpts
  ttk: BilledLinesOpts
  gen: BilledLinesOpts
} {
  const { idDealerProvider, idUsuario, dealerIds, includeZero, skipDealerRestriction } = filter
  const range =
    rangeOverride === undefined
      ? { fechaDesde: filter.fechaDesde, fechaHasta: filter.fechaHasta }
      : rangeOverride
  const common = {
    idDealerProvider,
    includeZero,
    range,
    filterDateDone: filter.filterDateDone ?? false,
  }
  const ttkDealer = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
  return {
    range,
    wo: {
      ...common,
      dealer: buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction),
    },
    ttk: { ...common, dealer: ttkDealer },
    gen: {
      ...common,
      dealer: buildDealerFilterSql('statement', idUsuario, dealerIds, skipDealerRestriction),
      punchDealer: ttkDealer,
    },
  }
}

export function woBilledLinesSql(opts: BilledLinesOpts): BilledLinesSql {
  const groupBy = opts.groupBy ?? 'none'
  const factor = statementNetFactorSql('s')
  const production = 'isr.price * IFNULL(isr.qty, 1)'
  // Billed production of a WO service: price × qty × the discount of its invoice, to the cent.
  const productionAmt = `ROUND(${production} * ${lineValuationFactorSql('production', 's')}, 2)`
  const lineAmt = opts.productionValue ? productionAmt : `${production} * ${factor}`
  const lineZero = applyZeroFilter(opts.includeZero, woServiceLineNonZeroSql())
  const unpaid = opts.debtOnly
  const idsOnly = opts.idsOnly
  const rowMode = groupBy === 'row'
  const filterDateDone = opts.filterDateDone ?? false
  const periodCol = woPeriodColumn(filterDateDone)
  const params: unknown[] = []

  if (!idsOnly && groupBy === 'week') {
    if (!opts.range) {
      throw new Error('woBilledLinesSql week grouping requires range')
    }
    params.push(opts.range.fechaDesde)
  }

  // With a range, keep the window functions to the in-range invoices: partitions are per invoice,
  // so each one enters whole or not at all and rn / paid stay the same.
  const invScope = opts.range
    ? `JOIN INVOICE i0 ON i0.id = r.id_invoice AND i0.estado = 1 AND i0.id_dealer_provider = ?
      ${woStatusFilterSql(filterDateDone, WorkflowStatus.DONE, 'i0').trim()}
      AND ${woPeriodColumn(filterDateDone, 'i0')} >= ? AND ${woPeriodColumn(filterDateDone, 'i0')} < DATE_ADD(?, INTERVAL 1 DAY)`
    : ''

  const derived = `(
    SELECT r.id AS rel_id, s.id AS stmt_id, r.id_invoice, r.id_invoice_service,
      ROW_NUMBER() OVER (PARTITION BY r.id_invoice, r.id_invoice_service ORDER BY s.id) AS rn,
      MAX(CASE WHEN ${PAID} THEN 1 ELSE 0 END)
        OVER (PARTITION BY r.id_invoice, r.id_invoice_service) AS paid
    FROM INVOICE_STATEMENT s
    JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND IFNULL(r.only_timecard, 0) = 0
    ${billedJoinsSql('s.id', 'r.id')}
    ${invScope}
    WHERE s.estado = 1 AND s.id_dealer_provider = ?
      AND s.statement_type IN (${statementTypesSqlIn(WO_STATEMENT_TYPES)})
  ) w`

  params.push(
    ...billedJoinsParams(opts.idDealerProvider),
    ...(opts.range ? [opts.idDealerProvider, opts.range.fechaDesde, opts.range.fechaHasta] : []),
    opts.idDealerProvider,
  )

  // The two payment joins go after the derived table and before i.id_dealer_provider = ?.
  const rowJoins = rowMode ? payingBillingJoinsSql('s.id', 'w.rel_id') : ''
  if (rowMode) params.push(...payingBillingJoinsParams(opts.idDealerProvider))

  let selectSql: string
  if (idsOnly) {
    selectSql = 'SELECT DISTINCT w.stmt_id AS id'
  } else if (rowMode) {
    selectSql = `SELECT ${ROW_KEYS_SELECT},
      ROUND(SUM(${productionAmt}), 2) AS partialInvoiced`
  } else {
    const split = periodSplitSql(opts, lineAmt, productionAmt, 'w.paid = 1')
    const lag = opts.withAvgDoneToInvoiced
      ? `,
      ROUND(AVG(DATEDIFF(s.fecha_create, i.date_last_chg_workflow)), 1) AS avgDoneToInvoicedDays`
      : ''
    const over60 = opts.withOver60
      ? `,
      ROUND(IFNULL(SUM(CASE WHEN ${periodCol} < DATE_SUB(CURDATE(), INTERVAL 60 DAY) THEN ${lineAmt} ELSE 0 END), 0), 2) AS invoicedOver60`
      : ''
    selectSql = `SELECT ${bucketSelect(groupBy, periodCol)}
      ROUND(IFNULL(SUM(${lineAmt}), 0), 2) AS invoiced,
      ROUND(IFNULL(SUM(CASE WHEN w.paid = 1 THEN ${lineAmt} END), 0), 2) AS collected${split}${lag}${over60}`
  }

  const sql = `${selectSql}
FROM ${derived}
JOIN INVOICE_STATEMENT s ON s.id = w.stmt_id
JOIN INVOICE i ON i.id = w.id_invoice AND i.estado = 1
${opts.dealer.join}
JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id AND isr.id_service_invoice = w.id_invoice_service
${rowJoins}
WHERE w.rn = 1${statementIdInSql(opts, 'w.stmt_id')}
  AND i.id_dealer_provider = ?
  ${opts.dealer.and}
  ${woStatusFilterSql(filterDateDone, WorkflowStatus.DONE)}
  ${dateRangeSql(periodCol, opts.range)}
  ${unpaid ? 'AND w.paid = 0' : ''}${lineZero}${idsOnly ? '' : bucketGroup(groupBy)}`

  params.push(opts.idDealerProvider, ...opts.dealer.params, ...rangeParams(opts.range))
  return { sql, params }
}

/** Punch lines (TTK statements, or the punches inside a generic) — one statement_type list. */
function punchBilledLinesSql(opts: BilledLinesOpts, statementType: StatementType): BilledLinesSql {
  const groupBy = opts.groupBy ?? 'none'
  const factor = statementNetFactorSql('s')
  // Billed production of a punch: its amount × the discount of its invoice, to the cent.
  const productionAmt = `ROUND(isir.amount * ${lineValuationFactorSql('production', 's')}, 2)`
  const lineAmt = opts.productionValue ? productionAmt : `isir.amount * ${factor}`
  const lineZero = applyZeroFilter(opts.includeZero, ttkAmountNonZeroSql())
  const unpaid = opts.debtOnly
  const idsOnly = opts.idsOnly
  const rowMode = groupBy === 'row'
  const dealer =
    statementType === StatementType.GENERIC ? (opts.punchDealer ?? opts.dealer) : opts.dealer
  const params: unknown[] = []

  if (!idsOnly && groupBy === 'week') {
    if (!opts.range) {
      throw new Error('punchBilledLinesSql week grouping requires range')
    }
    params.push(opts.range.fechaDesde)
  }

  let selectSql: string
  if (idsOnly) {
    selectSql = 'SELECT DISTINCT s.id AS id'
  } else if (rowMode) {
    selectSql = `SELECT ${ROW_KEYS_SELECT},
      ROUND(SUM(${productionAmt}), 2) AS partialInvoiced`
  } else {
    const split = periodSplitSql(opts, lineAmt, productionAmt, `(${PAID})`)
    const over60 = opts.withOver60
      ? `,
      ROUND(IFNULL(SUM(CASE WHEN tew.punch_in < DATE_SUB(CURDATE(), INTERVAL 60 DAY) THEN ${lineAmt} ELSE 0 END), 0), 2) AS invoicedOver60`
      : ''
    selectSql = `SELECT ${bucketSelect(groupBy, 'tew.punch_in')}
      ROUND(IFNULL(SUM(${lineAmt}), 0), 2) AS invoiced,
      ROUND(IFNULL(SUM(CASE WHEN ${PAID} THEN ${lineAmt} END), 0), 2) AS collected${split}${over60}`
  }

  params.push(opts.idDealerProvider, ...billedJoinsParams(opts.idDealerProvider))
  const rowJoins = rowMode ? payingBillingJoinsSql('s.id', 'isir.id') : ''
  if (rowMode) params.push(...payingBillingJoinsParams(opts.idDealerProvider))
  params.push(opts.idDealerProvider)

  const sql = `${selectSql}
FROM INVOICE_STATEMENT s
JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
  AND isir.id_employee_work IS NOT NULL AND IFNULL(isir.only_timecard, 0) = 0
JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work AND tew.estado = 1
  AND tew.id_dealer_provider = ?
${dealer.join}
${billedJoinsSql('s.id', 'isir.id')}
${rowJoins}
WHERE s.estado = 1 AND s.id_dealer_provider = ?
  AND s.statement_type = ${statementType}${statementIdInSql(opts, 's.id')}
  ${dealer.and}
  ${dateRangeSql('tew.punch_in', opts.range)}
  ${unpaid ? `AND ${UNPAID}` : ''}${lineZero}${idsOnly ? '' : bucketGroup(groupBy)}`

  params.push(...dealer.params, ...rangeParams(opts.range))
  return { sql, params }
}

/** TTK Invoiced: punches of TTK statements (type 5) only — a generic's punches go to Generic. */
export function ttkBilledLinesSql(opts: BilledLinesOpts): BilledLinesSql {
  return punchBilledLinesSql(opts, StatementType.TTK)
}

function genericOver60Expr(): string {
  const prorated = genericProratedValueSql(AR_OVER_60_GENERIC_FROM, AR_OVER_60_GENERIC_TO)
  const overlap = genericRangeOverlapSql(AR_OVER_60_GENERIC_FROM, AR_OVER_60_GENERIC_TO)
  return `CASE WHEN ${overlap} THEN ${prorated} ELSE 0 END`
}

function genericValueForOpts(
  opts: BilledLinesOpts,
  buckets: DateBucket[] | undefined,
  valuation: LineValuation,
): string {
  if (buckets) {
    return genericProratedValueSql('mo.ms', 'mo.me', 's', 'isir', valuation)
  }
  if (opts.range) {
    return genericProratedValueSql(
      sqlDateLit(opts.range.fechaDesde),
      sqlDateLit(opts.range.fechaHasta),
      's',
      'isir',
      valuation,
    )
  }
  return genericLineAmountSql('isir', 's', valuation)
}

/** Free lines (no punch) of a generic, prorated over the days of its period. */
function genericFreeLinesSql(opts: BilledLinesOpts): BilledLinesSql {
  const groupBy = opts.groupBy ?? 'none'
  const lineZero = applyZeroFilter(opts.includeZero, genericLineNonZeroSql())
  const unpaid = opts.debtOnly
  const idsOnly = opts.idsOnly
  const rowMode = groupBy === 'row'

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
  const idIn = statementIdInSql(opts, 's.id')

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
  AND s.id_dealer_provider = ?${idIn}
  ${opts.dealer.and}
  ${overlapLit ? `AND ${overlapLit}` : ''}
  ${unpaidSql}${lineZero}`
    return { sql, params }
  }

  const valueExpr = genericValueForOpts(opts, buckets, opts.productionValue ? 'production' : 'net')
  const productionExpr = genericValueForOpts(opts, buckets, 'production')
  const rowJoins = rowMode ? payingBillingJoinsSql('s.id', 'isir.id') : ''
  const rowParams = rowMode ? payingBillingJoinsParams(opts.idDealerProvider) : []

  let selectSql: string
  if (rowMode) {
    selectSql = `SELECT ${ROW_KEYS_SELECT},
      ROUND(SUM(${productionExpr}), 2) AS partialInvoiced`
  } else {
    const split = periodSplitSql(opts, valueExpr, productionExpr, `(${PAID})`)
    const over60 = opts.withOver60
      ? `,
      ROUND(IFNULL(SUM(${genericOver60Expr()}), 0), 2) AS invoicedOver60`
      : ''
    const bucketCol = buckets
      ? 'mo.ms AS bucketStart,'
      : groupBy === 'statement'
        ? 's.id AS bucketStart,'
        : ''
    selectSql = `SELECT ${bucketCol}
      ROUND(IFNULL(SUM(${valueExpr}), 0), 2) AS invoiced,
      ROUND(IFNULL(SUM(CASE WHEN ${PAID} THEN ${valueExpr} END), 0), 2) AS collected${split}${over60}`
  }

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
${rowJoins}
WHERE 1=1${idIn}
  ${opts.dealer.and}
  ${unpaidSql}${lineZero}
GROUP BY mo.ms`
    return {
      sql,
      params: [
        ...table.params,
        opts.idDealerProvider,
        ...billedJoinsParams(opts.idDealerProvider),
        ...rowParams,
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
${rowJoins}
WHERE s.estado = 1 AND s.statement_type = ${StatementType.GENERIC}
  AND s.id_dealer_provider = ?${idIn}
  ${opts.dealer.and}
  ${overlapLit ? `AND ${overlapLit}` : ''}
  ${unpaidSql}${lineZero}${bucketGroup(groupBy)}`
  return {
    sql,
    params: [
      ...billedJoinsParams(opts.idDealerProvider),
      ...rowParams,
      opts.idDealerProvider,
      ...opts.dealer.params,
    ],
  }
}

/**
 * Generic Invoiced: the free lines of a generic prorated over the range, plus the punches inside
 * that generic counted by their punch date — the same two parts as the Closing Report (D7).
 */
export function genericBilledLinesSql(opts: BilledLinesOpts): BilledLinesSql {
  const free = genericFreeLinesSql(opts)
  const punches = punchBilledLinesSql(opts, StatementType.GENERIC)
  if (opts.idsOnly) {
    return {
      sql: `${free.sql}
UNION
${punches.sql}`,
      params: [...free.params, ...punches.params],
    }
  }
  return sumParts([free, punches], billedKeyColumns(opts), billedValueColumns(opts))
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
          STRAIGHT_JOIN INVOICE_STATEMENT s ON s.id = ids.id
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
          STRAIGHT_JOIN INVOICE_STATEMENT s ON s.id = ids.id
          WHERE (s.fecha_desde < ${sqlDateLit(fechaDesde)} OR s.fecha_hasta > ${sqlDateLit(fechaHasta)})${zero}`,
    params: [...woIds.params],
  }
}
