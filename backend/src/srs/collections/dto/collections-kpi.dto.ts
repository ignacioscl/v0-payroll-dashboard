import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CollectionsKpiQueryDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  fechaHasta!: string
}

/** Open AR snapshot (not period-invoice cohort). Period invoiced/collected → billing/period-collection. */
export class CollectionsKpiDto {
  @ApiProperty({ example: 78400 }) outstandingAr!: number
  @ApiProperty({ example: 34.2 }) dsoDays!: number
  @ApiProperty({ example: 19.5 }) arOver60Pct!: number
  @ApiProperty({ example: 96 }) openStatements!: number
}

/**
 * Query of GET /srs/kpis/collections/outstanding: no dates on purpose. SrsKpiQueryDto has them
 * required and the global ValidationPipe (whitelist) answers 400 without them, so the card of the
 * invoice list ("Owed, all dates") would never load.
 */
export class OutstandingQueryDto {
  @ApiProperty({ description: 'Dealer ids from header combo (comma-separated)', example: '12,34' })
  @IsString()
  @IsNotEmpty()
  idDealer!: string

  @ApiPropertyOptional({
    description: 'When true, include zero-value invoices. Default false (legacy exclude zeros).',
    example: 'false',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || value === 'true' || value === '1' || value === 1) return true
    if (value === false || value === 'false' || value === '0' || value === 0) return false
    return undefined
  })
  includeZero?: boolean
}

/** What the dealers owe with no date filter (whole history), for the invoice list card. */
export class OutstandingArDto {
  @ApiProperty({ example: 78400 }) outstandingAr!: number
  @ApiProperty({ example: 96 }) openStatements!: number
}

/** AR aging por bucket de antigüedad. */
export class ArAgingBucketDto {
  @ApiProperty({ example: '0-30 days' }) bucket!: string
  @ApiProperty({ example: 49 }) statements!: number
  @ApiProperty({ example: 41200 }) value!: number
}
