import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty } from 'class-validator'

export class PayrollKpiQueryDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  fechaHasta!: string
}

export class PayrollKpiDto {
  @ApiProperty({ example: 59540 }) totalPayroll!: number
  @ApiProperty({ example: 8490 }) overtimeCost!: number
  @ApiProperty({ example: 14.3 }) overtimePct!: number
  @ApiProperty({ example: 12.08 }) avgCostPerWo!: number
  @ApiProperty({ example: 23.0 }) laborCostPct!: number
  @ApiProperty({ example: 25 }) activeEmployees!: number
  @ApiProperty({ example: 14.2 }) avgHourlyRate!: number
}

/** Payroll por tipo de pago (torta). */
export class PayrollByTypeRowDto {
  @ApiProperty({ example: 'hourly' }) type!: string
  @ApiProperty({ example: 30960 }) value!: number
}
