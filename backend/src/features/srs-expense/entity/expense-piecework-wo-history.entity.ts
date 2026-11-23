import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** De dónde salió el cambio: la noche (con el snapshot de Payroll) o Edit de la expense (D18). */
export type PieceworkHistorySource = 'nightly' | 'edit'

/**
 * `EXP_EXPENSE_PIECEWORK_WO_HISTORY` (migration 034, plans/plan-reunion-juan-18-11 T5b): el histórico de
 * `EXP_EXPENSE_PIECEWORK_WO`. Una fila por cada cambio de una fila de la expense, con antes y después, el motivo
 * (`reason`, código; el texto lo arma la pantalla) y quién. Solo se inserta: nunca se edita ni se borra.
 */
@Entity({ name: 'EXP_EXPENSE_PIECEWORK_WO_HISTORY', synchronize: false })
export class ExpensePieceworkWoHistory {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_piecework_wo', type: 'int' })
  idPieceworkWo!: number

  /** La fila de EXP_EXPENSE donde quedó (si cambió de dealer, la del dealer nuevo). */
  @Column({ name: 'id_expense', type: 'int' })
  idExpense!: number

  @Column({ name: 'id_invoice', type: 'int' })
  idInvoice!: number

  /** NULL: la fila es nueva (se agregó la WO o un servicio). */
  @Column({ name: 'old_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  oldAmount!: string | null

  @Column({ name: 'new_amount', type: 'decimal', precision: 10, scale: 2 })
  newAmount!: string

  @Column({ name: 'old_id_dealer', type: 'int', nullable: true })
  oldIdDealer!: number | null

  @Column({ name: 'new_id_dealer', type: 'int' })
  newIdDealer!: number

  @Column({ name: 'old_work_date', type: 'date', nullable: true })
  oldWorkDate!: string | null

  @Column({ name: 'new_work_date', type: 'date' })
  newWorkDate!: string

  /** Código de `PieceworkChangeReason` (rules/expense-piecework-recalc.ts). */
  @Column({ name: 'reason', type: 'varchar', length: 32 })
  reason!: string

  /** Los valores que explican el motivo («Wash: 30.00 -> 40.00»). */
  @Column({ name: 'detail', type: 'varchar', length: 500, nullable: true })
  detail!: string | null

  @Column({ name: 'source', type: 'varchar', length: 16 })
  source!: PieceworkHistorySource

  /** Quién, en Edit; NULL de noche. */
  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  idUsuario!: number | null

  /** De noche: el último que editó la WO y cuándo (LOG_CHANGE). */
  @Column({ name: 'wo_changed_by', type: 'int', nullable: true })
  woChangedBy!: number | null

  @Column({ name: 'wo_changed_at', type: 'datetime', nullable: true })
  woChangedAt!: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt?: Date
}
