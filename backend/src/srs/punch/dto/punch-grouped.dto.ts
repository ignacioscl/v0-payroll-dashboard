import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { IsValidPunchDateRange } from '../punch-date-range'
import { PUNCH_ISSUE_TYPES } from '../punch-issue-types'
import { PUNCH_LIST_LIVE_STATUS, type PunchListLiveStatus } from './punch-list.dto'

/**
 * Columnas por las que se puede ordenar la vista agrupada (whitelist).
 *
 * Vive en el DTO, no en el repositorio, para que el `@IsIn` no dependa de
 * importar el repo (ciclo). El repositorio tipa su mapa contra esto, asi que
 * agregar una clave aca sin darle spec alla no compila.
 */
export const PUNCH_GROUPED_SORTS = [
  'nombreEmployee',
  'hoursNumber',
  'breakNumber',
  'punchCount',
  'errorCount',
  'fixedCount',
] as const
export type PunchGroupedSort = (typeof PUNCH_GROUPED_SORTS)[number]

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

  @ApiPropertyOptional({
    enum: PUNCH_GROUPED_SORTS,
    example: 'hoursNumber',
    description:
      'Columna de orden. Un valor desconocido da 400: antes era @IsString() y el ' +
      'repositorio caia a `nombreEmployee` en SILENCIO, o sea BUG-07 otra vez en ' +
      'cuanto se agregara una columna ordenable.',
  })
  @IsOptional()
  @IsIn(PUNCH_GROUPED_SORTS as unknown as string[])
  sort?: PunchGroupedSort

  @ApiPropertyOptional({
    enum: PUNCH_LIST_LIVE_STATUS,
    example: 'working',
    description:
      'Estado en vivo del dia. La pantalla YA mostraba estas tarjetas en Grouped, ' +
      'pero la consulta del padre no las aplicaba y el detalle expandido si: la fila ' +
      'y su detalle contaban universos distintos (§4.1bis).',
  })
  @IsOptional()
  @IsIn(PUNCH_LIST_LIVE_STATUS as unknown as string[])
  todayLiveStatus?: PunchListLiveStatus

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
  @ApiPropertyOptional({
    example: '8,10',
    description:
      'CSV de GENERIC_DATA.id de payment type (max 50). Ausente = sin filtro. ' +
      'Los ids se validan contra el catalogo del provider: uno ajeno => 400. ' +
      'Para «sin tipo de pago» va issueType=without_salary, no este parametro.',
  })
  @IsOptional()
  @Matches(/^[1-9]\d{0,9}(,[1-9]\d{0,9}){0,49}$/, {
    message: 'idPaymentTypes must be a comma-separated list of positive integer ids (max 50).',
  })
  idPaymentTypes?: string

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

  @ApiProperty({ example: 12, description: 'P7 — ponchadas del empleado que entran en el filtro' })
  punchCount!: number

  @ApiProperty({
    example: 3,
    description:
      'P7 — de esas, cuantas siguen con error HOY. Significa lo mismo en Pending y en Corrected.',
  })
  errorCount!: number

  @ApiProperty({
    example: 4,
    description: 'P7 — de esas, cuantas tienen al menos una correccion registrada en el periodo.',
  })
  fixedCount!: number

  @ApiPropertyOptional({
    example: 'Clock out is not set<br/>Break is not set',
    description: 'Distinct punch error messages for this employee in the period',
  })
  errorSummary?: string | null

  @ApiPropertyOptional({
    example: [1, 2],
    description:
      'Corrected error types for this employee in the period (only_fixed mode). ' +
      'Null in every other mode: there the column answers "does this employee have errors?", ' +
      'and here it answers "what was corrected?".',
  })
  correctedTypes?: number[] | null

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
