/**
 * «El sistema está ocupado»: el backend Nest responde 503 con `code: 'DB_POOL_BUSY'` cuando
 * un pedido esperó demasiado una conexión libre a la base (plans/plan-pool-v0-saturacion).
 * Las pantallas lo muestran con `t('common.serverBusy')` y react-query no lo reintenta.
 */
export const DB_POOL_BUSY = 'DB_POOL_BUSY'

export class SrsBusyError extends Error {
  readonly status = 503
  readonly code = DB_POOL_BUSY

  constructor(message = 'The system is busy right now. Please try again in a minute.') {
    super(message)
    this.name = 'SrsBusyError'
  }
}

export function isSrsBusy(res: Response): boolean {
  return res.status === 503
}

/** `SrsBusyError` o cualquier error que traiga `code: 'DB_POOL_BUSY'` (p.ej. GenericInvoiceApiError). */
export function isSrsBusyError(e: unknown): boolean {
  if (e instanceof SrsBusyError) return true
  return (e as { code?: unknown } | null | undefined)?.code === DB_POOL_BUSY
}
