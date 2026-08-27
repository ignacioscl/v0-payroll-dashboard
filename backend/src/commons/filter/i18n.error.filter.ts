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

    const anyEx = exception as unknown as {
      message?: string
      i18nKey?: string
      replacements?: string[]
      validationErrors?: unknown
      httpStatus?: number
      status?: number
      code?: string
      meta?: Record<string, unknown>
      getStatus?: () => number
    }
    const message = anyEx?.message ?? exception.message
    const i18nKey = anyEx?.i18nKey ?? exception.i18nKey
    const replacements = anyEx?.replacements ?? exception.replacements
    const validations = anyEx.validationErrors ?? ''
    const httpStatus =
      exception.httpStatus ||
      (typeof anyEx.getStatus === 'function' ? anyEx.getStatus() : undefined) ||
      anyEx.status ||
      500
    const code = anyEx.code
    const meta = anyEx.meta

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
      statusCode: httpStatus,
      ...(code ? { code } : {}),
      ...(meta ? { meta } : {}),
    } as I18nErrorDto)
  }
}
