import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/** `LOG_CHANGE.origen` de lo que escribe Pro (legacy escribe «WEB x.y» o el nombre de la app). */
export const LOG_CHANGE_ORIGEN_PRO = 'pro'

/** Legacy SRS: LOG_CHANGE (histórico de invoices, billing, dealers y reglas recurrentes). */
@Entity({ name: 'LOG_CHANGE', synchronize: false })
export class LogChange extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_invoice_service', type: 'int', nullable: true })
  idInvoiceService?: number | null

  @Column({ name: 'id_invoice', type: 'int', nullable: true })
  idInvoice?: number | null

  @Column({ name: 'id_invoice_statement', type: 'int', nullable: true })
  idInvoiceStatement?: number | null

  @Column({ name: 'id_billing', type: 'int', nullable: true })
  idBilling?: number | null

  @Column({ name: 'id_dealer_rel', type: 'int', nullable: true })
  idDealerRel?: number | null

  @Column({ name: 'id_exp_repetitive', type: 'int', unsigned: true, nullable: true })
  idExpRepetitive?: number | null

  @Column({ name: 'id_autor', type: 'int' })
  idAutor!: number

  @Column({ name: 'desc_cambio', type: 'text' })
  descCambio!: string

  @Column({ name: 'desc_json', type: 'text', nullable: true })
  descJson?: string | null

  @Column({ name: 'origen', type: 'varchar', length: 32, nullable: true })
  origen?: string | null

  @Column({ name: 'fecha', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  fecha?: string
}
