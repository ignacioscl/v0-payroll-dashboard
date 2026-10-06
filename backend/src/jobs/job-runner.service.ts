import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import * as Sentry from '@sentry/node'
import * as os from 'os'
import { DataSource } from 'typeorm'

import { JobRunService } from '../features/job-run/service/job-run.service'
import { JobRunLogService } from '../features/job-run-log/service/job-run-log.service'
import { JobAlertService } from './job-alert.service'
import { JobRegistryService } from './job-registry.service'
import { JobContext, JobHandler, JobResult, JobRunStatus, JobTrigger } from './job.interface'
import { JOBS_CONNECTION } from './jobs.datasource'

export interface JobRunOptions {
  dryRun?: boolean
  force?: boolean
}

export interface JobRunOutcome {
  runId: number
  status: Exclude<JobRunStatus, 'running'>
  result?: JobResult
  error?: string
}

/** Errores de conexión o deadlock: los únicos que se reintentan (una vez). */
const RETRYABLE = ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ER_LOCK_DEADLOCK', 'ETIMEDOUT']

export function isRetryableJobError(e: unknown): boolean {
  const err = e as { code?: string; errno?: string; message?: string; driverError?: { code?: string } }
  const code = err?.code ?? err?.driverError?.code ?? err?.errno ?? ''
  return RETRYABLE.includes(String(code)) || RETRYABLE.some((c) => String(err?.message ?? '').includes(c))
}

/**
 * Corre un job: lock por nombre (`GET_LOCK`), fila en `JOB_RUN`, log, un reintento si se cae la
 * conexión, alerta si falla. Lo usan el cron, el endpoint y el CLI; no hay cola.
 */
@Injectable()
export class JobRunnerService implements OnModuleInit {
  private readonly logger = new Logger('Jobs')

  constructor(
    private readonly registry: JobRegistryService,
    private readonly runs: JobRunService,
    private readonly logs: JobRunLogService,
    private readonly alerts: JobAlertService,
    @InjectDataSource(JOBS_CONNECTION) private readonly jobsDs: DataSource,
  ) {}

  /**
   * Al arrancar: una corrida `running` de este host cuyo lock está libre ya no la corre nadie (el
   * lock se toma antes de crear la fila y se suelta después de cerrarla, y cae con la conexión del
   * proceso muerto). Si el lock está tomado es un CLI que sigue corriendo y no se toca. Sin umbral de
   * tiempo: con «más de 15 min» una corrida cortada por un reinicio rápido quedaba `running` para siempre.
   */
  async onModuleInit(): Promise<void> {
    const host = os.hostname()
    const dead: number[] = []
    for (const r of await this.runs.runningOf(host)) {
      const free = await this.jobsDs.query('SELECT IS_FREE_LOCK(?) AS f', [`srs_jobs:${r.jobName}`])
      if (Number(free[0]?.f) === 1) dead.push(r.id!)
    }
    const n = await this.runs.markInterrupted(dead)
    if (n > 0) this.logger.warn(`jobs: ${n} corrida(s) de ${host} quedaron 'running' y pasan a 'failed' (interrumpida por reinicio)`)
  }

  async run(
    name: string,
    payload: Record<string, unknown>,
    trigger: JobTrigger,
    options: JobRunOptions = {},
  ): Promise<JobRunOutcome> {
    const handler = this.registry.get(name)
    const dryRun = !!options.dryRun
    const force = !!options.force
    const host = os.hostname()
    const pid = process.pid
    const lockName = `srs_jobs:${name}`
    const runPayload = { payload, dryRun, force }

    // Conexión dedicada: el lock vive mientras viva esta conexión.
    const qr = this.jobsDs.createQueryRunner()
    await qr.connect()
    let released = false
    try {
      const lock = await qr.query('SELECT GET_LOCK(?, 0) AS l', [lockName])
      if (Number(lock[0]?.l) !== 1) {
        // Soltar la conexión ANTES de escribir: si no, con dos corridas a la vez las dos conexiones
        // dedicadas agotan el pool y la que tiene el lock no puede escribir su log (se traba).
        await qr.release()
        released = true
        const skipped = await this.runs.start({
          jobName: name,
          trigger,
          status: 'skipped',
          payload: runPayload,
          host,
          pid,
          error: 'lock busy',
        })
        this.logger.warn(`[run ${skipped.id}] ${name}: lock ocupado, corrida salteada`)
        return { runId: skipped.id!, status: 'skipped', error: 'lock busy' }
      }

      try {
        return await this.execute(handler, name, payload, trigger, runPayload, dryRun, force, host, pid)
      } finally {
        await qr.query('SELECT RELEASE_LOCK(?) AS r', [lockName]).catch(() => undefined)
      }
    } finally {
      if (!released) await qr.release()
    }
  }

  private async execute(
    handler: JobHandler<any>,
    name: string,
    payload: Record<string, unknown>,
    trigger: JobTrigger,
    runPayload: Record<string, unknown>,
    dryRun: boolean,
    force: boolean,
    host: string,
    pid: number,
  ): Promise<JobRunOutcome> {
    const run = await this.runs.start({ jobName: name, trigger, status: 'running', payload: runPayload, host, pid })
    const runId = run.id!
    const startedMs = Date.now()
    const ctx: JobContext = {
      runId,
      trigger,
      dryRun,
      force,
      log: (level, message, context) => this.logs.append(runId, level, message, context),
    }
    this.logger.log(`[run ${runId}] ${name} (${trigger}${dryRun ? ', dryRun' : ''}${force ? ', force' : ''}) arranca`)

    let result: JobResult
    try {
      result = await this.attempt(handler, payload, ctx)
    } catch (e) {
      const err = e as Error
      const message = err?.message ?? String(e)
      await this.logs.append(runId, 'error', message, { stack: err?.stack })
      Sentry.captureException(e)
      const failed = await this.runs.finish(run, 'failed', null, message, startedMs)
      await this.alerts.onFailed(failed).catch((ae) => this.logger.error(`[run ${runId}] alerta: ${ae}`))
      this.logger.error(`[run ${runId}] ${name} failed: ${message}`)
      return { runId, status: 'failed', error: message }
    }

    const status = result.itemsFailed > 0 ? 'failed' : 'ok'
    const error = status === 'failed' ? `${result.itemsFailed} unidad(es) fallida(s); ver JOB_RUN_LOG` : null
    const finished = await this.runs.finish(run, status, result, error, startedMs)
    if (status === 'failed') {
      await this.alerts.onFailed(finished).catch((ae) => this.logger.error(`[run ${runId}] alerta: ${ae}`))
    }
    this.logger.log(
      `[run ${runId}] ${name} ${status}: total=${result.itemsTotal} changed=${result.itemsChanged} skipped=${result.itemsSkipped} failed=${result.itemsFailed} (${Date.now() - startedMs} ms)`,
    )
    return { runId, status, result, ...(error ? { error } : {}) }
  }

  /** Un solo reintento inmediato, y solo si el error es de conexión o deadlock. */
  private async attempt(handler: JobHandler<any>, payload: Record<string, unknown>, ctx: JobContext): Promise<JobResult> {
    try {
      return await handler.run(payload, ctx)
    } catch (e) {
      if (!isRetryableJobError(e)) throw e
      await ctx.log('warn', `reintento por error de conexión: ${(e as Error)?.message ?? e}`)
      return handler.run(payload, ctx)
    }
  }
}
