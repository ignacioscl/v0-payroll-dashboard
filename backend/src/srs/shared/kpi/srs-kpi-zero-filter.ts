/**
 * Legacy parity: excludeCeros / not_show_total_0 — zero-value WO/invoice rows are
 * excluded unless includeZero is true (default false).
 */

export function statementTotalExpr(alias: string): string {
  return `GET_TOTAL_BY_STATEMENT(${alias}.id, ${alias}.discount, NULL, ${alias}.discount_type, NULL)`
}

export function statementHasPositiveTotalSql(alias: string): string {
  return ` AND ${statementTotalExpr(alias)} > 0`
}

export function woServiceLinePositiveSql(): string {
  return ' AND (isr.price * IFNULL(isr.qty, 1)) > 0'
}

export function woHasPositiveTotalSql(invoiceAlias = 'i'): string {
  return ` AND EXISTS (
    SELECT 1 FROM INVOICE_SERVICE_REL isr_z
    WHERE isr_z.id_invoice = ${invoiceAlias}.id
      AND (isr_z.price * IFNULL(isr_z.qty, 1)) > 0
  )`
}

export function ttkAmountPositiveSql(): string {
  return ' AND IFNULL(isir.amount, 0) > 0'
}

export function genericLinePositiveSql(): string {
  return ' AND (IFNULL(isir.amount, 0) * IFNULL(CASE WHEN isir.id_employee_work IS NULL THEN isir.generic_qty ELSE 1 END, 1)) > 0'
}

export function dailyReportPositiveSql(): string {
  return ' AND GET_SERVICES_TOTAL_BY_DAILY_REPORT(ldr.id) > 0'
}

export function applyZeroFilter(includeZero: boolean, clause: string): string {
  return includeZero ? '' : clause
}
