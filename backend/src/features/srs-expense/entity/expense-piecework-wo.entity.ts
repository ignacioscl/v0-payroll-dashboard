import { Column, Entity } from 'typeorm'

import { EntityBase } from 'src/commons/entity/entity-base'

/**
 * `EXP_EXPENSE_PIECEWORK_WO` (migration 032, plans/plan-reunion-juan-18-11 tema 4): una fila por servicio de cada WO de
 * una expense Piecework. Desde T5b (migration 034) la fila sigue a su WO: la noche, después de recalcular el Payroll
 * del pay period, le vuelve a calcular monto, dealer y fecha (`ExpensePieceworkRecalcService`), y cada cambio queda en
 * `EXP_EXPENSE_PIECEWORK_WO_HISTORY`. Borrar la expense libera la WO: la regla «una WO en una sola expense activa» une
 * con `EXP_EXPENSE.estado = 1`. `deleted_at` = la WO salió de la expense (Edit, D18; o la fecha cambió fuera de sus
 * pay periods, D20) y quedó libre; la fila queda como histórico y la expense sigue siendo Piecework.
 */
@Entity({ name: 'EXP_EXPENSE_PIECEWORK_WO', synchronize: false })
export class ExpensePieceworkWo extends EntityBase {
  /** La fila de EXP_EXPENSE del dealer de la WO. */
  @Column({ name: 'id_expense', type: 'int' })
  idExpense!: number

  @Column({ name: 'id_invoice', type: 'int' })
  idInvoice!: number

  /** INVOICE_SERVICE: así Window Tint Closing toma solo los servicios con «tint». */
  @Column({ name: 'id_invoice_service', type: 'int' })
  idInvoiceService!: number

  /** El vendor. */
  @Column({ name: 'id_employee', type: 'int' })
  idEmployee!: number

  /** El dealer de la WO (DEPARTMENT.id_dealer). */
  @Column({ name: 'id_dealer', type: 'int' })
  idDealer!: number

  /** decimal(10,2): el piecework del servicio para el vendor, congelado al grabar. */
  @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
  amount!: string

  /** DATE(INVOICE.fecha_alta): el día con que el snapshot cuenta ese piecework (YYYY-MM-DD). */
  @Column({ name: 'work_date', type: 'date' })
  workDate!: string

  // Migration 034: la última revisión y lo que entró en el cálculo, para explicar después qué cambió (review R4).

  @Column({ name: 'checked_at', type: 'datetime', nullable: true })
  checkedAt?: string | null

  @Column({ name: 'src_wo_estado', type: 'tinyint', nullable: true })
  srcWoEstado?: number | null

  @Column({ name: 'src_has_service', type: 'tinyint', nullable: true })
  srcHasService?: number | null

  @Column({ name: 'src_has_vendor', type: 'tinyint', nullable: true })
  srcHasVendor?: number | null

  @Column({ name: 'src_service_piecework', type: 'decimal', precision: 10, scale: 2, nullable: true })
  srcServicePiecework?: string | null

  @Column({ name: 'src_service_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  srcServicePrice?: string | null

  @Column({ name: 'src_employee_piecework', type: 'decimal', precision: 10, scale: 2, nullable: true })
  srcEmployeePiecework?: string | null

  @Column({ name: 'src_employee_count', type: 'int', nullable: true })
  srcEmployeeCount?: number | null
}
