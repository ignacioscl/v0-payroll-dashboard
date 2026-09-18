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
  @ApiProperty({ example: 25781 }) woInvoicedValue!: number
  @ApiProperty({ example: 46739.76 }) ttkInvoicedValue!: number
  @ApiProperty({ example: 625285.89 }) genericInvoicedValue!: number
  @ApiProperty({ example: 50996 }) woUnbilledValue!: number
  @ApiProperty({ example: 758802.65 }) producedValue!: number
  @ApiProperty({ example: 697806.65 }) collectedValue!: number
  @ApiProperty({ example: 10000 }) pendingCollectionValue!: number
  @ApiProperty({ example: 80.8 }) collectionRatePct!: number
}
