import { ClassSerializerInterceptor, HttpStatus, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory, Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import * as Sentry from '@sentry/node'
import * as express from 'express'

import { AppModule } from './app.module'
import { ErrorFilter } from './commons/filter/error.filter'
import { PaginationInterceptor } from './commons/interceptor/pagination.interceptor'
import { DataErrorFilter } from './commons/filter/data.error.filter'
import { initializeTransactionalContext } from 'typeorm-transactional'
import { LoggerSystem } from './commons/logs/logger.system'
import { DataError, IdetailError } from './commons/errors/data.error'
import { ValidationError } from 'class-validator'
import { I18nErrorFilter } from './commons/filter/i18n.error.filter'
import { JwtService } from '@nestjs/jwt'
import { CompanyInterceptor } from './commons/interceptor/company.interceptor'
// AuditContextInterceptor se registra en app.module.ts como APP_INTERCEPTOR

async function bootstrap() {
  initializeTransactionalContext()

  const app = await NestFactory.create(AppModule, {
    cors: true,
    bodyParser: true,
  })

  // Aumentar el límite del body para permitir imágenes en base64
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ limit: '50mb', extended: true }))

  app.setGlobalPrefix('api')

  const logger = await app.resolve(LoggerSystem) // Use resolve instead of get for TRANSIENT scope
  app.useLogger(logger)

  const configService = app.get(ConfigService)
  const port = configService.get<string>('port')!
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) => {
        /*
        await app.useGlobalPipes(new ValidationPipe({
        exceptionFactory: (errors: ValidationError[]) =>
        {
          const customError = errors.map((el) =>
          {
            if(el.constraints.isString)
            {
              return "O nome do produto é obrigatório"
            }

            if(el.constraints.isNotEmpty)
            {
              return "A quantidade do produto é obrigatória"
            }

          });
          
          return new HttpException(customError, HttpStatus.BAD_REQUEST);
        }
      }));

        */
        const result: IdetailError[] = errors.map(error => ({
          field: error.property,
          message: error?.constraints ? error?.constraints[Object.keys(error.constraints as any)[0]] : '',
        }))

        console.error('Validation Errors: ', result)
        const err = new DataError(HttpStatus.BAD_REQUEST, 'Validation Error', undefined, undefined, result)
        //err.validationErrors = result
        return err
      },
      stopAtFirstError: false,
    }),
  )
  const reflector = app.get(Reflector)
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector), new PaginationInterceptor())
  app.useGlobalInterceptors(new CompanyInterceptor(app.get(JwtService), app.get(ConfigService)))
  const config = new DocumentBuilder()
    .setTitle('SRS Suite API')
    .setDescription('API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      tagsSorter: 'alpha',
    },
  })
  const dsn = configService.get<string>('sentryDSN')
  Sentry.init({
    environment: process.env.NODE_ENV,
    dsn,
    tracesSampleRate: 1.0,
  })
  app.useGlobalFilters(new ErrorFilter())
  app.useGlobalFilters(new DataErrorFilter(logger))
  app.useGlobalFilters(new I18nErrorFilter(logger))
  await app.listen(port)
}

bootstrap()
