import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

import { SrsEntityBase } from 'src/commons/entity/srs-entity-base'

/**
 * Legacy SRS: `INVOICE_STATEMENT_SEL_SER_REL`, los servicios elegidos de una invoice «Invoice by Selected Services»
 * (una fila por servicio, tenga o no líneas). Comparte el feature de su dueño (`*_REL`).
 */
@Entity({ name: 'INVOICE_STATEMENT_SEL_SER_REL', synchronize: false })
export class InvoiceStatementSelSerRel extends SrsEntityBase {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_statement', type: 'int' })
  idStatement!: number

  @Column({ name: 'id_inv_service', type: 'int' })
  idInvService!: number
}
