import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** Legacy SRS: EXP_EXPENSE_DEALER_ASSIGN (un dealer de una regla recurrente; UNIQUE regla + dealer). */
@Entity({ name: 'EXP_EXPENSE_DEALER_ASSIGN', synchronize: false })
export class ExpenseDealerAssign extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_exp_repetitive', type: 'int', unsigned: true })
  idExpRepetitive!: number

  @Column({ name: 'id_dealer', type: 'int' })
  idDealer!: number

  /** decimal(6,2) como string; NULL = sin porcentaje. */
  @Column({ name: 'percentage', type: 'decimal', precision: 6, scale: 2, nullable: true })
  percentage?: string | null

  /** decimal(10,2) como string; NULL = sin monto (By fixed amount). */
  @Column({ name: 'fixed_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
  fixedAmount?: string | null

  /** 1 = Automatic (default de la base), 0 = Manual. */
  @Column({ name: 'has_automatic_percentaje', type: 'tinyint', default: 1 })
  hasAutomaticPercentaje!: number
}
