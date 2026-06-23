import { HttpStatus } from '@nestjs/common'
export class GenericError extends Error {
  type: string

  status: number

  httpStatus?: HttpStatus

  constructor(status: number, message: string, type = 'GenericError', httpStatus?: HttpStatus) {
    super(message)
    this.type = type
    this.status = status
    this.httpStatus = httpStatus
  }
}
