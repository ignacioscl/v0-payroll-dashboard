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
  @ApiProperty({ example: 'Hourly' }) type!: string
  @ApiProperty({ example: 30960 }) value!: number
}

/** Una fila del desglose de Total Payroll (tab Payroll Spend). */
export class PayrollSpendTypeRowDto {
  /** GENERIC_DATA.id del tipo de pago (en `overtime`, el tipo Hourly). */
  @ApiProperty({ example: 1 }) id!: number
  /** GENERIC_DATA.name tal cual. */
  @ApiProperty({ example: 'Hourly' }) name!: string
  @ApiProperty({ enum: ['ponchada', 'prorrateo', 'overtime'] }) concepto!: 'ponchada' | 'prorrateo' | 'overtime'
  @ApiProperty({ example: 155156.52 }) amount!: number
  /** Ponchadas (montos fijos) o empleados (salario / comisión). */
  @ApiProperty({ example: 2903 }) qty!: number
  @ApiProperty({ example: 10342.77 }) hours!: number
  /** Qué va en la columna «Qty / Hours»: horas, cantidad de ponchadas, empleados o nada (piecework). */
  @ApiProperty({ enum: ['hours', 'count', 'employees', 'none'] }) measure!: 'hours' | 'count' | 'employees' | 'none'
  /** Filas que el front titula con texto propio: overtime automático (> 40 h) y el tipo manual «Overtime». */
  @ApiProperty({ enum: ['overtime_auto', 'overtime_manual', 'hourly', 'other'] }) kind!:
    | 'overtime_auto'
    | 'overtime_manual'
    | 'hourly'
    | 'other'
}

export class PayrollSpendWithoutDealerDto {
  @ApiProperty({ example: 5250 }) amount!: number
  @ApiProperty({ example: 3 }) employees!: number
  @ApiProperty({ type: [PayrollSpendTypeRowDto] }) byType!: PayrollSpendTypeRowDto[]
}

/** `GET /api/srs/kpis/payroll/spend`: lo que muestra la tab Payroll Spend (snapshot diario). */
export class PayrollSpendDto {
  /** 1 semanal, 2 quincenal, 3 mensual; null = la empresa no tiene período de pago configurado. */
  @ApiProperty({ nullable: true, example: 2 }) paymentMethod!: number | null
  @ApiProperty() periodo!: { desde: string; hasta: string }
  /** Primer día con datos en el snapshot (YYYY-MM-DD). */
  @ApiProperty({ example: '2026-01-01' }) dataFrom!: string
  @ApiProperty({ example: 656047.65 }) totalPayroll!: number
  @ApiProperty({ example: 0 }) payrollTaxes!: number
  @ApiProperty() overtime!: { amount: number; hours: number; employeesOver40: number }
  @ApiProperty({ example: 17385.98 }) piecework!: number
  @ApiProperty({ type: [PayrollSpendTypeRowDto] }) byType!: PayrollSpendTypeRowDto[]
  @ApiProperty({ example: 812 }) employees!: number
  /** Salarios sin dealer; null para usuarios restringidos a dealers. */
  @ApiProperty({ type: PayrollSpendWithoutDealerDto, nullable: true }) withoutDealer!: PayrollSpendWithoutDealerDto | null
  /** El pedido incluye todos los dealers activos: lo sin dealer ya está sumado en el total. */
  @ApiProperty() allDealers!: boolean
  /** Usuario restringido a ciertos dealers (no ve lo de otros dealers ni lo sin dealer). */
  @ApiProperty() dealerRestricted!: boolean
  /** Última corrida que escribió (UTC, 'YYYY-MM-DD HH:MM:SS'); null si no hay snapshot. */
  @ApiProperty({ nullable: true }) calculatedAt!: string | null
}
