import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty } from 'class-validator'

export class PunchKpiQueryDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  fechaHasta!: string
}

export class PunchKpiDto {
  @ApiProperty({ example: 998 }) totalPunches!: number
  @ApiProperty({ example: 6.1 }) errorRatePct!: number
  @ApiProperty({ example: 22 }) missingPunchOut!: number
  @ApiProperty({ example: 13 }) missingBreakEnd!: number
  @ApiProperty({ example: 17 }) manualPunches!: number
  @ApiProperty({ example: 38 }) adminCorrections!: number
  @ApiProperty({ example: 2.3 }) avgCorrectionDelayDays!: number
  @ApiProperty({ example: 9 }) deletedPunches!: number
}

/** Empleado reincidente (tabla de offenders). */
export class PunchOffenderRowDto {
  @ApiProperty({ example: 'Christopher Wilson' }) employee!: string
  @ApiProperty({ example: 'Chevrolet Boca Raton' }) dealer!: string
  @ApiProperty({ example: 9 }) missingOut!: number
  @ApiProperty({ example: 6 }) manual!: number
  @ApiProperty({ example: 11 }) corrected!: number
  @ApiProperty({ example: 26 }) total!: number
}
