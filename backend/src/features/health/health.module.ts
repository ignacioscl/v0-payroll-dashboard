import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { EmailModule } from '../../commons/email/email.module'
import { JobRunModule } from '../job-run/job-run.module'
import { JobsHealthIndicator } from '../../jobs/jobs-health.indicator'
import { HealthController } from './health.controller'

/**
 * Al apagarse (SIGTERM del deploy, con `enableShutdownHooks` en app.setup.ts), Terminus espera esto
 * antes de cerrar el servidor HTTP; después Nest espera los pedidos en curso y recién ahí cierra la
 * base. docker-compose le da 30 s en total (`stop_grace_period`).
 */
export const SHUTDOWN_GRACE_MS = 5_000

@Module({
  imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: SHUTDOWN_GRACE_MS }), JobRunModule, EmailModule],
  providers: [JobsHealthIndicator],
  controllers: [HealthController],
})
export class HealthModule {}
