import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: INVOICE_STATEMENT_INV_REL (líneas de un statement).
 *  - Si `amount` no es null  -> línea genérica/ttk: vale generic_qty * amount
 *  - Si apunta a id_invoice  -> vale la suma de servicios de esa WO
 *  - only_timecard = 1 se excluye de los montos facturados
 *  - pagado = fuente de verdad de "línea cobrada"
 */
@Entity({ name: 'INVOICE_STATEMENT_INV_REL', synchronize: false })
export class InvoiceStatementInvRel {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_statement', type: 'int' })
  idStatement!: number

  @Column({ name: 'id_invoice', type: 'int', nullable: true })
  idInvoice?: number

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount?: number

  @Column({ name: 'generic_qty', type: 'int', nullable: true })
  genericQty?: number

  @Column({ name: 'only_timecard', type: 'tinyint', default: 0 })
  onlyTimecard!: number

  @Column({ name: 'pagado', type: 'tinyint', default: 0 })
  pagado!: number
}
