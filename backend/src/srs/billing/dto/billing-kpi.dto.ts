import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty } from 'class-validator'

export class BillingKpiQueryDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  fechaHasta!: string
}

export class BillingKpiDto {
  @ApiProperty({ example: 254700 }) invoicedValue!: number
  @ApiProperty({ example: 312 }) statementsIssued!: number
  @ApiProperty({ example: 816 }) avgInvoiceValue!: number
  @ApiProperty({ example: 391 }) unbilledWos!: number
  @ApiProperty({ example: 20460 }) unbilledValue!: number
  @ApiProperty({ example: 4.6 }) avgDoneToInvoicedDays!: number
  @ApiProperty({ example: 93.6 }) sentPct!: number
  @ApiProperty({ example: 20 }) unsentStatements!: number
  /** WO statements (types 1–4) overlapping the header range but not fully contained in it. */
  @ApiProperty({ example: 7 }) partialOverlapWoStatements!: number
  /** WO service lines on statements; filtered by WO done date (General Report). */
  @ApiProperty({ example: 182400 }) woInvoicedValue!: number
  @ApiProperty({ example: 120000 }) woInvoicedInRangeValue!: number
  @ApiProperty({ example: 62400 }) woInvoicedOutsideRangeValue!: number
  /** TTK punch amounts on statements; filtered by punch_in (General Report). */
  @ApiProperty({ example: 42100 }) ttkInvoicedValue!: number
  @ApiProperty({ example: 28000 }) ttkInvoicedInRangeValue!: number
  @ApiProperty({ example: 14100 }) ttkInvoicedOutsideRangeValue!: number
  /** Generic statement lines prorated to the header range (General Report). */
  @ApiProperty({ example: 30200 }) genericInvoicedValue!: number
  @ApiProperty({ example: 5000 }) genericInvoicedInRangeValue!: number
  @ApiProperty({ example: 25200 }) genericInvoicedOutsideRangeValue!: number
}

/** Aging de WOs Done sin facturar (por bucket de antigüedad). */
export class UnbilledAgingBucketDto {
  @ApiProperty({ example: '0-7 days' }) bucket!: string
  @ApiProperty({ example: 214 }) wos!: number
  @ApiProperty({ example: 11180 }) value!: number
}

/** Punto de la serie semanal del gráfico Invoiced by Week. */
export class BillingWeekRowDto {
  @ApiProperty({ example: '2026-06-02', description: 'Monday of the ISO week (YYYY-MM-DD)' })
  weekStart!: string

  @ApiProperty({ example: 61500 }) invoicedValue!: number
}

/** WOs Done sin facturar agrupadas por dealer (tabla Unbilled Work by Dealer). */
export class UnbilledDealerRowDto {
  @ApiProperty({ example: 42 }) dealerId!: number
  @ApiProperty({ example: 'Ford Hollywood' }) dealer!: string
  @ApiProperty({ example: 84 }) wos!: number
  @ApiProperty({ example: 4690 }) value!: number
  @ApiProperty({ example: 38, description: 'Días desde el Done más antiguo sin facturar' })
  oldestDays!: number
}
