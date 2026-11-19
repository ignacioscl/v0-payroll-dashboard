import { Column, Entity } from 'typeorm'

import { EntityBase } from '../../../commons/entity/entity-base'
import { utcDateTimeTransformer } from '../../../jobs/utc-datetime.transformer'

/**
 * `OPEN_INVOICE_SNAPSHOT` (migration 031, plans/plan-reporte-javier §3.6, §4.4): what each Excel export of
 * Reports › Open Invoices showed, to compare it with today. One row per export; never edited or deleted.
 * The invoices of the snapshot go as JSON on purpose (no FK to INVOICE_STATEMENT): the snapshot has to
 * outlive a deleted invoice.
 */
@Entity({ name: 'OPEN_INVOICE_SNAPSHOT', synchronize: false })
export class OpenInvoiceSnapshot extends EntityBase {
  /** The company (CONTRATISTA): every read filters by it. */
  @Column({ name: 'id_dealer_provider', type: 'int' })
  idDealerProvider!: number

  /** usuarios.id_usuario of who exported (ctx.idUsuario). */
  @Column({ name: 'id_usuario', type: 'int' })
  idUsuario!: number

  /** UTC `YYYY-MM-DD HH:MM:SS`: the «Generated» of the Excel. */
  @Column({ name: 'generated_at', type: 'datetime', transformer: utcDateTimeTransformer })
  generatedAt!: string

  /** The «As of» Sunday, `YYYY-MM-DD`. */
  @Column({ name: 'as_of', type: 'date' })
  asOf!: string

  /** Dealer ids picked, comma-separated; NULL = All. */
  @Column({ name: 'dealer_ids', type: 'varchar', length: 2000, nullable: true })
  dealerIds!: string | null

  @Column({ name: 'include_removed', type: 'tinyint', width: 1, default: 0 })
  includeRemoved!: number

  @Column({ name: 'total', type: 'decimal', precision: 14, scale: 2 })
  total!: string

  @Column({ name: 'row_count', type: 'int' })
  rowCount!: number

  /** The rows of the Invoices sheet as they came out (OpenInvoiceSnapshotRow[]). */
  @Column({ name: 'rows_json', type: 'mediumtext' })
  rowsJson!: string

  /** Every dealer of the export, also the ones at 0: `{ "<id>": { "total": n, "rows": n } }`. */
  @Column({ name: 'dealer_totals_json', type: 'text' })
  dealerTotalsJson!: string

  /** Per invoice of the snapshot, the ids of its active BILLING at export time: `{ "<sid>": [ids] }`. */
  @Column({ name: 'payments_json', type: 'mediumtext' })
  paymentsJson!: string
}
