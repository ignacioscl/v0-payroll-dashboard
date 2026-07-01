import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: BILLING_WO_REL. Aplica un cheque (BILLING) a:
 *  - id_statement          -> un statement completo, o
 *  - id_statement_inv_rel  -> una línea suelta del statement
 */
@Entity({ name: 'BILLING_WO_REL', synchronize: false })
export class BillingWoRel {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_billing', type: 'int' })
  idBilling!: number

  @Column({ name: 'id_statement', type: 'int', nullable: true })
  idStatement?: number

  @Column({ name: 'id_statement_inv_rel', type: 'int', nullable: true })
  idStatementInvRel?: number
}
