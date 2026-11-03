import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** EXP_EXPENSE_REPETITIVE.frequency */
export const RULE_FREQUENCY_MONTHLY = 1
export const RULE_FREQUENCY_WEEKLY = 2

/** Legacy SRS: EXP_EXPENSE_REPETITIVE (una regla de gasto recurrente). */
@Entity({ name: 'EXP_EXPENSE_REPETITIVE', synchronize: false })
export class ExpenseRepetitive extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id', type: 'int', unsigned: true })
  id!: number

  /** La empresa (provider). */
  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  /** Autor de la regla: el cron lo usa como autor de cada gasto generado. */
  @Column({ name: 'id_author', type: 'int' })
  idAuthor!: number

  @Column({ name: 'id_author_delete', type: 'int', nullable: true })
  idAuthorDelete?: number | null

  @Column({ name: 'id_company', type: 'int' })
  idCompany!: number

  @Column({ name: 'id_category', type: 'int' })
  idCategory!: number

  @Column({ name: 'description', type: 'varchar', length: 64 })
  description!: string

  /** decimal(12,2) como string; NULL en By fixed amount sin dealers con monto. */
  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount?: string | null

  /** 1 = By percent, 2 = By fixed amount (ExpenseRepetitivePercentRules). */
  @Column({ name: 'split_type', type: 'tinyint', default: 1 })
  splitType!: number

  /** DATE `YYYY-MM-DD`. */
  @Column({ name: 'start_date', type: 'date' })
  startDate!: string

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: string | null

  /** 1 = monthly, 2 = weekly. */
  @Column({ name: 'frequency', type: 'tinyint', default: 1 })
  frequency!: number

  @Column({ name: 'delete_date', type: 'datetime', nullable: true })
  deleteDate?: string | null

  /** 1 activa, 0 borrada. */
  @Column({ name: 'status', type: 'tinyint', default: 1 })
  status!: number

  /** 0–6 (0 = Sunday, como `date("w")` del cron). */
  @Column({ name: 'week_day', type: 'tinyint', nullable: true })
  weekDay?: number | null
}
