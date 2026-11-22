import { Column, Entity } from 'typeorm'

import { EntityBase } from 'src/commons/entity/entity-base'

/**
 * `EXP_EXPENSE_PIECEWORK_WO` (migration 032, plans/plan-reunion-juan-18-11 tema 4): una fila por servicio de cada WO de
 * una expense Piecework. El monto queda congelado al grabar; las filas no se editan (una expense Piecework se borra y
 * se carga de nuevo). Borrar la expense libera la WO: la regla «una WO en una sola expense activa» une con
 * `EXP_EXPENSE.estado = 1`.
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
}
