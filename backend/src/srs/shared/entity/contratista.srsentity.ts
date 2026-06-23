import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: CONTRATISTA. Es a la vez "dealer" y "provider".
 *  - tipo_empresa: 1 = dealer, 2 = company/provider
 *  - id_empresa: FK al provider padre (multi-tenant)
 * Cuando otra tabla usa `id_dealer` o `id_dealer_provider`, es FK a CONTRATISTA.id.
 */
@Entity({ name: 'CONTRATISTA', synchronize: false })
export class Contratista {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'razon_social', type: 'varchar', length: 64 })
  razonSocial!: string

  @Column({ name: 'id_empresa', type: 'int', nullable: true })
  idEmpresa?: number

  @Column({ name: 'tipo_empresa', type: 'tinyint', default: 1 })
  tipoEmpresa!: number
}
