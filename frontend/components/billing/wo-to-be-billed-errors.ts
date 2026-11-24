import { isSrsBusyError } from '@/lib/srs-busy-error'
import { isSrsNestApiError } from '@/lib/srs-nest-client'

type T = (key: 'common.serverBusy') => string

/**
 * El texto de un error de WO to be Billed (plans/plan-wo-to-be-billed-v0, §6 y T10): servidor ocupado (`RETRY`, 409 del
 * candado; o `DB_POOL_BUSY`) → `common.serverBusy`; si no, el mensaje que mandó el Nest (en inglés, como Generic; tarea
 * `errores-nest-traducidos`).
 */
export function woErrorMessage(err: unknown, t: T): string {
  if (isSrsBusyError(err)) return t('common.serverBusy')
  if (isSrsNestApiError(err) && err.code === 'RETRY') return t('common.serverBusy')
  if (err instanceof Error && err.message) return err.message
  return t('common.serverBusy')
}
