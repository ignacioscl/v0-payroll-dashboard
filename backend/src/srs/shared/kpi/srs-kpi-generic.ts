/**
 * Shared KPI SQL: generic proration (GET_TOTAL_INV_GENERIC_DATE_RAGE), invoice net factor,
 * billed joins, and “service not on any active invoice”.
 */

/**
 * How a line is valued.
 * - 'net': tax (type 6) × invoice discount — real money, like GET_TOTAL_BY_STATEMENT (Open AR,
 *   the money subtitles).
 * - 'production': the work billed, with the invoice discount and without tax (C1 of
 *   plans/plan-invoices-parcial-rango/PLAN.md: Income cards, Partial Invoiced and the Closing).
 */
export type LineValuation = 'net' | 'production'

/**
 * Tax (type 6) × discount of GET_TOTAL_BY_STATEMENT, applied per line.
 * GET_SUBTOTAL_BY_STATEMENT only runs for fixed-amount discounts (CASE short-circuit).
 */
export function statementNetFactorSql(s = 's'): string {
  return `((CASE WHEN ${s}.statement_type = 6 THEN 1 + IFNULL(${s}.tax, 0) / 100 ELSE 1 END)
    * ${statementDiscountFactorSql(s)})`
}

/**
 * Tax of a generic (type 6) as a per-line factor, no discount: a line at price with its tax, the
 * way GET_SUBTOTAL_BY_STATEMENT counts it. Same CASE as the first half of statementNetFactorSql.
 */
export function statementTaxFactorSql(s = 's'): string {
  return `(CASE WHEN ${s}.statement_type = 6 THEN 1 + IFNULL(${s}.tax, 0) / 100 ELSE 1 END)`
}

/** Discount of GET_TOTAL_BY_STATEMENT as a per-line factor (no tax). */
export function statementDiscountFactorSql(s = 's'): string {
  return `(CASE WHEN IFNULL(${s}.discount, 0) = 0 THEN 1
      WHEN ${s}.discount_type = 2
        THEN IFNULL(1 - ${s}.discount / NULLIF(GET_SUBTOTAL_BY_STATEMENT(${s}.id, NULL), 0), 1)
      ELSE 1 - 0.01 * ${s}.discount END)`
}

/** Factor for one valuation mode. */
export function lineValuationFactorSql(valuation: LineValuation, s = 's'): string {
  return valuation === 'net' ? statementNetFactorSql(s) : statementDiscountFactorSql(s)
}

/** BILLING.estado = 1 on the statement or the line. Two LEFT JOINs — no OR + correlated IN. */
export function billedJoinsSql(statementIdExpr: string, lineIdExpr: string): string {
  return `
LEFT JOIN (SELECT DISTINCT bwr.id_statement FROM BILLING_WO_REL bwr
  JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1 AND b.id_dealer_provider = ?
  WHERE bwr.id_statement IS NOT NULL) ps ON ps.id_statement = ${statementIdExpr}
LEFT JOIN (SELECT DISTINCT bwr.id_statement_inv_rel FROM BILLING_WO_REL bwr
  JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1 AND b.id_dealer_provider = ?
  WHERE bwr.id_statement_inv_rel IS NOT NULL) pl ON pl.id_statement_inv_rel = ${lineIdExpr}`
}

export function billedJoinsParams(idDealerProvider: number): number[] {
  return [idDealerProvider, idDealerProvider]
}

/**
 * Same two payments as billedJoinsSql, but carrying which payment (and which nro_billed) pays the
 * line — that is what tells in which row of the invoice list a line counts (3.1 of the plan).
 * DISTINCT is mandatory: 8 lines share a repeated BILLING_WO_REL row.
 */
export function payingBillingJoinsSql(statementIdExpr: string, lineIdExpr: string): string {
  return `
LEFT JOIN (SELECT DISTINCT bwr.id_statement_inv_rel, bwr.id_billing, bwr.nro_billed
  FROM BILLING_WO_REL bwr
  JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1 AND b.id_dealer_provider = ?
  WHERE bwr.id_statement_inv_rel IS NOT NULL) plr ON plr.id_statement_inv_rel = ${lineIdExpr}
LEFT JOIN (SELECT DISTINCT bwr.id_statement, bwr.id_billing
  FROM BILLING_WO_REL bwr
  JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1 AND b.id_dealer_provider = ?
  WHERE bwr.id_statement IS NOT NULL) psr ON psr.id_statement = ${statementIdExpr}`
}

export function payingBillingJoinsParams(idDealerProvider: number): number[] {
  return [idDealerProvider, idDealerProvider]
}

/** A free line of a generic at price: effective qty (empty or 0 = 1) × amount, no factor. */
export function genericLineBaseSql(lineAlias = 'isir'): string {
  return `IF(IFNULL(${lineAlias}.generic_qty, 0) > 0, ${lineAlias}.generic_qty, 1) * ${lineAlias}.amount`
}

/**
 * Line amount for a generic: effective qty (empty or 0 = 1) × amount × the valuation factor.
 */
export function genericLineAmountSql(
  lineAlias = 'isir',
  statementAlias = 's',
  valuation: LineValuation = 'net',
): string {
  return `${genericLineBaseSql(lineAlias)} * ${lineValuationFactorSql(valuation, statementAlias)}`
}

/**
 * Prorate a generic line into [fromExpr, toExpr] (inclusive calendar days).
 * Passes qty=1 and amount=qty×amount×factor so the function only splits by days.
 * Needs migration 005: the old body counted one extra day and rounded qty to an integer, and v0
 * compensated for it here (Tarea 3 of plans/plan-invoices-parcial-rango/PLAN.md).
 */
export function genericProratedValueSql(
  fromExpr: string,
  toExpr: string,
  statementAlias = 's',
  lineAlias = 'isir',
  valuation: LineValuation = 'net',
): string {
  const amount = genericLineAmountSql(lineAlias, statementAlias, valuation)
  return `GET_TOTAL_INV_GENERIC_DATE_RAGE(1, ${statementAlias}.fecha_desde, ${statementAlias}.fecha_hasta,
            ${amount}, ${fromExpr}, ${toExpr})`
}

/** Generic period overlaps the filter range (DATE columns, both ends inclusive). */
export function genericRangeOverlapSql(
  fromExpr: string,
  toExpr: string,
  statementAlias = 's',
): string {
  return `${statementAlias}.fecha_desde <= ${toExpr} AND ${statementAlias}.fecha_hasta >= ${fromExpr}`
}

/**
 * Service line is not on any active invoice (estado = 1), same idea as WO_IS_FULL_INVOICED
 * using IS_INVOICE_ACTIVE = estado = 1.
 */
export function woServiceNotInvoicedSql(invoiceAlias = 'i', serviceRelAlias = 'isr'): string {
  return `NOT EXISTS (SELECT 1 FROM INVOICE_STATEMENT_INV_REL rx
  JOIN INVOICE_STATEMENT sx ON sx.id = rx.id_statement AND sx.estado = 1
  WHERE rx.id_invoice = ${invoiceAlias}.id AND rx.id_invoice_service = ${serviceRelAlias}.id_service_invoice)`
}
