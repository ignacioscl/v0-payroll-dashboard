import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty } from 'class-validator'

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

/** AR aging por bucket de antigüedad. */
export class ArAgingBucketDto {
  @ApiProperty({ example: '0-30 days' }) bucket!: string
  @ApiProperty({ example: 49 }) statements!: number
  @ApiProperty({ example: 41200 }) value!: number
}
