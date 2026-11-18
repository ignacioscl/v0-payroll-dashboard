import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional } from 'class-validator'

/** For BaseRepository.fetch: by id and company only. */
export class OpenInvoiceSnapshotQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  idDealerProvider?: number
}

export type OpenInvoiceSnapshotBucket = 'current' | 'd15' | 'd30' | 'd60' | 'd90'

/**
 * One row of the Invoices sheet, as saved in `rows_json` (§3.6): invoice, dealer, department (text with
 * the position, and its key that does not depend on the language), days, term, column and amount.
 */
export type OpenInvoiceSnapshotRow = {
  sid: number
  fullNro: string
  dealerId: number
  statementType: number
  createdYmd: string
  dateToYmd: string | null
  department: string
  departmentKey: string
  days: number
  termDays: number
  bucket: OpenInvoiceSnapshotBucket
  amount: number
}

/** `dealer_totals_json`: every dealer of the export, with its total and rows (0 when it had none). */
export type OpenInvoiceSnapshotDealerTotals = Record<string, { total: number; rows: number }>

/** `payments_json`: per invoice, the ids of its active BILLING at export time. */
export type OpenInvoiceSnapshotPayments = Record<string, number[]>

/** The header of a snapshot, without its rows (the list, §1.5). */
export type OpenInvoiceSnapshotHeader = {
  id: number
  idDealerProvider: number
  idUsuario: number
  generatedAt: string
  asOf: string
  dealerIds: number[] | null
  includeRemoved: boolean
  total: number
  rowCount: number
  dealerTotals: OpenInvoiceSnapshotDealerTotals
}

/** A whole snapshot (the comparison). */
export type OpenInvoiceSnapshotFull = OpenInvoiceSnapshotHeader & {
  rows: OpenInvoiceSnapshotRow[]
  payments: OpenInvoiceSnapshotPayments
}

/** What the export saves. */
export type OpenInvoiceSnapshotSave = {
  idDealerProvider: number
  idUsuario: number
  /** The instant of «Generated». */
  generatedAt: Date
  asOf: string
  /** null = All. */
  dealerIds: number[] | null
  includeRemoved: boolean
  /** The dealer ids the engine ran with (the universe of the snapshot, §3.6). */
  engineDealerIds: number[]
  rows: OpenInvoiceSnapshotRow[]
  payments: OpenInvoiceSnapshotPayments
}
