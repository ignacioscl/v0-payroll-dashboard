import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/**
 * Categorías paramétricas de GENERIC_DATA que usa Expenses (`id_categoria`, no PKs de GENERIC_DATA: regla
 * generic-data-no-hardcoded-ids). Las mismas que `CategoriaParametrica::$ID_GENERIC_DATA_EXPENSES_COMPANY/_CATEGORY`
 * del PHP.
 */
export const EXPENSES_COMPANY_CATEGORY = 34
export const EXPENSES_CATEGORY_CATEGORY = 35

/** Legacy SRS: GENERIC_DATA (catálogos por empresa; Expenses usa las categorías 34 y 35). */
@Entity({ name: 'GENERIC_DATA', synchronize: false })
export class GenericData extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_categoria', type: 'int' })
  idCategoria!: number

  /** Compañía de gastos: la última categoría con la que se cargó un gasto (D4). */
  @Column({ name: 'id_parent', type: 'int', nullable: true })
  idParent?: number | null

  @Column({ name: 'id_dealer_provider', type: 'int', nullable: true })
  idDealerProvider?: number | null

  /** «Dealer asigned» de legacy: Pro no lo lee ni lo escribe. */
  @Column({ name: 'id_dealer', type: 'int', nullable: true })
  idDealer?: number | null

  @Column({ name: 'id_usuario', type: 'int', nullable: true })
  idUsuario?: number | null

  @Column({ name: 'name', type: 'varchar', length: 128 })
  name!: string

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title?: string | null

  @Column({ name: 'json_string', type: 'varchar', length: 1024, nullable: true })
  jsonString?: string | null

  @Column({ name: 'type', type: 'tinyint', default: 1 })
  type!: number

  @Column({ name: 'date_created', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  dateCreated?: string

  @Column({ name: 'estado', type: 'tinyint', default: 1 })
  estado!: number
}
