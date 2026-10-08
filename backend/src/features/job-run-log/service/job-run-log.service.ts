import { Inject, Injectable, Logger } from '@nestjs/common'

import { GlobalBaseService } from '../../../commons/service/global.base.service'
import type { JobLogLevel } from '../../../jobs/job.interface'
import { JobRunLogQueryDto } from '../dto/job-run-log.dto'
import { JobRunLog } from '../entity/job-run-log.jobsentity'
import { JobRunLogRepository } from '../repository/job-run-log.repository'

const MAX_MESSAGE = 512
const MAX_CONTEXT = 60_000

@Injectable()
export class JobRunLogService extends GlobalBaseService<JobRunLog, JobRunLogQueryDto> {
  private readonly logger = new Logger('Jobs')

  constructor(@Inject(JobRunLogRepository) private readonly repository: JobRunLogRepository) {
    super()
  }

  protected getRepository(): JobRunLogRepository {
    return this.repository
  }

  /**
   * Las líneas de una corrida, en orden. La hora va como epoch en segundos (`UNIX_TIMESTAMP`): el
   * `created_at` lo pone la base con su propia zona horaria y así no hay que suponerla.
   */
  async listByRun(
    idJobRun: number,
    limit = 2000,
  ): Promise<{ id: number; level: string; message: string; context: string | null; ts: number }[]> {
    const rows = await this.repository
      .createQueryBuilder('l')
      .select('l.id', 'id')
      .addSelect('l.level', 'level')
      .addSelect('l.message', 'message')
      .addSelect('l.context', 'context')
      .addSelect('UNIX_TIMESTAMP(l.created_at)', 'ts')
      .where('l.idJobRun = :idJobRun', { idJobRun })
      .orderBy('l.id', 'ASC')
      .limit(limit)
      .getRawMany()
    return rows.map((r: any) => ({
      id: Number(r.id),
      level: String(r.level),
      message: String(r.message),
      context: r.context ?? null,
      ts: Number(r.ts),
    }))
  }

  /** Una línea de log de la corrida; también sale por consola. Nunca tira: el log no corta un job. */
  async append(
    idJobRun: number,
    level: JobLogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const line = `[run ${idJobRun}] ${message}`
    if (level === 'error') this.logger.error(line)
    else if (level === 'warn') this.logger.warn(line)
    else this.logger.log(line)
    try {
      const ctx = context ? JSON.stringify(context) : null
      await this.repository.save(
        this.repository.create({
          idJobRun,
          level,
          message: message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1)}…` : message,
          context: ctx && ctx.length > MAX_CONTEXT ? `${ctx.slice(0, MAX_CONTEXT)}…` : ctx,
        }),
      )
    } catch (e) {
      this.logger.error(`[run ${idJobRun}] no se pudo guardar la línea de log: ${(e as Error).message}`)
    }
  }
}
