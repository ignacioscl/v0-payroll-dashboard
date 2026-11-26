import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/**
 * Legacy SRS: `INVOICE_STATEMENT` (la invoice), conexión principal. Solo las columnas del INSERT de legacy
 * (`InvoiceStatementDao.php:532-565`); `ro`, `discount_type`, `emails_sended`, `last_sended`, `sended`, `fecha_create`
 * y `estado` quedan con el default del DDL, como en legacy. La entity de solo lectura de los KPIs
 * (`src/srs/billing/entity/invoice-statement.srsentity.ts`, conexión `srs`) es otra y no se toca.
 */
@Entity({ name: 'INVOICE_STATEMENT', synchronize: false })
export class InvoiceStatement extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_dealer', type: 'int' })
  idDealer!: number

  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  @Column({ name: 'id_department', type: 'int', nullable: true })
  idDepartment!: number | null

  @Column({ name: 'id_invoice_service', type: 'int', nullable: true })
  idInvoiceService!: number | null

  @Column({ name: 'id_author', type: 'int' })
  idAuthor!: number

  @Column({ name: 'id_invoice_statement_schedule', type: 'int', nullable: true })
  idInvoiceStatementSchedule!: number | null

  @Column({ name: 'invoice_service_sel_rel', type: 'varchar', length: 9000, nullable: true })
  invoiceServiceSelRel!: string | null

  @Column({ name: 'invoice_prefix', type: 'varchar', length: 16 })
  invoicePrefix!: string

  @Column({ name: 'invoice_nro', type: 'int', unsigned: true })
  invoiceNro!: number

  @Column({ name: 'full_nro', type: 'varchar', length: 64 })
  fullNro!: string

  @Column({ name: 'po', type: 'varchar', length: 16, nullable: true })
  po!: string | null

  @Column({ name: 'invoice_note', type: 'varchar', length: 255, nullable: true })
  invoiceNote!: string | null

  @Column({ name: 'header_note', type: 'varchar', length: 2048, nullable: true })
  headerNote!: string | null

  @Column({ name: 'tax', type: 'decimal', precision: 5, scale: 3, nullable: true })
  tax!: string | null

  @Column({ name: 'discount', type: 'decimal', precision: 8, scale: 2, nullable: true })
  discount!: string | null

  @Column({ name: 'discount_detail', type: 'varchar', length: 1000, nullable: true })
  discountDetail!: string | null

  /** 1 individual, 2 by Services, 3 Multi-Services, 4 Selected Services, 6 Generic. */
  @Column({ name: 'statement_type', type: 'tinyint' })
  statementType!: number

  @Column({ name: 'fecha_desde', type: 'date', nullable: true })
  fechaDesde!: string | null

  @Column({ name: 'fecha_hasta', type: 'date', nullable: true })
  fechaHasta!: string | null
}
