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

/**
 * Las filas tildadas como las manda el Billing viejo (`getIdsBillingSelected`):
 * "idStatement,idBilling|idStatement,idBilling", con -1 cuando la fila es la del saldo. El PHP
 * (`idsBillingInOr`) filtra por cheque, no por nro_billed: tildar TW641-3 trae también TW641-5.
 */
export function idsBillingOf(rows: { id: number; idBilling?: number | null }[]): string {
  const pairs = new Set<string>()
  for (const r of rows) {
    pairs.add(`${r.id},${r.idBilling && r.idBilling > 0 ? r.idBilling : -1}`)
  }
  return [...pairs].join('|')
}

export function isInvoiceRemainder(row: { nroBilled?: number | null }): boolean {
  return row.nroBilled == null
}
