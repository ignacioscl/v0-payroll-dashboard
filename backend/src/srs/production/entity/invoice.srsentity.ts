import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: INVOICE (= Work Order). PK `id` se usa como id_work_order.
 * Mapeo explícito, sin base entity. Solo columnas usadas por los KPIs.
 */
@Entity({ name: 'INVOICE', synchronize: false })
export class Invoice {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'estado', type: 'tinyint' })
  estado!: number

  @Column({ name: 'id_workflow', type: 'int' })
  idWorkflow!: number

  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  @Column({ name: 'id_department', type: 'int', nullable: true })
  idDepartment?: number

  @Column({ name: 'fecha_alta', type: 'datetime', nullable: true })
  fechaAlta?: string

  @Column({ name: 'promise_datetime', type: 'datetime', nullable: true })
  promiseDatetime?: string

  @Column({ name: 'approved', type: 'tinyint', nullable: true })
  approved?: number

  @Column({ name: 'approved_date', type: 'datetime', nullable: true })
  approvedDate?: string

  @Column({ name: 'inspected', type: 'tinyint', nullable: true })
  inspected?: number

  @Column({ name: 'inspected_date', type: 'datetime', nullable: true })
  inspectedDate?: string

  @Column({ name: 'date_last_chg_workflow', type: 'datetime', nullable: true })
  dateLastChgWorkflow?: string
}
