import { HttpStatus } from '@nestjs/common'
import { IdetailError } from './data.error'
export class I18nError extends Error {
  i18nKey: string
  httpStatus: HttpStatus
  replacements?: string[]

  constructor(i18nKey: string, httpStatus: HttpStatus, replacements?: string[]) {
    super()
    this.httpStatus = httpStatus
    this.replacements = replacements
    this.i18nKey = i18nKey
  }
}
