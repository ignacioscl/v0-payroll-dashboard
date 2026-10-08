import { Injectable } from '@nestjs/common'

import { JobRun } from '../features/job-run/entity/job-run.jobsentity'
import { JobRunService, utcNow } from '../features/job-run/service/job-run.service'
import { jobsCronDisabledReason } from './jobs-env'
import { JobAlertService } from './job-alert.service'
import { emptyJobResult, JobContext, JobHandler, JobResult } from './job.interface'

/** La corrida diaria tiene que haber terminado `ok` en las últimas 26 h. */
export const DAILY_RUN_MAX_AGE_MS = 26 * 3_600_000

/** Jobs que el watchdog y `/api/health/jobs` vigilan (corren por cron una vez por día). */
export const CRITICAL_DAILY_JOBS = ['payroll-snapshot'] as const

/** Motivo por el que la corrida diaria de un job no está al día, o null si está bien. */
export async function dailyRunProblem(runs: JobRunService, jobName: string): Promise<string | null> {
  const last = await runs.lastOf(jobName, 'cron')
  if (!last) return 'never ran by cron'
  if (last.status === 'failed') return `last daily run failed (run ${last.id}, ${last.startedAt} UTC)`
  const lastOk = last.status === 'ok' ? last : await runs.lastOf(jobName, 'cron', 'ok')
  if (!lastOk) return 'no successful daily run'
  const since = utcNow(new Date(Date.now() - DAILY_RUN_MAX_AGE_MS))
  if (String(lastOk.finishedAt ?? lastOk.startedAt) < since) {
    return `last successful daily run is older than 26 h (run ${lastOk.id}, ${lastOk.startedAt} UTC)`
  }
  return null
}

export interface DailyRunStatus {
  /** ok / failed / missing (sin corrida ok en 26 h) / disabled (sin cron: dev o apagado). */
  state: 'ok' | 'failed' | 'missing' | 'disabled'
  reason: string | null
  lastRun: JobRun | null
}

/** Estado de la corrida diaria para la franja del monitor: la misma regla que `/api/health/jobs`. */
export async function dailyRunStatus(runs: JobRunService, jobName: string): Promise<DailyRunStatus> {
  const lastRun = await runs.lastOf(jobName, 'cron')
  const disabled = jobsCronDisabledReason()
  if (disabled) return { state: 'disabled', reason: disabled, lastRun }
  const problem = await dailyRunProblem(runs, jobName)
  if (!problem) return { state: 'ok', reason: null, lastRun }
  return { state: lastRun?.status === 'failed' ? 'failed' : 'missing', reason: problem, lastRun }
}

/**
 * Watchdog diario (09:00 NY): si la corrida diaria de un job crítico no terminó ok en las últimas
 * 26 h, manda la alerta. Queda su propia fila `JOB_RUN(job_name='watchdog')`.
 */
@Injectable()
export class WatchdogJob implements JobHandler<Record<string, unknown>> {
  readonly name = 'watchdog'

  constructor(
    private readonly runs: JobRunService,
    private readonly alerts: JobAlertService,
  ) {}

  async run(_payload: Record<string, unknown>, ctx: JobContext): Promise<JobResult> {
    const result = emptyJobResult()
    const problems: Record<string, string> = {}
    for (const jobName of CRITICAL_DAILY_JOBS) {
      result.itemsTotal++
      const problem = await dailyRunProblem(this.runs, jobName)
      if (!problem) continue
      problems[jobName] = problem
      result.itemsChanged++
      await ctx.log('warn', `${jobName}: ${problem}`)
      const run = await this.runs.findById(ctx.runId)
      if (run) await this.alerts.onWatchdog(run, jobName, problem)
    }
    result.summary = { problems }
    return result
  }
}
