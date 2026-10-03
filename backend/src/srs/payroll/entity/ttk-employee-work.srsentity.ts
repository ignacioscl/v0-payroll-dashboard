import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: TTK_EMPLOYEE_WORK (ponchada / time card).
 *  - id_author          = empleado dueño de la ponchada (FK a usuarios)
 *  - id_dealer          = empresa donde trabaja (FK a CONTRATISTA)
 *  - id_dealer_provider = provider que gestiona el payroll (tenant, filtro de seguridad)
 *  - id_payment_type    = tipo de pago real (FK a GENERIC_DATA, categoría 30). La copia vieja
 *                         type_payment no se mapea (regla ttk-payment-type-column).
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

  @Column({ name: 'id_payment_type', type: 'int', nullable: true })
  idPaymentType?: number

  @Column({ name: 'hourly_rate', type: 'decimal', precision: 12, scale: 2, nullable: true })
  hourlyRate?: number
}
