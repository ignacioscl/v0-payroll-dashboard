import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { SrsCursorDto, SrsCursorPagedResponseDto } from '../../shared/dto/srs-paged-response.dto'
import { IsValidPunchDateRange } from '../punch-date-range'
import { PUNCH_ISSUE_TYPES } from '../punch-issue-types'

/** Columnas por las que se puede ordenar el listado (whitelist). */
export const PUNCH_LIST_SORTS = ['punchIn', 'employee'] as const
export type PunchListSort = (typeof PUNCH_LIST_SORTS)[number]

/** Estados "en vivo" del día (mirror de TTKEmployeeDao::getTodayLiveStatusCondition). */
export const PUNCH_LIST_LIVE_STATUS = ['working', 'on_lunch', 'out'] as const
export type PunchListLiveStatus = (typeof PUNCH_LIST_LIVE_STATUS)[number]

export class PunchListQueryDto extends SrsKpiQueryDto {
  @ApiProperty({ description: 'Fecha hasta (YYYY-MM-DD)', example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  @IsValidPunchDateRange()
  declare fechaHasta: string

  @ApiPropertyOptional({ example: 25, description: 'Tamaño del lote' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 25

  @ApiPropertyOptional({ enum: PUNCH_LIST_SORTS, example: 'punchIn' })
  @IsOptional()
  @IsIn(PUNCH_LIST_SORTS as unknown as string[])
  sort?: PunchListSort

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc'

  @ApiPropertyOptional({
    example: '2026-07-30 12:01:16',
    description:
      'Cursor: valor de la columna ordenada en la última fila recibida. Se manda junto con afterId.',
  })
  @IsOptional()
  @IsString()
  afterValue?: string

  @ApiPropertyOptional({ example: 910577, description: 'Cursor: id de la última fila recibida' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  afterId?: number

  /** Filtra la ponchada individual (no el total del empleado, a diferencia de grouped). */
  @ApiPropertyOptional({ example: 4, description: 'Horas mínimas de la ponchada' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minHours?: number

  @ApiPropertyOptional({ example: 12, description: 'Horas máximas de la ponchada' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxHours?: number

  @ApiPropertyOptional({ example: 101, description: 'GENERIC_DATA.id del payment type' })
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
    description:
      'Lista blanca de tipos de error (1=sin salida, 2=sin descanso, 3=turno 20h+). ' +
      'Ausente = 1,2,3. Duplicados o tokens fuera de {1,2,3} => 400.',
    example: '1,3',
  })
  @IsOptional()
  @Matches(/^[123](,[123]){0,2}$/, {
    message: 'errorTypes must be a comma-separated list of 1, 2 and/or 3.',
  })
  errorTypes?: string

  /**
   * Misma frontera congelada que Grouped, propagada al detalle expandido y a su
   * export: sin ella la expansión de un grupo muestra ponchadas que no estaban en
   * el padre. Aplica en TODOS los modos; en Corrected además congela el ledger.
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

  @ApiPropertyOptional({
    enum: PUNCH_LIST_LIVE_STATUS,
    description: 'Estado en vivo del día (tarjetas del Dashboard)',
  })
  @IsOptional()
  @IsIn(PUNCH_LIST_LIVE_STATUS as unknown as string[])
  todayLiveStatus?: PunchListLiveStatus
}

/* -------------------------------------------------------------------------- */
/* Row — misma forma que `TtkListRow` del frontend (lib/ttk/ttk-list-types.ts)  */
/* -------------------------------------------------------------------------- */

export class PunchListUsuarioDto {
  @ApiProperty({ example: 5238 }) id!: number
  @ApiProperty({ example: 'Juan Pablo Puello Barrios' }) nombre!: string
  @ApiPropertyOptional({ nullable: true }) thumbnailUuid!: string | null
}

export class PunchListRolDptoDto {
  @ApiPropertyOptional({ nullable: true }) role!: string | null
  @ApiPropertyOptional({ nullable: true }) department!: string | null
}

export class PunchListDealerDto {
  @ApiProperty({ example: 639 }) id!: number
  @ApiProperty({ example: 'Lorenzo Nissan Ft. Lauderdale' }) razonSocial!: string
}

export class PunchListPaymentTypeDto {
  @ApiProperty({ example: 4 }) id!: number
  @ApiProperty({ example: 'Daily Rate' }) name!: string
}

export class PunchListFixedByDto {
  @ApiProperty({ example: 123 }) id!: number
  @ApiProperty({ example: 'Supervisor' }) nombre!: string
}

export class PunchListBadPunchDto {
  @ApiProperty({ example: 'Clock out is not set' }) res!: string
}

/**
 * Un evento del registro de correcciones (`TTK_PUNCH_ERROR_FIX`).
 *
 * La metadata legacy `fixedAt/fixedBy/fixedErrorSnapshot` es una marca POR PONCHADA
 * que sólo se setea cuando la ponchada queda sin ningún error, y se limpia al
 * volver a romperse: es nula justamente en los dos casos que interesan —ponchada
 * eliminada y ponchada vuelta a romper—. Estos eventos no.
 */
export class PunchListFixDto {
  @ApiProperty({ example: 1, description: '1 sin salida, 2 sin descanso, 3 turno 20h+' })
  errorType!: number

  /**
   * Fecha del ponche congelada al corregir. Va incluida a propósito: es lo que hace
   * visible, en la propia fila, una divergencia con `punchInGmt0`.
   */
  @ApiProperty({ example: '2026-05-01' }) punchDate!: string

  @ApiProperty({ example: '2026-08-27 18:16:53' }) fixedAt!: string

  @ApiPropertyOptional({ nullable: true, example: 'Ana Pérez' })
  fixedByName!: string | null
}

export class PunchListRowDto {
  @ApiProperty({ example: 910611 }) id!: number

  @ApiPropertyOptional({ nullable: true, example: '2026-07-30T12:08:13.000Z' })
  punchInGmt0!: string | null
  @ApiPropertyOptional({ nullable: true }) punchOutGmt0!: string | null
  @ApiPropertyOptional({ nullable: true }) breakStartGmt0!: string | null
  @ApiPropertyOptional({ nullable: true }) breakEndGmt0!: string | null

  @ApiPropertyOptional({ nullable: true, example: '08:00' }) timeWork!: string | null
  @ApiPropertyOptional({ nullable: true, example: '00:30' }) timeBreak!: string | null
  @ApiPropertyOptional({ nullable: true, example: 8 }) numberWork!: number | null
  @ApiPropertyOptional({ nullable: true, example: 0.5 }) numberBrake!: number | null

  @ApiProperty({ example: 1 }) estado!: number
  @ApiProperty({ example: 0, description: '1 si la ponchada tiene log de cambios' }) hasLog!: number
  @ApiProperty({ example: 0, description: '1 si fue creada manualmente' }) manualCreate!: number

  @ApiPropertyOptional({ nullable: true }) fixedAt!: string | null
  @ApiPropertyOptional({ type: PunchListFixedByDto, nullable: true })
  fixedBy!: PunchListFixedByDto | null
  @ApiPropertyOptional({ nullable: true }) fixedErrorSnapshot!: string | null

  /**
   * Eventos de corrección de ESTA ponchada dentro del rango y de los tipos tildados,
   * ordenados por `fixedAt ASC, id ASC`.
   *
   * La grilla lista PONCHADAS y el card cuenta EVENTOS: una ponchada con dos
   * correcciones es una fila y dos eventos. Por eso viajan los dos.
   */
  @ApiPropertyOptional({ type: [PunchListFixDto] })
  fixes?: PunchListFixDto[]

  /**
   * Columnas AGREGADAS del export Individual, que es un solo stream con `mapRow`
   * síncrono: ahí no cabe la segunda consulta por página que llena `fixes[]`.
   * Sólo viajan en modo Corrected.
   */
  @ApiPropertyOptional({ nullable: true, example: [1, 2] })
  correctedTypes?: number[] | null
  @ApiPropertyOptional({ nullable: true, example: '2026-08-27 18:16:53' })
  lastCorrectedAt?: string | null

  @ApiPropertyOptional({ type: PunchListUsuarioDto, nullable: true })
  usuario!: PunchListUsuarioDto | null
  @ApiPropertyOptional({ type: PunchListRolDptoDto, nullable: true })
  rolDpto!: PunchListRolDptoDto | null
  @ApiPropertyOptional({ type: PunchListDealerDto, nullable: true })
  dealer!: PunchListDealerDto | null
  @ApiPropertyOptional({ type: PunchListBadPunchDto, nullable: true })
  badPunch!: PunchListBadPunchDto | null

  /**
   * Codigo de TTK_PUNCH_WITH_ERROR_V2 (1 sin salida, 2 sin descanso, 3 turno 20h+).
   * Sólo viaja cuando hay lista blanca parcial y el usuario es interno
   * (`includeErrorType`); con lista default la respuesta queda como siempre.
   */
  @ApiPropertyOptional({ nullable: true, example: 2 })
  errorType?: number | null
  @ApiPropertyOptional({ type: PunchListPaymentTypeDto, nullable: true })
  objPaymentType!: PunchListPaymentTypeDto | null

  @ApiPropertyOptional({ nullable: true, example: 120 }) hourlyRate!: number | null
  @ApiPropertyOptional({ nullable: true, example: 4 }) typePayment!: number | null

  /* Face / finger validation — los usa el diálogo de fotos */
  @ApiPropertyOptional({ nullable: true }) idPunchInLogValidation!: number | null
  @ApiPropertyOptional({ nullable: true }) idBreakStartLogValidation!: number | null
  @ApiPropertyOptional({ nullable: true }) idBreakEndLogValidation!: number | null
  @ApiPropertyOptional({ nullable: true }) idPunchOutLogValidation!: number | null
  @ApiPropertyOptional({ nullable: true }) idPunchInLogFingerValidation!: number | null
  @ApiPropertyOptional({ nullable: true }) idBreakStartLogFingerValidation!: number | null
  @ApiPropertyOptional({ nullable: true }) idBreakEndLogFingerValidation!: number | null
  @ApiPropertyOptional({ nullable: true }) idPunchOutLogFingerValidation!: number | null
}

export class PunchListResponseDto extends SrsCursorPagedResponseDto<PunchListRowDto> {
  @ApiProperty({ type: [PunchListRowDto] })
  declare results: PunchListRowDto[]

  @ApiPropertyOptional({ type: SrsCursorDto, nullable: true })
  declare nextCursor: SrsCursorDto | null
}
