import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

export class PunchGroupedQueryDto extends SrsKpiQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 25

  @ApiPropertyOptional({ description: 'nombreEmployee | hoursNumber | breakNumber', example: 'hoursNumber' })
  @IsOptional()
  @IsString()
  sort?: string

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc'

  /** Filtra el TOTAL agregado por empleado (no la ponchada individual). */
  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minHoursTotal?: number

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxHoursTotal?: number

  /** GENERIC_DATA.id del catálogo de payment types (Issues toolbar). */
  @ApiPropertyOptional({ example: 101 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPaymentType?: number

  @ApiPropertyOptional({ description: 'Nombre o parte del nombre del empleado' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmployee?: number

  @ApiPropertyOptional({
    example: 'only_error',
    description:
      'all | only_error | only_error_clockout | only_error_break | manual_punch | only_deletes | without_salary | only_fixed',
  })
  @IsOptional()
  @IsString()
  issueType?: string
}

export class PunchGroupedPaymentTypeRowDto {
  @ApiProperty({ example: 101 })
  idPaymentType!: number | null

  @ApiProperty({ example: 'Hourly' })
  label!: string

  @ApiProperty({ example: 35.0 })
  hoursNumber!: number
}

export class PunchGroupedRowDto {
  @ApiProperty({ example: 123 })
  idUsuario!: number

  @ApiProperty({ example: 'John Doe' })
  nombreEmployee!: string

  @ApiProperty({ example: 41.5 })
  hoursNumber!: number

  @ApiProperty({ example: 3.0 })
  breakNumber!: number

  @ApiProperty({ example: true })
  hasError!: boolean

  @ApiProperty({ type: [PunchGroupedPaymentTypeRowDto] })
  byPaymentType!: PunchGroupedPaymentTypeRowDto[]
}

export class PunchGroupedResponseDto {
  @ApiProperty({ type: [PunchGroupedRowDto] })
  results!: PunchGroupedRowDto[]

  @ApiProperty({ example: 1 })
  page!: number

  @ApiProperty({ example: 25 })
  pageSize!: number

  @ApiProperty({ example: 42 })
  total!: number

  @ApiProperty({ example: true })
  hasMore!: boolean
}
