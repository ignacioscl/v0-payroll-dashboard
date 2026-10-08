import { Injectable } from '@nestjs/common'
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus'

import { JobRunService } from '../features/job-run/service/job-run.service'
import { jobsCronDisabledReason } from './jobs-env'
import { dailyRunProblem } from './watchdog.job'

/**
 * `GET /api/health/jobs`: `down` (503) si la última corrida diaria (`trigger = 'cron'`) del job no
 * terminó ok o tiene más de 26 h. Sin cron (dev, o JOBS_CRON_ENABLED apagado) no hay corrida que
 * esperar: `up` con el motivo.
 */
@Injectable()
export class JobsHealthIndicator extends HealthIndicator {
  constructor(private readonly runs: JobRunService) {
    super()
  }

  async isHealthy(jobName: string): Promise<HealthIndicatorResult> {
    const disabled = jobsCronDisabledReason()
    const last = await this.runs.lastOf(jobName, 'cron')
    const lastInfo = last
      ? { lastRunId: last.id, lastStatus: last.status, lastStartedAtUtc: last.startedAt, lastFinishedAtUtc: last.finishedAt }
      : { lastRunId: null }
    if (disabled) return this.getStatus(jobName, true, { cron: disabled, ...lastInfo })

    const problem = await dailyRunProblem(this.runs, jobName)
    const result = this.getStatus(jobName, !problem, { cron: 'enabled', ...lastInfo, ...(problem ? { problem } : {}) })
    if (problem) throw new HealthCheckError(`${jobName}: ${problem}`, result)
    return result
  }
}
