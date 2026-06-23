import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** Tabla legacy SRS: BILLING (cheque/pago recibido). */
@Entity({ name: 'BILLING', synchronize: false })
export class Billing {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'fecha', type: 'datetime', nullable: true })
  fecha?: string

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount?: number

  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number
}
