import { Column, Entity } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { utcDateTimeTransformer } from '../../../jobs/utc-datetime.transformer'
import type { JobRunStatus, JobTrigger } from '../../../jobs/job.interface'

/**
 * `srssui5_srs_jobs.JOB_RUN` — una fila por corrida de un job (migration 010).
 * Fechas como string `YYYY-MM-DD HH:MM:SS` en UTC (la conexión usa dateStrings).
 */
@Entity({ name: 'JOB_RUN', synchronize: false })
export class JobRun extends EntityBase {
  @Column({ name: 'job_name', type: 'varchar', length: 64 })
  jobName!: string

  @Column({ name: 'trigger', type: 'enum', enum: ['cron', 'api', 'cli', 'watchdog'] })
  trigger!: JobTrigger

  @Column({ name: 'status', type: 'enum', enum: ['running', 'ok', 'failed', 'skipped'] })
  status!: JobRunStatus

  /** JSON */
  @Column({ name: 'payload', type: 'text', nullable: true })
  payload!: string | null

  @Column({ name: 'started_at', type: 'datetime', transformer: utcDateTimeTransformer })
  startedAt!: string

  @Column({ name: 'finished_at', type: 'datetime', nullable: true, transformer: utcDateTimeTransformer })
  finishedAt!: string | null

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs!: number | null

  @Column({ name: 'items_total', type: 'int', default: 0 })
  itemsTotal!: number

  @Column({ name: 'items_changed', type: 'int', default: 0 })
  itemsChanged!: number

  @Column({ name: 'items_skipped', type: 'int', default: 0 })
  itemsSkipped!: number

  @Column({ name: 'items_failed', type: 'int', default: 0 })
  itemsFailed!: number

  /** JSON */
  @Column({ name: 'summary', type: 'text', nullable: true })
  summary!: string | null

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null

  @Column({ name: 'host', type: 'varchar', length: 64, nullable: true })
  host!: string | null

  @Column({ name: 'pid', type: 'int', nullable: true })
  pid!: number | null

  @Column({ name: 'alert_sent_at', type: 'datetime', nullable: true, transformer: utcDateTimeTransformer })
  alertSentAt!: string | null
}
