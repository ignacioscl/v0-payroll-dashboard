/**
 * Display suffix for invoice clones. Mirrors
 * app.binvoice_main_table_inv.js (nroBilled > 0 → `-N`, < 0 → `*N`).
 */
export function formatFullNroWithNroBilled(
  fullNro: string,
  nroBilled: number | null | undefined,
): string {
  if (!fullNro) return ''
  if (nroBilled == null || nroBilled === 0) return fullNro
  if (nroBilled > 0) return `${fullNro}-${nroBilled}`
  return `${fullNro}*${Math.abs(nroBilled)}`
}

/**
 * Identidad de una fila del listado: (invoice, cobro, nro_billed, id_billing_wo_rel). Sin el
 * nro_billed, TW641-3 y TW641-5 del mismo cheque compartían la clave (T11).
 */
export function invoiceRowKey(row: {
  id: number
  idBilling?: number | null
  nroBilled?: number | null
  idBillingWoRel?: number | null
}): string {
  return `${row.id}:${row.idBilling ?? 0}:${row.nroBilled ?? 'x'}:${row.idBillingWoRel ?? 'x'}`
}

export function uniqueStatementIds(rows: { id: number }[]): number[] {
  return [...new Set(rows.map((r) => r.id))]
}

export function isInvoiceRemainder(row: { nroBilled?: number | null }): boolean {
  return row.nroBilled == null
}
