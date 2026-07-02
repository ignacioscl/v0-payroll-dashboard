import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator'

/** Query params shared by all SRS KPI endpoints (header date range + dealer combo). */
export class SrsKpiQueryDto {
  @ApiProperty({ description: 'Fecha desde (YYYY-MM-DD)', example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ description: 'Fecha hasta (YYYY-MM-DD)', example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  fechaHasta!: string

  @ApiProperty({
    description: 'Dealer ids from header combo (comma-separated)',
    example: '12,34',
  })
  @IsString()
  @IsNotEmpty()
  idDealer!: string

  @ApiPropertyOptional({
    description: 'Production only: filter WOs by Done date (true) vs created date (false). Default false.',
    example: 'true',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || value === 'true' || value === '1' || value === 1) return true
    if (value === false || value === 'false' || value === '0' || value === 0) return false
    return undefined
  })
  filterDateDone?: boolean

  @ApiPropertyOptional({
    description:
      'When true, include zero-value work orders and invoices in WO/billing KPIs. Default false (legacy exclude zeros).',
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
