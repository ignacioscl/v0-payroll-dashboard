import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** Tabla legacy SRS: DEPARTMENT. Une INVOICE con su dealer (CONTRATISTA). */
@Entity({ name: 'DEPARTMENT', synchronize: false })
export class Department {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'id_dealer', type: 'int', nullable: true })
  idDealer?: number

  @Column({ name: 'id_dealer_provider', type: 'int', nullable: true })
  idDealerProvider?: number
}
