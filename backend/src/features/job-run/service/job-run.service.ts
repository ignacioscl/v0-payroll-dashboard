import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from '../../../commons/service/global.base.service'
import type { JobResult, JobRunStatus, JobTrigger } from '../../../jobs/job.interface'
import { JobRunQueryDto } from '../dto/job-run.dto'
import { JobRun } from '../entity/job-run.jobsentity'
import { JobRunRepository } from '../repository/job-run.repository'

/** 'YYYY-MM-DD HH:MM:SS' en UTC: los tiempos de los jobs se guardan en UTC. */
export function utcNow(now: Date = new Date()): string {
  return now.toISOString().slice(0, 19).replace('T', ' ')
}

const MAX_TEXT = 60_000

function clip(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text
}

@Injectable()
export class JobRunService extends GlobalBaseService<JobRun, JobRunQueryDto> {
  constructor(@Inject(JobRunRepository) private readonly repository: JobRunRepository) {
    super()
  }

  protected getRepository(): JobRunRepository {
    return this.repository
  }

  /** Crea la fila de la corrida (`running`, o `skipped` cuando el lock está ocupado). */
  async start(input: {
    jobName: string
    trigger: JobTrigger
    status: JobRunStatus
    payload: unknown
    host: string
    pid: number
    error?: string
  }): Promise<JobRun> {
    const now = utcNow()
    const finished = input.status === 'skipped'
    return this.repository.save(
      this.repository.create({
        jobName: input.jobName,
        trigger: input.trigger,
        status: input.status,
        payload: clip(JSON.stringify(input.payload ?? {})),
        startedAt: now,
        finishedAt: finished ? now : null,
        durationMs: finished ? 0 : null,
        itemsTotal: 0,
        itemsChanged: 0,
        itemsSkipped: 0,
        itemsFailed: 0,
        summary: null,
        error: input.error ?? null,
        host: input.host,
        pid: input.pid,
        alertSentAt: null,
      }),
    )
  }

  async finish(
    run: JobRun,
    status: Exclude<JobRunStatus, 'running'>,
    result: JobResult | null,
    error: string | null,
    startedMs: number,
  ): Promise<JobRun> {
    run.status = status
    run.finishedAt = utcNow()
    run.durationMs = Date.now() - startedMs
    run.itemsTotal = result?.itemsTotal ?? 0
    run.itemsChanged = result?.itemsChanged ?? 0
    run.itemsSkipped = result?.itemsSkipped ?? 0
    run.itemsFailed = result?.itemsFailed ?? 0
    run.summary = result?.summary ? clip(JSON.stringify(result.summary)) : null
    run.error = clip(error)
    return this.repository.save(run)
  }

  async markAlertSent(run: JobRun): Promise<void> {
    run.alertSentAt = utcNow()
    await this.repository.save(run)
  }

  /** Última corrida de un job con un disparador (la que mira el health y el watchdog). */
  async lastOf(jobName: string, trigger: JobTrigger, status?: JobRunStatus): Promise<JobRun | null> {
    const q = this.repository
      .createQueryBuilder('r')
      .where('r.jobName = :jobName', { jobName })
      .andWhere('r.trigger = :trigger', { trigger })
    if (status) q.andWhere('r.status = :status', { status })
    return q.orderBy('r.id', 'DESC').getOne()
  }

  /** ¿Hubo una alerta del mismo job después de `sinceUtc`? (una por hora como máximo) */
  async alertSentSince(jobName: string, sinceUtc: string): Promise<boolean> {
    const n = await this.repository
      .createQueryBuilder('r')
      .where('r.jobName = :jobName', { jobName })
      .andWhere('r.alertSentAt >= :since', { since: sinceUtc })
      .getCount()
    return n > 0
  }

  /** Corridas de este host que siguen `running` (al arrancar, el runner decide cuáles murieron). */
  async runningOf(host: string): Promise<JobRun[]> {
    return this.repository
      .createQueryBuilder('r')
      .where('r.status = :running', { running: 'running' })
      .andWhere('r.host = :host', { host })
      .getMany()
  }

  /**
   * Las corridas que cortó un reinicio pasan a `failed`. El lock se liberó solo al caer la conexión
   * y el período a medias hizo rollback.
   */
  async markInterrupted(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0
    const res = await this.repository
      .createQueryBuilder()
      .update(JobRun)
      .set({ status: 'failed', error: 'interrumpida por reinicio', finishedAt: utcNow() })
      .where('id IN (:...ids)', { ids })
      .andWhere('status = :running', { running: 'running' })
      .execute()
    return res.affected ?? 0
  }

  async listRuns(name: string | undefined, limit: number): Promise<JobRun[]> {
    const q = this.repository.createQueryBuilder('r').orderBy('r.id', 'DESC').take(limit)
    if (name) q.where('r.jobName = :name', { name })
    return q.getMany()
  }
}
