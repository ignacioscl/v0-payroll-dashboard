import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: INVOICE_STATEMENT (factura).
 * OJO: tiene AMBAS columnas, semánticas distintas:
 *  - id_dealer          = cliente que recibe/paga la factura
 *  - id_dealer_provider = provider que la emite (tenant logueado, filtro de seguridad)
 */
@Entity({ name: 'INVOICE_STATEMENT', synchronize: false })
export class InvoiceStatement {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'estado', type: 'tinyint' })
  estado!: number

  @Column({ name: 'id_dealer', type: 'int', nullable: true })
  idDealer?: number

  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  @Column({ name: 'fecha_create', type: 'datetime', nullable: true })
  fechaCreate?: string

  @Column({ name: 'sended', type: 'tinyint', nullable: true })
  sended?: number

  @Column({ name: 'last_sended', type: 'datetime', nullable: true })
  lastSended?: string

  @Column({ name: 'discount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  discount?: number

  @Column({ name: 'discount_type', type: 'tinyint', nullable: true })
  discountType?: number

  @Column({ name: 'tax', type: 'decimal', precision: 12, scale: 2, nullable: true })
  tax?: number
}
