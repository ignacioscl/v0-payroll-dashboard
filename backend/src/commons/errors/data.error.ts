import { HttpStatus } from '@nestjs/common'
export class DataError extends Error {
  type: string

  status: string
  validationErrors: IdetailError[]
  httpStatus?: HttpStatus
  description?: string
  constructor(
    status: string | number,
    message: string,
    httpStatus?: HttpStatus,
    description?: string,
    validationErrors?: IdetailError[],
  ) {
    super(message)
    this.status = status as any
    this.httpStatus = httpStatus
    this.description = description
    this.validationErrors = validationErrors!
  }
}

export interface IdetailError {
  field: string
  message: string
}
