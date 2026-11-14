import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { initializeTransactionalContext } from 'typeorm-transactional'

import { AppModule } from './app.module'
import { configureApp } from './app.setup'

async function bootstrap() {
  initializeTransactionalContext()

  // Sin `cors`: nadie llama al Nest desde un navegador (el front va por la red de Docker,
  // docker_prod.md), así que no se manda Access-Control-Allow-Origin.
  // bufferLogs: el arranque se guarda hasta `app.useLogger` (configureApp) y sale también en JSON.
  const app = await NestFactory.create(AppModule, { bodyParser: true, bufferLogs: true })
  await configureApp(app)

  const port = app.get(ConfigService).get<string>('port')!
  await app.listen(port)
}

bootstrap()
