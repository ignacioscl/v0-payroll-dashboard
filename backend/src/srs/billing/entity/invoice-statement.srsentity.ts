import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Tabla legacy SRS: INVOICE_STATEMENT.
 * Solo columnas usadas por los KPIs de billing/collections.
 * Mirrors public/php/pojos/invoice/InvoiceStatement.php.
 */
@Entity({ name: 'INVOICE_STATEMENT', synchronize: false })
export class InvoiceStatement {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number

  @Column({ name: 'estado', type: 'tinyint' })
  estado!: number

  @Column({ name: 'id_dealer', type: 'int' })
  idDealer!: number

  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  @Column({ name: 'statement_type', type: 'tinyint' })
  statementType!: number

  @Column({ name: 'sended', type: 'tinyint', default: 0 })
  sended!: number

  @Column({ name: 'fecha_create', type: 'datetime', nullable: true })
  fechaCreate?: string

  @Column({ name: 'fecha_desde', type: 'date', nullable: true })
  fechaDesde?: string

  @Column({ name: 'fecha_hasta', type: 'date', nullable: true })
  fechaHasta?: string

  @Column({ name: 'discount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  discount?: number

  @Column({ name: 'discount_type', type: 'tinyint', nullable: true })
  discountType?: number
}

export enum StatementType {
  INDIVIDUAL = 1,
  SERVICE = 2,
  MULTI_SERVICE = 3,
  SELECTED_SERVICES = 4,
  TTK = 5,
  GENERIC = 6,
}

/** WO billing statements (excludes TTK and Generic). */
export const WO_STATEMENT_TYPES: readonly StatementType[] = [
  StatementType.INDIVIDUAL,
  StatementType.SERVICE,
  StatementType.MULTI_SERVICE,
  StatementType.SELECTED_SERVICES,
]

/** Comma list for SQL `IN (...)` clauses. */
export function statementTypesSqlIn(types: readonly StatementType[]): string {
  return types.join(', ')
}
