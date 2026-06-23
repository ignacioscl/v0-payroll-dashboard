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
}

/** Aging de WOs Done sin facturar (por bucket de antigüedad). */
export class UnbilledAgingBucketDto {
  @ApiProperty({ example: '0-7 days' }) bucket!: string
  @ApiProperty({ example: 214 }) wos!: number
  @ApiProperty({ example: 11180 }) value!: number
}
