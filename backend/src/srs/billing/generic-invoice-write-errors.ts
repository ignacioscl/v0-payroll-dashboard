import { QueryFailedError } from 'typeorm'

import { GenericInvoiceConflictError } from './generic-invoice-conflict.error'

export function mysqlErrno(err: unknown): number | undefined {
  if (!(err instanceof QueryFailedError)) return undefined
  const driver = err.driverError as { errno?: number; code?: string } | undefined
  return driver?.errno
}

export function isDupEntry(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false
  const driver = err.driverError as { errno?: number; code?: string } | undefined
  return driver?.errno === 1062 || driver?.code === 'ER_DUP_ENTRY'
}

export function assertRelWriteAffected(affectedRows: number): void {
  if (affectedRows < 1) {
    throw new GenericInvoiceConflictError(
      'LINE_PAID',
      'A billed line cannot be changed.',
    )
  }
}

export function conflictFromMysql(err: unknown): GenericInvoiceConflictError | null {
  const errno = mysqlErrno(err)
  if (errno === 1451) {
    return new GenericInvoiceConflictError(
      'LINE_PAID',
      'A billed line cannot be changed.',
    )
  }
  if (errno === 1213 || errno === 1205) {
    return new GenericInvoiceConflictError(
      'RETRY',
      'Could not save because another change is in progress. Retry.',
    )
  }
  return null
}
