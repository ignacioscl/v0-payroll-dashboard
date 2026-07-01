import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject } from '@nestjs/common'
import { Response } from 'express'

import { LoggerSystem } from '../logs/logger.system'
import { I18nError } from '../errors/i18n.error'
import { I18nErrorDto } from '../errors/i18nErrorDto'

@Catch(Error)
export class I18nErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerSystem) {
    logger.setContext(I18nErrorFilter.name)
  }
  catch(exception: I18nError, host: ArgumentsHost) {
    this.logger.error('I18nErrorFilter:22', exception)
    console.log('exception', exception, (exception as any).status)
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const message = exception?.message ?? exception.message
    const i18nKey = exception?.i18nKey ?? exception.i18nKey
    const replacements = exception?.replacements ?? exception.replacements
    const validations = (exception as any).validationErrors ?? ''
    const httpStatus = exception.httpStatus || (exception as any).status || 500

    /*Sentry.addBreadcrumb({
      message: exception.message,
      data: request.body ?? undefined,
      category: request.url,
      level: httpStatus >= 500 ? 'fatal' : 'error',
    })
    Sentry.captureException(exception)*/
    response.status(httpStatus).json({
      path: request.url,
      message,
      i18nKey,
      replacements,
      validationErrors: validations,
      body: request.body ?? undefined,
      method: request.method ?? undefined,
    } as I18nErrorDto)
  }
}
