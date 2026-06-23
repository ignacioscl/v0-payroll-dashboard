import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { Response } from 'express'
import * as Sentry from '@sentry/node'

@Catch(HttpException)
export class ErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const exMessage = exception.getResponse() as { message?: string }
    const message = exMessage?.message ?? exception.message
    const status = exception.getStatus() || 500

    Sentry.addBreadcrumb({
      message: exception.message,
      data: request.body ?? undefined,
      category: request.url,
      level: status >= 500 ? 'fatal' : 'error',
    })
    Sentry.captureException(exception)
    response.status(status).json({
      statusCode: status,
      path: request.url,
      message,
    })
  }
}
