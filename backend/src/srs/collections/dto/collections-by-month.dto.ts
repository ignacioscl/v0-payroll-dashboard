import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsOptional } from 'class-validator'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

const HISTORY_MONTHS = [4, 6, 8, 10, 12] as const

export class CollectionsByMonthQueryDto extends SrsKpiQueryDto {
  @ApiPropertyOptional({
    description: 'Number of calendar months to show (ending at fechaHasta)',
    enum: HISTORY_MONTHS,
    default: 4,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    return Number(value)
  })
  @IsIn(HISTORY_MONTHS)
  historyMonths?: number
}

export class CollectionsByMonthRowDto {
  @ApiProperty({ example: '2026-03-01' }) monthStart!: string
  @ApiProperty({ example: 12 }) statementsIssued!: number
  @ApiProperty({ example: 48500 }) invoicedValue!: number
  @ApiProperty({ example: 9 }) collectedStatements!: number
  @ApiProperty({ example: 39200 }) collectedValue!: number
  @ApiProperty({ example: 80.8 }) collectionRatePct!: number
}
