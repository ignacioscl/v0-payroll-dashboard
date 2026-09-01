import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { IsValidPunchDateRange } from '../punch-date-range'
import { PUNCH_ISSUE_TYPES } from '../punch-issue-types'

export class PunchGroupedQueryDto extends SrsKpiQueryDto {
  @ApiProperty({ description: 'Fecha hasta (YYYY-MM-DD)', example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  @IsValidPunchDateRange()
  declare fechaHasta: string

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
    enum: PUNCH_ISSUE_TYPES,
    example: 'only_error',
  })
  @IsOptional()
  @IsIn(PUNCH_ISSUE_TYPES as unknown as string[])
  issueType?: string

  @ApiPropertyOptional({
    description: 'Lista blanca de tipos de error (1,2,3). Ausente = 1,2,3.',
    example: '1,3',
  })
  @IsOptional()
  @Matches(/^[123](,[123]){0,2}$/, {
    message: 'errorTypes must be a comma-separated list of 1, 2 and/or 3.',
  })
  errorTypes?: string

  /**
   * Congela la frontera superior del período: `punch_in <= snapshotAt`.
   *
   * Esta vista pagina por número de página (OFFSET). Sin el snapshot, cada ponchada
   * nueva que entra mientras el usuario navega corre los offsets y hace que un
   * empleado aparezca dos veces o se saltee. El front lo captura al montar la tabla
   * y lo manda en TODAS las páginas para que todas miren la misma foto.
   *
   * Opcional: sin él, el comportamiento es exactamente el de antes.
   */
  @ApiPropertyOptional({
    example: '2026-07-30 12:08:13',
    description: 'Frontera superior congelada (YYYY-MM-DD HH:mm:ss)',
  })
  @IsOptional()
  @IsString()
  snapshotAt?: string
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

  @ApiPropertyOptional({
    example: 'Clock out is not set<br/>Break is not set',
    description: 'Distinct punch error messages for this employee in the period',
  })
  errorSummary?: string | null

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

  /**
   * Frontera congelada con la que se resolvió esta página. La genera el server
   * (`NOW()` de la base) en la primera y el cliente la reenvía en las siguientes,
   * para que todas las páginas miren la misma foto.
   */
  @ApiProperty({ example: '2026-07-30 12:08:13' })
  snapshotAt!: string
}
