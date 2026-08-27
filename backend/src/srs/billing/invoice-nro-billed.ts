/**
 * Display suffix for invoice clones. Mirrors
 * app.binvoice_main_table_inv.js (nroBilled > 0 → `-N`, < 0 → `*N`).
 * nroBilled 0 / null → no suffix. Do not use InvoiceStatement::getFullNroWithNroBilled.
 */
export function formatFullNroWithNroBilled(
  fullNro: string,
  nroBilled: number | null | undefined,
): string {
  if (nroBilled == null || nroBilled === 0) return fullNro
  if (nroBilled > 0) return `${fullNro}-${nroBilled}`
  return `${fullNro}*${Math.abs(nroBilled)}`
}
