import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator'

import { isYmd } from '../../payroll/snapshot/payroll-dates'
import { isSundayYmd, openInvoicesToday, type OpenInvoiceBucket } from '../open-invoice-aging'

function parseBool({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return undefined
}

/** Query of Reports › Open Invoices (screen and Excel): the «As of» Sunday and the dealer combo. */
export class OpenInvoicesQueryDto {
  @ApiProperty({ description: '«As of» Sunday (YYYY-MM-DD), not in the future', example: '2026-09-27' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOf!: string

  @ApiProperty({ description: 'Dealer ids from header combo (comma-separated)', example: '12,34' })
  @IsString()
  @IsNotEmpty()
  idDealer!: string

  @ApiPropertyOptional({
    description: 'Also count the removed dealers (rule include-removed-dealers). Honoured only for Admin General / Admin Company.',
    example: 'false',
  })
  @IsOptional()
  @Transform(parseBool)
  includeRemovedDealers?: boolean
}

export const OPEN_INVOICES_AS_OF_ERROR = 'As of must be a Sunday, not in the future.'

/** `asOf` is a real date, a Sunday and not after today in New York (§4.2, T4). */
export function isValidOpenInvoicesAsOf(asOf: string, now: Date = new Date()): boolean {
  if (!isYmd(asOf)) return false
  const [y, m, d] = asOf.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false
  return isSundayYmd(asOf) && asOf <= openInvoicesToday(now)
}

export class OpenInvoiceSummaryRowDto {
  @ApiProperty() dealerId!: number
  @ApiProperty() dealer!: string
  @ApiProperty({ description: 'The dealer was removed from the company dealer list' }) removed!: boolean
  @ApiProperty({ example: 'Timesheets · Valet' }) department!: string
  @ApiProperty() current!: number
  @ApiProperty() d15!: number
  @ApiProperty() d30!: number
  @ApiProperty() d60!: number
  @ApiProperty() d90!: number
  @ApiProperty() total!: number
}

export class OpenInvoiceTotalsDto {
  @ApiProperty() current!: number
  @ApiProperty() d15!: number
  @ApiProperty() d30!: number
  @ApiProperty() d60!: number
  @ApiProperty() d90!: number
  @ApiProperty() total!: number
}

export class OpenInvoicesDto {
  @ApiProperty({ example: '2026-09-27' }) asOf!: string
  @ApiProperty({ description: 'UTC ISO instant the balance and the days were taken' }) generatedAt!: string
  @ApiProperty({ type: [OpenInvoiceSummaryRowDto] }) rows!: OpenInvoiceSummaryRowDto[]
  @ApiProperty({ type: OpenInvoiceTotalsDto }) totals!: OpenInvoiceTotalsDto
}

/** Page of the snapshot list (§1.5). */
export class OpenInvoiceSnapshotsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number
}

export class OpenInvoiceSnapshotHeaderDto {
  @ApiProperty() id!: number
  @ApiProperty({ description: 'UTC ISO instant: «Generated» of the Excel' }) generatedAt!: string
  @ApiProperty() generatedBy!: string
  @ApiProperty({ example: '2026-09-27' }) asOf!: string
  @ApiProperty({ description: '«All» or the names of the dealers of the filter (only the ones the user sees)' }) dealers!: string
  @ApiProperty() includeRemovedDealers!: boolean
  @ApiProperty({ description: 'Total of the dealers the user sees' }) total!: number
  @ApiProperty({ description: 'Rows of the dealers the user sees' }) rowCount!: number
}

export class OpenInvoiceSnapshotPageDto {
  @ApiProperty({ type: [OpenInvoiceSnapshotHeaderDto] }) results!: OpenInvoiceSnapshotHeaderDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() hasMore!: boolean
}

export class OpenInvoiceCompareSideDto {
  @ApiProperty() amount!: number
  @ApiProperty({ enum: ['current', 'd15', 'd30', 'd60', 'd90'], nullable: true }) bucket!: OpenInvoiceBucket | null
}

export class OpenInvoiceCompareRowDto {
  @ApiProperty() sid!: number
  @ApiProperty() dealerId!: number
  @ApiProperty() dealer!: string
  @ApiProperty() removed!: boolean
  @ApiProperty() invoice!: string
  @ApiProperty() department!: string
  @ApiProperty({ type: OpenInvoiceCompareSideDto, nullable: true }) snapshot!: OpenInvoiceCompareSideDto | null
  @ApiProperty({ type: OpenInvoiceCompareSideDto, nullable: true }) today!: OpenInvoiceCompareSideDto | null
  @ApiProperty({ description: 'today − snapshot' }) difference!: number
  @ApiProperty({ type: [String] }) why!: string[]
}

export class OpenInvoiceCompareDto {
  @ApiProperty({ type: OpenInvoiceSnapshotHeaderDto }) snapshot!: OpenInvoiceSnapshotHeaderDto
  @ApiProperty({ description: 'UTC ISO instant of «Today»' }) comparedAt!: string
  @ApiProperty({ type: [OpenInvoiceCompareRowDto] }) rows!: OpenInvoiceCompareRowDto[]
  @ApiProperty() totals!: { snapshot: number; today: number; difference: number }
}
