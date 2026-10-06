import { Column, Entity } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { utcDateTimeTransformer } from '../../../jobs/utc-datetime.transformer'

/**
 * `PAYROLL_SNAPSHOT_DAY` (base de negocio, migration 010): el payroll de cada empresa repartido
 * por día, dealer, empleado y tipo de pago. Lo escribe solo el job `payroll-snapshot`; lo leen la
 * tab Payroll Spend de v0 y, más adelante, el PHP.
 *
 * Las columnas generadas `dealer_key` y `ponchada_key` (solo para la clave única) no se mapean:
 * las calcula la base.
 */
@Entity({ name: 'PAYROLL_SNAPSHOT_DAY', synchronize: false })
export class PayrollSnapshotDay extends EntityBase {
  @Column({ name: 'id_contratista', type: 'int' })
  idContratista!: number

  /** NULL = salario o comisión sin dealer en la ficha («Without dealer», decisión G). */
  @Column({ name: 'id_dealer', type: 'int', nullable: true })
  idDealer!: number | null

  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario!: number

  @Column({ name: 'id_payment_type', type: 'int' })
  idPaymentType!: number

  @Column({ name: 'concepto', type: 'enum', enum: ['ponchada', 'prorrateo', 'overtime'] })
  concepto!: 'ponchada' | 'prorrateo' | 'overtime'

  /** YYYY-MM-DD */
  @Column({ name: 'fecha', type: 'date' })
  fecha!: string

  @Column({ name: 'id_ponchada', type: 'int', nullable: true })
  idPonchada!: number | null

  @Column({ name: 'horas', type: 'decimal', precision: 8, scale: 2, default: 0 })
  horas!: number

  @Column({ name: 'monto', type: 'decimal', precision: 14, scale: 4, default: 0 })
  monto!: number

  @Column({ name: 'monto_tax', type: 'decimal', precision: 14, scale: 4, default: 0 })
  montoTax!: number

  @Column({ name: 'tarifa', type: 'decimal', precision: 14, scale: 2, nullable: true })
  tarifa!: number | null

  @Column({ name: 'periodo_desde', type: 'date' })
  periodoDesde!: string

  @Column({ name: 'periodo_hasta', type: 'date' })
  periodoHasta!: string

  @Column({ name: 'dias_periodo', type: 'tinyint' })
  diasPeriodo!: number

  @Column({ name: 'payment_method', type: 'tinyint', unsigned: true, nullable: true })
  paymentMethod!: number | null

  /** UTC */
  @Column({ name: 'fecha_calculo', type: 'datetime', transformer: utcDateTimeTransformer })
  fechaCalculo!: string

  @Column({ name: 'calc_version', type: 'smallint' })
  calcVersion!: number
}
