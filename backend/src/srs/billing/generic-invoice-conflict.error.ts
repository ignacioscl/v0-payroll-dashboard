import { HttpStatus } from '@nestjs/common'

import { DataError } from '../../commons/errors/data.error'

export type GenericInvoiceConflictCode =
  | 'STATEMENT_PAID'
  | 'LINE_PAID'
  | 'EMPLOYEE_NO_ROWS'
  | 'RETRY'

export class GenericInvoiceConflictError extends DataError {
  code: GenericInvoiceConflictCode
  meta?: Record<string, unknown>

  constructor(
    code: GenericInvoiceConflictCode,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    super(HttpStatus.CONFLICT, message, HttpStatus.CONFLICT)
    this.code = code
    this.meta = meta
  }
}
