import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import * as Sentry from '@sentry/node'
import { Request, Response } from 'express'

import { LoggerSystem } from '../logs/logger.system'
import { appendErrorLine } from '../logs/error-log-file'
import { DataError } from '../errors/data.error'
import { I18nError } from '../errors/i18n.error'
import { I18nErrorDto } from '../errors/i18nErrorDto'

type AnyError = {
  name?: string
  message?: string
  stack?: string
  i18nKey?: string
  replacements?: string[]
  validationErrors?: unknown
  httpStatus?: unknown
  status?: unknown
  code?: string
  meta?: Record<string, unknown>
  getStatus?: () => number
}

/**
 * Error «de negocio»: lo tiró el código a propósito para que el usuario lo lea (validación, 403,
 * 404, «sistema ocupado» del pool, conflicto de Generic). Conserva su mensaje. Todo lo demás (un
 * `Error` suelto, un `QueryFailedError`, el corte de MySQL) es interno: sale 500 sin mensaje
 * (plans/plan-buenas-practicas-v0, 2.1.2). No alcanza con mirar `httpStatus`: el `DataError` de las
 * validaciones llega con `httpStatus` vacío y `status` 400.
 */
export function isBusinessError(exception: unknown): boolean {
  if (exception instanceof I18nError || exception instanceof DataError || exception instanceof HttpException) {
    return true
  }
  const ex = exception as AnyError | null
  return typeof ex?.httpStatus === 'number' || typeof ex?.status === 'number'
}

export function resolveHttpStatus(exception: unknown): number {
  const ex = (exception ?? {}) as AnyError
  const fromGetStatus = typeof ex.getStatus === 'function' ? ex.getStatus() : undefined
  const status = (ex.httpStatus as number) || fromGetStatus || (ex.status as number) || 500
  return typeof status === 'number' ? status : Number(status) || 500
}

/** Ruta sin query: la del controlador si Express la resolvió, si no la URL cortada en `?`. */
function routeOf(request: Request): string | undefined {
  const routePath = (request as Request & { route?: { path?: string } }).route?.path
  if (routePath) return routePath
  return request.url?.split('?')[0]
}

/**
 * Único filtro global (`main` → `configureApp`). Nest evalúa los filtros globales al revés, así que
 * un `@Catch(Error)` registrado último dejaba mudos a los demás y a Sentry: queda uno solo.
 * La respuesta nunca lleva el body del pedido. Los 5xx van al archivo de errores y a Sentry (sin
 * DSN no manda nada), sin body, encabezados ni query.
 */
@Catch(Error)
export class I18nErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerSystem) {
    logger.setContext(I18nErrorFilter.name)
  }

  catch(exception: Error, host: ArgumentsHost) {
    this.logger.error('I18nErrorFilter', exception)
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const anyEx = exception as unknown as AnyError
    const httpStatus = resolveHttpStatus(exception)
    const business = isBusinessError(exception)

    if (httpStatus >= 500) {
      const route = routeOf(request)
      appendErrorLine({
        method: request.method,
        route,
        status: httpStatus,
        name: exception?.name,
        message: exception?.message,
        stack: exception?.stack,
      })
      Sentry.withScope((scope) => {
        scope.setTag('method', request.method ?? '')
        scope.setTag('route', route ?? '')
        scope.setExtra('statusCode', httpStatus)
        Sentry.captureException(exception)
      })
    }

    const base = {
      path: request.url,
      method: request.method ?? undefined,
      statusCode: httpStatus,
    }
    if (!business) {
      // Interno: sin message, i18nKey, code ni meta; la pantalla usa su propio texto traducido.
      response.status(httpStatus).json(base)
      return
    }
    response.status(httpStatus).json({
      ...base,
      message: anyEx.message,
      i18nKey: anyEx.i18nKey,
      replacements: anyEx.replacements,
      validationErrors: anyEx.validationErrors ?? '',
      ...(anyEx.code ? { code: anyEx.code } : {}),
      ...(anyEx.meta ? { meta: anyEx.meta } : {}),
    } as Partial<I18nErrorDto>)
  }
}
