import { Column, Entity } from 'typeorm'

import { EntityBase } from 'src/commons/entity/entity-base'

/** EXP_EXPENSE_GROUP.split_type: cómo se repartió el gasto entre sus filas (etapa 2 suma 4 = por cantidad). */
export const GROUP_SPLIT_EQUAL = 1
export const GROUP_SPLIT_PERCENT = 2
export const GROUP_SPLIT_AMOUNT = 3

/**
 * EXP_EXPENSE_GROUP (migration 020): el agrupador de un gasto repartido entre dealers; en la etapa 2 es la compra.
 * No guarda total ni descripción: cada fila (EXP_EXPENSE) los lleva; el total es la suma de sus filas activas.
 * Tabla nueva → EntityBase (created_at / updated_at / deleted_at). `deleted_at` se marca cuando no le quedan filas
 * activas.
 */
@Entity({ name: 'EXP_EXPENSE_GROUP', synchronize: false })
export class ExpenseGroup extends EntityBase {
  /** La empresa (provider), como EXP_EXPENSE.id_detailer. */
  @Column({ name: 'id_detailer', type: 'int' })
  idDetailer!: number

  @Column({ name: 'id_created_by', type: 'int' })
  idCreatedBy!: number

  @Column({ name: 'split_type', type: 'tinyint' })
  splitType!: number

  /** La fila del grupo (la de menor id) bajo la que vive el adjunto en el bucket. */
  @Column({ name: 'id_attachment_expense', type: 'int', nullable: true })
  idAttachmentExpense?: number | null
}
