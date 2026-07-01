import { HttpStatus, Inject, Injectable, forwardRef } from '@nestjs/common'

import { DataError } from 'src/commons/errors/data.error'
import { GlobalBaseService } from 'src/commons/service/global.base.service'

import { I18nError } from 'src/commons/errors/i18n.error'

@Injectable()
export class UtilsService {
  constructor() {}

  convertToCamelCase = (str: string) => {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())
  }
}
