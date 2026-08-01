import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: TTK_EMPLOYEE_WORK (ponchada / time card).
 *  - id_author          = empleado dueño de la ponchada (FK a usuarios)
 *  - id_dealer          = empresa donde trabaja (FK a CONTRATISTA)
 *  - id_dealer_provider = provider que gestiona el payroll (tenant, filtro de seguridad)
 *  - type_payment: hourly=1, piecework=2, salary=3, flat rate=4, daily=5, holiday=6, sick=7
 */
@Entity({ name: 'TTK_EMPLOYEE_WORK', synchronize: false })
export class TtkEmployeeWork {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'estado', type: 'tinyint' })
  estado!: number

  @Column({ name: 'id_author', type: 'int' })
  idAuthor!: number

  @Column({ name: 'id_dealer', type: 'int', nullable: true })
  idDealer?: number

  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  @Column({ name: 'fecha', type: 'date', nullable: true })
  fecha?: string

  // Las cuatro marcas de la ponchada son TIMESTAMP en la base, no DATETIME: guardan un instante
  // en UTC. `fixed_at` (abajo) sí es DATETIME y viaja naive.
  @Column({ name: 'punch_in', type: 'timestamp', nullable: true })
  punchIn?: string

  @Column({ name: 'punch_out', type: 'timestamp', nullable: true })
  punchOut?: string

  @Column({ name: 'break_start', type: 'timestamp', nullable: true })
  breakStart?: string

  @Column({ name: 'break_end', type: 'timestamp', nullable: true })
  breakEnd?: string

  @Column({ name: 'manual_create', type: 'tinyint', nullable: true })
  manualCreate?: number

  @Column({ name: 'fixed_at', type: 'datetime', nullable: true })
  fixedAt?: string

  @Column({ name: 'type_payment', type: 'tinyint', nullable: true })
  typePayment?: number

  @Column({ name: 'hourly_rate', type: 'decimal', precision: 12, scale: 2, nullable: true })
  hourlyRate?: number
}

/** type_payment legacy. */
export enum PaymentType {
  HOURLY = 1,
  PIECEWORK = 2,
  SALARY = 3,
  FLAT_RATE = 4,
  DAILY_PAY = 5,
  HOLIDAY = 6,
  SICK_DAY = 7,
}
