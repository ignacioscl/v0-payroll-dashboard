/**
 * Statement line/value SQL shared by billing & collections KPIs.
 * Avoids per-row stored functions (IS_STATEMENT_BILLED, GET_TOTAL_BY_STATEMENT_*).
 * See frontend/KPI-QUERIES.md §2 and §3.
 */

/** Value of one INVOICE_STATEMENT_INV_REL row (alias `r`). */
export const statementLineValueExpr = `
  CASE
    WHEN r.amount IS NOT NULL THEN IFNULL(r.generic_qty, 1) * r.amount
    ELSE (
      SELECT IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)
      FROM INVOICE_SERVICE_REL isr
      WHERE isr.id_invoice = r.id_invoice
    )
  END`

/** Per-statement subtotal from lines (alias `sv`). */
export const statementValueSubquery = `
  SELECT r.id_statement,
         SUM(${statementLineValueExpr}) AS value
  FROM INVOICE_STATEMENT_INV_REL r
  WHERE r.only_timecard = 0
  GROUP BY r.id_statement`

/** Statement has no unpaid billable lines (alias `s`). */
export const statementFullyPaidSql = `
  NOT EXISTS (
    SELECT 1
    FROM INVOICE_STATEMENT_INV_REL r2
    WHERE r2.id_statement = s.id
      AND r2.only_timecard = 0
      AND r2.pagado = 0
  )`
