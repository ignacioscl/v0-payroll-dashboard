import { Controller, Get } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'
import { DataSource } from 'typeorm'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { Public } from '../../commons/decorator/public.decorator'

import { EmailHealthIndicator } from '../../commons/email/email-health.indicator'
import { JobsHealthIndicator } from '../../jobs/jobs-health.indicator'
import { CRITICAL_DAILY_JOBS } from '../../jobs/watchdog.job'
import { SRS_CONNECTION } from '../../srs/srs.datasource'

/** El healthcheck del compose corta a los 10 s: la base tiene que contestar `SELECT 1` en 3 (D9). */
export const HEALTH_DB_PING_TIMEOUT_MS = 3_000

@Controller('/health')
@ApiTags('Health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly jobs: JobsHealthIndicator,
    private readonly email: EmailHealthIndicator,
    private readonly db: TypeOrmHealthIndicator,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  /**
   * Healthcheck del contenedor (lo consume el healthcheck del docker-compose): 503 si la base no contesta en
   * HEALTH_DB_PING_TIMEOUT_MS (D9). Solo la base: jobs y mail van en /health/jobs, para no tumbar el contenedor.
   */
  @Public()
  @Get('/')
  @HealthCheck()
  @ApiOkResponse({ description: 'OK' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { connection: this.srs, timeout: HEALTH_DB_PING_TIMEOUT_MS }),
    ])
  }

  /**
   * 503 si la corrida diaria de un job crítico falló o no corrió en las últimas 26 h, o si en PROD
   * el email no está en modo `live` (las alertas no saldrían). Sin login.
   */
  @Public()
  @Get('/jobs')
  @HealthCheck()
  checkJobs() {
    return this.health.check([
      ...CRITICAL_DAILY_JOBS.map((name) => () => this.jobs.isHealthy(name)),
      () => this.email.isHealthy(),
    ])
  }
}
