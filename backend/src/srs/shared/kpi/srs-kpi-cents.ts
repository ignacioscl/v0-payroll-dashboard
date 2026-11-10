/**
 * Plata en centavos enteros: cada línea se lleva a centavos una vez y después se suma. Lo usan el
 * Monthly Closing y el Income by Dealer por servicio.
 */
export const toCents = (n: number): number => Math.round(n * 100)
export const fromCents = (c: number): number => c / 100
