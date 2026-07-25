import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** Legacy SRS: CONTRATISTA (dealers / companies). */
@Entity({ name: 'CONTRATISTA', synchronize: false })
export class Contratista extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'razon_social', type: 'varchar', length: 64 })
  razonSocial!: string

  @Column({ name: 'id_empresa', type: 'int', nullable: true })
  idEmpresa?: number

  @Column({ name: 'tipo_empresa', type: 'tinyint', default: 1 })
  tipoEmpresa!: number

  /** 1=has the SRS main system enabled. */
  @Column({ name: 'is_dealer_app_main', type: 'tinyint', nullable: true })
  isDealerAppMain?: number

  /** 1=has the Valet app enabled. */
  @Column({ name: 'is_dealer_app_valet', type: 'tinyint', nullable: true })
  isDealerAppValet?: number

  /** 1=has the TV module enabled. */
  @Column({ name: 'has_module_tv', type: 'tinyint', nullable: true })
  hasModuleTv?: number
}
