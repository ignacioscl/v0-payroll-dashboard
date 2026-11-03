import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** Legacy SRS: EXP_EXPENSE (un gasto en un dealer). Columnas reales + las tres de la migration 020. */
@Entity({ name: 'EXP_EXPENSE', synchronize: false })
export class Expense extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  /** La empresa (provider), como PHP `$obj->detailer = $user->getCompany()`. */
  @Column({ name: 'id_detailer', type: 'int' })
  idDetailer!: number

  @Column({ name: 'id_dealer', type: 'int' })
  idDealer!: number

  /** Empleado al que se le asigna el gasto («Assigned to»). */
  @Column({ name: 'id_author', type: 'int' })
  idAuthor!: number

  @Column({ name: 'id_created_by', type: 'int' })
  idCreatedBy!: number

  @Column({ name: 'id_company', type: 'int' })
  idCompany!: number

  @Column({ name: 'id_category', type: 'int' })
  idCategory!: number

  @Column({ name: 'id_exp_repetitive', type: 'int', unsigned: true, nullable: true })
  idExpRepetitive?: number | null

  /** Migration 020: el agrupador de un gasto repartido entre dealers. */
  @Column({ name: 'id_exp_group', type: 'int', nullable: true })
  idExpGroup?: number | null

  /** decimal(10,2): llega como string con dos decimales (dateStrings / mysql2). */
  @Column({ name: 'amount', type: 'decimal', precision: 10, scale: 2 })
  amount!: string

  /** DATE `YYYY-MM-DD`. */
  @Column({ name: 'ticket_date', type: 'date' })
  ticketDate!: string

  @Column({ name: 'has_main_photo', type: 'varchar', length: 64, nullable: true })
  hasMainPhoto?: string | null

  @Column({ name: 'has_other_photo', type: 'tinyint', default: 0 })
  hasOtherPhoto!: number

  @Column({ name: 'lat', type: 'decimal', precision: 17, scale: 14, nullable: true })
  lat?: string | null

  @Column({ name: 'lng', type: 'decimal', precision: 17, scale: 14, nullable: true })
  lng?: string | null

  /** NOT NULL: Pro manda '' cuando está vacío. */
  @Column({ name: 'notes', type: 'varchar', length: 512 })
  notes!: string

  /** Migration 020. */
  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description?: string | null

  /** Migration 020. */
  @Column({ name: 'receipt_number', type: 'varchar', length: 64, nullable: true })
  receiptNumber?: string | null

  /** NULL = pending, 1 = approved, 0 = rejected (D1). */
  @Column({ name: 'is_approved', type: 'tinyint', nullable: true })
  isApproved?: number | null

  @Column({ name: 'id_author_approved', type: 'int', nullable: true })
  idAuthorApproved?: number | null

  @Column({ name: 'approved_date', type: 'datetime', nullable: true })
  approvedDate?: string | null

  @Column({ name: 'id_author_del', type: 'int', nullable: true })
  idAuthorDel?: number | null

  @Column({ name: 'deleted_date', type: 'datetime', nullable: true })
  deletedDate?: string | null

  @Column({ name: 'created_date', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdDate?: string

  /** 1 activo, 0 borrado (lo que leen legacy y los reportes). */
  @Column({ name: 'estado', type: 'tinyint', default: 1 })
  estado!: number
}
