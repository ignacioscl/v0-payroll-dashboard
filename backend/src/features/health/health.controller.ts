import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { EmailHealthIndicator } from '../../commons/email/email-health.indicator'
import { JobsHealthIndicator } from '../../jobs/jobs-health.indicator'
import { CRITICAL_DAILY_JOBS } from '../../jobs/watchdog.job'

@Controller('/health')
@ApiTags('Health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly jobs: JobsHealthIndicator,
    private readonly email: EmailHealthIndicator,
  ) {}

  /** Healthcheck del contenedor (lo consume el healthcheck del docker-compose). No cambia. */
  @Get('/')
  @ApiOkResponse({ description: 'OK' })
  check() {
    return { status: 'ok', uptime: process.uptime() }
  }

  /**
   * 503 si la corrida diaria de un job crítico falló o no corrió en las últimas 26 h, o si en PROD
   * el email no está en modo `live` (las alertas no saldrían). Sin login.
   */
  @Get('/jobs')
  @HealthCheck()
  checkJobs() {
    return this.health.check([
      ...CRITICAL_DAILY_JOBS.map((name) => () => this.jobs.isHealthy(name)),
      () => this.email.isHealthy(),
    ])
  }
}
