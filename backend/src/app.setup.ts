import { ClassSerializerInterceptor, HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { NestExpressApplication } from '@nestjs/platform-express'
import * as Sentry from '@sentry/node'
import helmet from 'helmet'
import { ValidationError } from 'class-validator'

import { PaginationInterceptor } from './commons/interceptor/pagination.interceptor'
import { LoggerSystem } from './commons/logs/logger.system'
import { DataError, IdetailError } from './commons/errors/data.error'
import { I18nErrorFilter } from './commons/filter/i18n.error.filter'
import { ExtraFieldsProbePipe } from './commons/pipes/extra-fields-probe.pipe'

/**
 * Todo lo que el arranque hace después de crear la app (plans/plan-buenas-practicas-v0, 2.3): así
 * el test (`app.setup.spec.ts`) arma la app igual que producción. `main.ts` solo crea la app, llama
 * esto y escucha. Regla del repo: `.cursor/rules/nest-security-baseline.mdc`.
 */
/** Tope del body JSON de cualquier pedido (antes 50 MB «para imágenes en base64» de la plantilla borrada). */
export const JSON_BODY_LIMIT = '1mb'

export async function configureApp(app: INestApplication): Promise<void> {
  // helmet antes de cualquier app.use (https://docs.nestjs.com/security/helmet).
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { frameAncestors: ["'none'"] } },
      frameguard: { action: 'deny' },
    }),
  )
  // Un pedido gigante se corta en la puerta (3.9). Lo más grande que manda el front son listas de ids (decenas de KB);
  // el logo va por multipart (su propio tope) y los adjuntos al Node. El urlencoded queda en el valor por defecto.
  ;(app as NestExpressApplication).useBodyParser('json', { limit: JSON_BODY_LIMIT })

  app.setGlobalPrefix('api')

  const logger = await app.resolve(LoggerSystem) // TRANSIENT: resolve, no get
  app.useLogger(logger)

  app.useGlobalPipes(
    // Medición de campos de más (3.10): antes del ValidationPipe, que los borra en silencio. Solo anota en el log.
    new ExtraFieldsProbePipe(),
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const result: IdetailError[] = flattenValidationErrors(errors)
        logger.warn(`Validation Errors: ${JSON.stringify(result)}`)
        return new DataError(HttpStatus.BAD_REQUEST, 'Validation Error', undefined, undefined, result)
      },
      stopAtFirstError: false,
    }),
  )
  const reflector = app.get(Reflector)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector), new PaginationInterceptor())

  // Swagger solo fuera de producción (el contenedor corre con NODE_ENV=production).
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SRS Suite API')
      .setDescription('API')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api', app, document, { swaggerOptions: { tagsSorter: 'alpha' } })
  }

  initSentry(app.get(ConfigService).get<string>('sentryDSN'))

  // Un solo filtro global: ver i18n.error.filter.ts.
  app.useGlobalFilters(new I18nErrorFilter(logger))

  // Cierre limpio: con SIGTERM termina los pedidos en curso antes de cerrar la base (Terminus espera
  // SHUTDOWN_GRACE_MS, health.module.ts; docker-compose da stop_grace_period: 30s).
  app.enableShutdownHooks()
}

/** Sentry sin breadcrumbs ni datos del pedido. Sin DSN no manda nada (tarea `sentry-v0`). */
export function initSentry(dsn: string | undefined): void {
  Sentry.init({
    environment: process.env.NODE_ENV,
    dsn,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    // @sentry/node 7 junta breadcrumbs de la consola y de los pedidos salientes en el ámbito global:
    // un evento podría llevar logs y URLs de pedidos de otros usuarios y empresas.
    beforeBreadcrumb: () => null,
    beforeSend: scrubSentryEvent,
  })
}

export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    delete event.request.headers
    delete event.request.cookies
    delete event.request.data
  }
  delete event.breadcrumbs
  return event
}

/** Los `@ValidateNested` dejan los errores en `children`: se aplanan con el campo completo. */
function flattenValidationErrors(errors: ValidationError[], parent = ''): IdetailError[] {
  const out: IdetailError[] = []
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property
    if (error.constraints) {
      const first = Object.keys(error.constraints)[0]
      out.push({ field, message: first ? error.constraints[first] ?? '' : '' })
    }
    if (error.children?.length) {
      out.push(...flattenValidationErrors(error.children, field))
    }
  }
  return out
}
