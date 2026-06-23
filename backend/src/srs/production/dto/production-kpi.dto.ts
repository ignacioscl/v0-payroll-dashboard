import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty } from 'class-validator'

/** Rango del período sobre el que se calculan los KPIs. */
export class ProductionKpiQueryDto {
  @ApiProperty({ description: 'Fecha desde (YYYY-MM-DD)', example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ description: 'Fecha hasta (YYYY-MM-DD)', example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  fechaHasta!: string
}

/** Resultado de los KPIs de producción (espeja ProductionKpis del front). */
export class ProductionKpiDto {
  @ApiProperty({ example: 4929 }) woCompleted!: number
  @ApiProperty({ example: 258280 }) productionValue!: number
  @ApiProperty({ example: 26.4 }) avgCycleHours!: number
  @ApiProperty({ example: 91.2 }) onTimePct!: number
  @ApiProperty({ example: 3.4 }) inspectionFailPct!: number
}

/** Una porción del pipeline de WOs abiertas por estado. */
export class WoStatusSliceDto {
  @ApiProperty({ example: 'In Process' }) status!: string
  @ApiProperty({ example: 174 }) count!: number
}

/** Producción por dealer (tabla). */
export class DealerProductionRowDto {
  @ApiProperty({ example: 'Toyota Miami' }) dealer!: string
  @ApiProperty({ example: 2218 }) wos!: number
  @ApiProperty({ example: 118400 }) value!: number
}
