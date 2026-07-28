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

  /** Legacy logo. Legacy keeps showing this one; v0 only reads it as a fallback. */
  @Column({ name: 'logo_img', type: 'varchar', length: 128, nullable: true })
  logoImg?: string | null

  /** v0-only logo. When set it wins over logoImg. Legacy never reads this column. */
  @Column({ name: 'v0_logo_img', type: 'varchar', length: 255, nullable: true })
  v0LogoImg?: string | null

  /** v0-only accent as #rrggbb. NULL = product default. */
  @Column({ name: 'accent_color', type: 'varchar', length: 7, nullable: true })
  accentColor?: string | null
}
