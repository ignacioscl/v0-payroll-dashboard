import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/**
 * Legacy SRS: `INVOICE_STATEMENT_INV_REL`, una fila por línea de la invoice (WO + servicio). Comparte el feature de su
 * dueño (`*_REL`, `nest-feature-one-resource.mdc`). Columnas del INSERT de legacy (`InvoiceStatementDao.php:478-502`);
 * `fecha_create` y `pagado` quedan con el default del DDL.
 */
@Entity({ name: 'INVOICE_STATEMENT_INV_REL', synchronize: false })
export class InvoiceStatementInvRel extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_statement', type: 'int' })
  idStatement!: number

  /** La WO. */
  @Column({ name: 'id_invoice', type: 'int', nullable: true })
  idInvoice!: number | null

  @Column({ name: 'id_invoice_service', type: 'int', nullable: true })
  idInvoiceService!: number | null

  @Column({ name: 'id_employee_work', type: 'int', nullable: true })
  idEmployeeWork!: number | null

  @Column({ name: 'amount', type: 'decimal', precision: 8, scale: 2, nullable: true })
  amount!: string | null

  @Column({ name: 'description', type: 'varchar', length: 2048, nullable: true })
  description!: string | null

  @Column({ name: 'generic_qty', type: 'decimal', precision: 9, scale: 2, unsigned: true, nullable: true })
  genericQty!: string | null

  @Column({ name: 'only_timecard', type: 'tinyint' })
  onlyTimecard!: number
}
