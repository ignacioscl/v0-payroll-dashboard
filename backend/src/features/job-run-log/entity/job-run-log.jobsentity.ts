import { Column, Entity } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import type { JobLogLevel } from '../../../jobs/job.interface'

/** `srssui5_srs_jobs.JOB_RUN_LOG` — líneas de log de una corrida (migration 010). */
@Entity({ name: 'JOB_RUN_LOG', synchronize: false })
export class JobRunLog extends EntityBase {
  @Column({ name: 'id_job_run', type: 'int' })
  idJobRun!: number

  @Column({ name: 'level', type: 'enum', enum: ['info', 'warn', 'error'] })
  level!: JobLogLevel

  @Column({ name: 'message', type: 'varchar', length: 512 })
  message!: string

  /** JSON */
  @Column({ name: 'context', type: 'text', nullable: true })
  context!: string | null
}
