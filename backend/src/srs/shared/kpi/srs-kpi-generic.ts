/**
 * Shared KPI SQL: generic proration (reuses GET_TOTAL_INV_GENERIC_DATE_RAGE without
 * changing it), invoice net factor, billed joins, and “service not on any active invoice”.
 */

/**
 * Tax (type 6) × discount of GET_TOTAL_BY_STATEMENT, applied per line.
 * GET_SUBTOTAL_BY_STATEMENT only runs for fixed-amount discounts (CASE short-circuit).
 */
export function statementNetFactorSql(s = 's'): string {
  return `((CASE WHEN ${s}.statement_type = 6 THEN 1 + IFNULL(${s}.tax, 0) / 100 ELSE 1 END)
    * (CASE WHEN IFNULL(${s}.discount, 0) = 0 THEN 1
      WHEN ${s}.discount_type = 2
        THEN IFNULL(1 - ${s}.discount / NULLIF(GET_SUBTOTAL_BY_STATEMENT(${s}.id, NULL), 0), 1)
      ELSE 1 - 0.01 * ${s}.discount END))`
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

/** Line amount for a generic (qty × amount × invoice net factor). */
export function genericLineAmountSql(lineAlias = 'isir', statementAlias = 's'): string {
  return `IFNULL(${lineAlias}.generic_qty, 1) * ${lineAlias}.amount * ${statementNetFactorSql(statementAlias)}`
}

/**
 * Prorate a generic line into [fromExpr, toExpr] (inclusive calendar days).
 * Passes qty=1 and amount=qty×amount so SMALLINT rounding does not apply;
 * shifts date_to / filter_to by −1 day so the function’s extra day matches the real period.
 */
export function genericProratedValueSql(
  fromExpr: string,
  toExpr: string,
  statementAlias = 's',
  lineAlias = 'isir',
): string {
  const amount = genericLineAmountSql(lineAlias, statementAlias)
  return `CASE WHEN ${statementAlias}.fecha_desde = ${statementAlias}.fecha_hasta
     THEN ${amount}
     ELSE GET_TOTAL_INV_GENERIC_DATE_RAGE(1, ${statementAlias}.fecha_desde, DATE_SUB(${statementAlias}.fecha_hasta, INTERVAL 1 DAY),
            ${amount}, ${fromExpr}, DATE_SUB(${toExpr}, INTERVAL 1 DAY))
END`
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
