/**
 * Legacy parity: when multiple dealers are selected, email account history is
 * loaded without a dealer filter (`id_dealer` empty). Single dealer → that id.
 */
export function resolveInvoiceEmailAccountsDealerParam(idDealer: string): string {
  const parts = idDealer
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length !== 1) return ''
  return parts[0]
}
