import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** LOG_GENERIC.tipo de los gastos: el valor que usa legacy (`LogGeneric::$TIPO_EXPENSE`) y que su lector filtra. */
export const LOG_GENERIC_TIPO_EXPENSE = 7

/** Legacy SRS: LOG_GENERIC (histórico de usuarios y de gastos; migration 020 suma `id_exp_group`). */
@Entity({ name: 'LOG_GENERIC', synchronize: false })
export class LogGeneric extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_author', type: 'int' })
  idAuthor!: number

  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  idUsuario?: number | null

  @Column({ name: 'id_motivo_baja', type: 'int', nullable: true })
  idMotivoBaja?: number | null

  @Column({ name: 'id_expense', type: 'int', nullable: true })
  idExpense?: number | null

  /** Migration 020. */
  @Column({ name: 'id_exp_group', type: 'int', nullable: true })
  idExpGroup?: number | null

  @Column({ name: 'tipo', type: 'tinyint' })
  tipo!: number

  @Column({ name: 'description', type: 'varchar', length: 512, nullable: true })
  description?: string | null

  @Column({ name: 'date_update', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  dateUpdate?: string
}
