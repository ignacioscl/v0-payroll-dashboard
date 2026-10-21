/**
 * Variables del job `car-vin-recheck` (plans/plan-vin-recheck §3.4.1), leídas en un solo lugar.
 * El token es el mismo valor que `vin_recheck_token` del config.ini del PHP.
 */

/** Token del endpoint PHP; sin él el job termina `failed` antes de la primera llamada. */
export function vinRecheckPhpToken(): string {
  return process.env.VIN_RECHECK_PHP_TOKEN?.trim() ?? ''
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

/** Días desde el alta a partir de los cuales se consulta (D5: 15). */
export function vinRecheckDaysFrom(): number {
  return positiveInt(process.env.VIN_RECHECK_DAYS_FROM, 15)
}

/** Días desde el alta después de los cuales se deja de consultar (D5: 180). */
export function vinRecheckDaysTo(): number {
  return positiveInt(process.env.VIN_RECHECK_DAYS_TO, 180)
}

/** Base del PHP (la misma que usa el export de invoices). */
export function srsApiUrl(): string {
  return process.env.SRS_API_URL?.trim() ?? ''
}
