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
