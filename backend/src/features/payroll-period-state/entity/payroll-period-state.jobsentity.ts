import { Column, Entity } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { utcDateTimeTransformer } from '../../../jobs/utc-datetime.transformer'

/**
 * `srssui5_srs_jobs.PAYROLL_PERIOD_STATE` — huella y resultado del último cálculo de cada
 * (empresa, período) del snapshot de payroll (migration 010).
 * `id_contratista` apunta a `srssui5_srs.CONTRATISTA` sin FK (otra base; ver worker-jobs.mdc).
 */
@Entity({ name: 'PAYROLL_PERIOD_STATE', synchronize: false })
export class PayrollPeriodState extends EntityBase {
  @Column({ name: 'id_contratista', type: 'int' })
  idContratista!: number

  /** YYYY-MM-DD */
  @Column({ name: 'periodo_desde', type: 'date' })
  periodoDesde!: string

  /** YYYY-MM-DD */
  @Column({ name: 'periodo_hasta', type: 'date' })
  periodoHasta!: string

  @Column({ name: 'payment_method', type: 'tinyint', unsigned: true, nullable: true })
  paymentMethod!: number | null

  @Column({ name: 'fingerprint', type: 'varchar', length: 160 })
  fingerprint!: string

  @Column({ name: 'calc_version', type: 'smallint' })
  calcVersion!: number

  /** UTC */
  @Column({ name: 'last_calculated_at', type: 'datetime', transformer: utcDateTimeTransformer })
  lastCalculatedAt!: string

  @Column({ name: 'id_last_job_run', type: 'int', nullable: true })
  idLastJobRun!: number | null

  @Column({ name: 'rows_written', type: 'int', default: 0 })
  rowsWritten!: number

  @Column({ name: 'status', type: 'enum', enum: ['ok', 'failed'] })
  status!: 'ok' | 'failed'

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null
}
