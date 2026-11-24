import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/**
 * Legacy SRS: `INVOICE` es la WO (la invoice es `INVOICE_STATEMENT`). Conexión principal, solo las columnas que
 * WO to be Billed lee y escribe (plans/plan-wo-to-be-billed-v0, §8.2). La clase se llama `WorkOrder` porque
 * `InvoiceService` e `InvoiceController` ya existen y son de la invoice.
 *
 * **Escribe solo** `estado`, `ro`, `po`, `ro_semi_req`, `po_semi_req` y `stock_semi_req`: son las columnas del `GRANT`
 * de la migration 035 (el usuario del Nest en PROD no puede tocar otras). Lo controla `work-order-columns.spec.ts`.
 */
@Entity({ name: 'INVOICE', synchronize: false })
export class WorkOrder extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  @Column({ name: 'id_author', type: 'int' })
  idAuthor!: number

  @Column({ name: 'id_department', type: 'int' })
  idDepartment!: number

  @Column({ name: 'id_workflow', type: 'int' })
  idWorkflow!: number

  @Column({ name: 'full_nro', type: 'varchar', length: 64 })
  fullNro!: string

  @Column({ name: 'stock_number', type: 'varchar', length: 32, nullable: true })
  stockNumber!: string | null

  @Column({ name: 'fecha_alta', type: 'datetime' })
  fechaAlta!: string

  @Column({ name: 'ro', type: 'varchar', length: 16, nullable: true })
  ro!: string | null

  @Column({ name: 'po', type: 'varchar', length: 16, nullable: true })
  po!: string | null

  @Column({ name: 'ro_semi_req', type: 'tinyint', nullable: true })
  roSemiReq!: number | null

  @Column({ name: 'po_semi_req', type: 'tinyint', nullable: true })
  poSemiReq!: number | null

  @Column({ name: 'stock_semi_req', type: 'tinyint', nullable: true })
  stockSemiReq!: number | null

  @Column({ name: 'estado', type: 'tinyint' })
  estado!: number
}

/** Las columnas de `INVOICE` que el Nest puede escribir: las del `GRANT UPDATE (…)` de la migration 035 (T1). */
export const WORK_ORDER_WRITABLE_COLUMNS = ['estado', 'ro', 'po', 'ro_semi_req', 'po_semi_req', 'stock_semi_req'] as const
