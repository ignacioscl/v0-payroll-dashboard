import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** Tabla legacy SRS: INVOICE_SERVICE_REL. Valor de una WO = SUM(price * qty). */
@Entity({ name: 'INVOICE_SERVICE_REL', synchronize: false })
export class InvoiceServiceRel {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_invoice', type: 'int' })
  idInvoice!: number

  @Column({ name: 'price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  price?: number

  @Column({ name: 'qty', type: 'int', nullable: true })
  qty?: number
}
