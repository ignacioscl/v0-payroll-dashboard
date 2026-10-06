import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'

import { PAYROLL_TIME_ZONE } from '../srs/payroll/snapshot/payroll-dates'
import { JobRunnerService } from './job-runner.service'
import { isJobsCronEnabled, jobsCronDisabledReason } from './jobs-env'

/** 00:30 NY: snapshot de payroll hasta el corte (hoy − 2). Sin pasada horaria (decisión 30/09). */
const DAILY_CRON = '30 0 * * *'
/** 09:00 NY: alerta si la corrida diaria no terminó ok en las últimas 26 h. */
const WATCHDOG_CRON = '0 9 * * *'

/**
 * Crons de los jobs, registrados al arrancar solo si corresponde (ver `jobs-env.ts`): en dev
 * nunca, en producción con JOBS_CRON_ENABLED=true. `JOBS_CRON_EXPR` / `JOBS_WATCHDOG_CRON_EXPR`
 * acortan las expresiones para probar en local con JOBS_DEV_FORCE.
 */
@Injectable()
export class JobsCron implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs')

  constructor(
    private readonly runner: JobRunnerService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!isJobsCronEnabled()) {
      this.logger.log(`jobs: cron ${jobsCronDisabledReason()}`)
      return
    }
    this.add('payroll-snapshot-daily', process.env.JOBS_CRON_EXPR?.trim() || DAILY_CRON, () =>
      this.runner.run('payroll-snapshot', {}, 'cron'),
    )
    this.add('jobs-watchdog', process.env.JOBS_WATCHDOG_CRON_EXPR?.trim() || WATCHDOG_CRON, () =>
      this.runner.run('watchdog', {}, 'watchdog'),
    )
  }

  private add(name: string, expr: string, tick: () => Promise<unknown>): void {
    const job = CronJob.from({
      cronTime: expr,
      timeZone: PAYROLL_TIME_ZONE,
      start: false,
      onTick: () => {
        tick().catch((e) => this.logger.error(`jobs: ${name} falló: ${(e as Error)?.message ?? e}`))
      },
    })
    this.scheduler.addCronJob(name, job as any)
    job.start()
    this.logger.log(`jobs: cron ${name} «${expr}» (${PAYROLL_TIME_ZONE})`)
  }
}
