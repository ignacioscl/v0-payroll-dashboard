import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, Matches } from 'class-validator'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

/** Posición del switch Pending/Corrected del Dashboard. */
export const DEALER_RANKING_STATUSES = ['pending', 'corrected'] as const
export type DealerRankingStatus = (typeof DEALER_RANKING_STATUSES)[number]

/**
 * Ranking de dealers del Dashboard: la tarjeta "Dealers with most errors" y su
 * modal "View all". `fechaDesde`, `fechaHasta` e `idDealer` vienen de la base.
 *
 * Va SIN `@IsValidPunchDateRange`, a propósito: el resumen PHP al que reemplaza no
 * tiene tope de fechas, y ponerlo rompería la tarjeta para períodos de más de un
 * año que hoy funcionan.
 */
export class PunchDealerRankingQueryDto extends SrsKpiQueryDto {
  @ApiPropertyOptional({
    description: 'Lista blanca de tipos de error (1,2,3). Ausente = 1,2,3.',
    example: '1,3',
  })
  @IsOptional()
  @Matches(/^[123](,[123]){0,2}$/, {
    message: 'errorTypes must be a comma-separated list of 1, 2 and/or 3.',
  })
  errorTypes?: string

  @ApiPropertyOptional({ description: 'Nombre o parte del nombre del empleado' })
  @IsOptional()
  @IsString()
  search?: string
}

/**
 * Body del `prepare` del export: los mismos filtros (y las mismas validaciones)
 * con que se pidió el ranking, más la posición del switch al momento del click.
 */
export class PunchDealerRankingExportPrepareDto extends PunchDealerRankingQueryDto {
  @ApiProperty({ enum: DEALER_RANKING_STATUSES, example: 'pending' })
  @IsIn(DEALER_RANKING_STATUSES as unknown as string[])
  status!: DealerRankingStatus
}

export class PunchDealerRankingByTypeDto {
  @ApiProperty({ example: 1 }) clockOutMissing!: number
  @ApiProperty({ example: 403 }) breakMissing!: number
  @ApiProperty({ example: 0 }) shift20hPlus!: number
}

export class PunchDealerRankingRowDto {
  @ApiProperty({ example: 85 })
  idDealer!: number

  @ApiProperty({
    example: 'AutoNation Mercedes-Benz of Coconut Creek',
    description: 'GET_DEALER_NAME_BY_PROVIDER: el nombre que le puso el provider',
  })
  dealerName!: string

  @ApiProperty({
    example: 404,
    description: 'Pending: ponchadas con error hoy. Corrected: eventos de corrección.',
  })
  total!: number

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description:
      'Sólo Corrected: ponchadas distintas corregidas (la vista Grouped cuenta ponchadas, ' +
      'no eventos). Null en Pending.',
  })
  punches!: number | null

  @ApiProperty({ type: PunchDealerRankingByTypeDto })
  byType!: PunchDealerRankingByTypeDto
}

/**
 * Los dos rankings en la misma respuesta, igual que el resumen PHP: el switch es
 * del cliente y moverlo no vuelve a pedir nada.
 */
export class PunchDealerRankingResponseDto {
  @ApiProperty({ type: [PunchDealerRankingRowDto] })
  pending!: PunchDealerRankingRowDto[]

  @ApiProperty({ type: [PunchDealerRankingRowDto] })
  corrected!: PunchDealerRankingRowDto[]
}

/**
 * Fila de la hoja Employees del export: una por empleado y dealer. No viaja por la
 * API. En Corrected el empleado es el DUEÑO de la ponchada, no quien la corrigió (D3).
 */
export type PunchDealerRankingEmployeeRow = PunchDealerRankingRowDto & {
  idEmployee: number
  employeeName: string
}
