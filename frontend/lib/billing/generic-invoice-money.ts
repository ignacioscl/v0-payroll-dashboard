/** Integer-cent rounding that matches MySQL DECIMAL half-away-from-zero. */

export function aCentavos(n: number): number {
  return Math.round(n * 100)
}

export function dividirYRedondear(numerador: number, divisor: number): number {
  const signo = numerador < 0 ? -1 : 1
  return signo * Math.trunc((Math.abs(numerador) + divisor / 2) / divisor)
}

export function valorLinea(importe: number, cantidad: number | null): number {
  return aCentavos(importe) * (cantidad == null ? 100 : aCentavos(cantidad))
}

export function valorLineaTtk(amountDealer: number): number {
  return aCentavos(amountDealer) * 100
}

export function centsToPesos(cents: number): number {
  return cents / 100
}

export function lineCents(item: {
  kind?: string
  unitAmount?: number
  qty?: number | null
  amountDealer?: number
  idRels?: number[]
  onlyTimecard?: boolean
}): number {
  if (item.kind === 'ttk') {
    const amount = !item.idRels?.length && item.onlyTimecard ? 0 : Number(item.amountDealer ?? 0)
    return valorLineaTtk(amount)
  }
  return valorLinea(Number(item.unitAmount ?? 0), item.qty ?? null)
}

export function invoiceTotalsCents(
  items: Array<Parameters<typeof lineCents>[0]>,
  taxPercent: number | null,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  const raw = items.reduce((sum, row) => sum + lineCents(row), 0)
  const subtotalCents = dividirYRedondear(raw, 100)
  const taxCents =
    taxPercent != null && taxPercent > 0
      ? dividirYRedondear(subtotalCents * Math.round(taxPercent * 1000), 100000)
      : 0
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents }
}

/** Percent discount: round once at the end. `descuentoBp` 23% → 2300. */
export function applyDiscountCents(
  baseCents: number,
  discount: number | null,
  discountType: number | null,
): number {
  if (discount == null || discount === 0) return baseCents
  if (discountType === 2) return baseCents - aCentavos(discount)
  const descuentoBp = Math.round(discount * 100)
  return dividirYRedondear(baseCents * (10000 - descuentoBp), 10000)
}
