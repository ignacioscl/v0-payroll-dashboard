import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'

/**
 * Alcance del reporte (T1 de plans/plan-reporte-tint/PLAN.md): 'all' es el Monthly Closing; 'tint' el
 * Window Tint Closing (solo las líneas de tint, los tinteros y la categoría «Window Tint Film»).
 * PAREJA de frontend/lib/reports/monthly-closing-month.ts (`CLOSING_SCOPES`).
 */
export const CLOSING_SCOPES = ['all', 'tint'] as const
export type ClosingScope = (typeof CLOSING_SCOPES)[number]

const toBool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return undefined
}

export class MonthlyClosingQueryDto {
  @ApiProperty({ example: '2026-09', description: 'YYYY-MM; validated in the service (Choose a valid month.)' })
  @IsString()
  @IsNotEmpty()
  month!: string

  @ApiProperty({ example: '12,34', description: 'Dealer ids of the combo (comma-separated)' })
  @IsString()
  @IsNotEmpty()
  idDealer!: string

  @ApiPropertyOptional({ example: 'false' })
  @IsOptional()
  @Transform(toBool)
  includeRemovedDealers?: boolean

  @ApiPropertyOptional({ enum: CLOSING_SCOPES, default: 'all' })
  @IsOptional()
  @IsIn(CLOSING_SCOPES as unknown as string[], { message: 'scope must be all or tint' })
  scope?: ClosingScope
}

export class ClosingPeriodDto {
  @ApiProperty({ example: '2026-08-31' }) desde!: string
  @ApiProperty({ example: '2026-09-15' }) hasta!: string
  @ApiProperty({ enum: ['complete', 'partial', 'notCalculated'] }) status!: 'complete' | 'partial' | 'notCalculated'
  @ApiPropertyOptional({ example: '2026-10-27', description: 'Last calculated day when partial' })
  calculatedThrough!: string | null
}

export class ClosingRowDto {
  @ApiProperty({ example: 744, description: '0 = Without dealer' }) dealerId!: number
  @ApiProperty({ example: 'AutoNation Nissan Miami' }) dealer!: string
  @ApiProperty() removed!: boolean
  @ApiPropertyOptional({ description: 'Window Tint Closing only: quantity of the tint lines' }) vehicles!: number | null
  @ApiProperty() income!: number
  @ApiProperty() payroll!: number
  @ApiProperty() expenses!: number
  @ApiProperty() profit!: number
  @ApiPropertyOptional({ description: 'Profit ÷ Income, one decimal; null with Income $0' }) pct!: number | null
  @ApiPropertyOptional({ description: 'Monthly Closing only: Accident expenses' }) accident!: number | null
  @ApiPropertyOptional({
    description: 'Window Tint Closing only: the Income has services without «tint» in their name (row in red); null in Monthly Closing',
  })
  nonTint!: boolean | null
}

export class MonthlyClosingDto {
  @ApiProperty({ enum: CLOSING_SCOPES }) scope!: ClosingScope
  @ApiProperty({ example: '2026-09' }) month!: string
  @ApiProperty({ type: [ClosingRowDto] }) rows!: ClosingRowDto[]
  @ApiProperty({ type: ClosingRowDto }) total!: ClosingRowDto
  @ApiPropertyOptional({ type: ClosingRowDto, description: 'Admin General / Admin Company only' })
  withoutDealer!: ClosingRowDto | null
  @ApiProperty({ type: [ClosingPeriodDto] }) periods!: ClosingPeriodDto[]
}

export class ClosingIncomeLineDto {
  @ApiProperty() nro!: string
  @ApiProperty() dateFrom!: string
  @ApiProperty() dateTo!: string
  @ApiProperty() department!: string
  @ApiProperty() service!: string
  @ApiProperty() qty!: number
  @ApiProperty() total!: number
  @ApiPropertyOptional({ description: 'Window Tint Closing only: «tint» in the service name; null in Monthly Closing' })
  tint!: boolean | null
  @ApiPropertyOptional({
    description: 'Window Tint Closing only: row in red (no «tint» in the name and amount other than $0); null in Monthly Closing',
  })
  warn!: boolean | null
}

/** By service del modal: las filas del dealer de la solapa «By service» del Excel (groupByService). */
export class ClosingServiceRowDto {
  @ApiProperty() department!: string
  @ApiProperty() service!: string
  @ApiProperty({ description: 'Sum of the Qty of the service' }) vehicles!: number
  @ApiProperty() amount!: number
  @ApiProperty({ description: '«tint» in the service name' }) tint!: boolean
  @ApiProperty({ description: 'Row in red: no «tint» in the name and amount other than $0' }) warn!: boolean
}

export class ClosingPayrollLineDto {
  @ApiProperty() periodDesde!: string
  @ApiProperty() periodHasta!: string
  @ApiProperty() employee!: string
  @ApiProperty() position!: string
  @ApiProperty() amount!: number
}

export class ClosingExpenseLineDto {
  @ApiProperty() date!: string
  @ApiProperty() vendor!: string
  @ApiProperty() category!: string
  @ApiProperty() amount!: number
  @ApiProperty() notes!: string
}

export class MonthlyClosingDealerDto {
  @ApiProperty() dealerId!: number
  @ApiProperty() dealer!: string
  @ApiProperty({ type: [ClosingIncomeLineDto] }) income!: ClosingIncomeLineDto[]
  @ApiPropertyOptional({ type: [ClosingServiceRowDto], description: 'Window Tint Closing only; null in Monthly Closing' })
  byService!: ClosingServiceRowDto[] | null
  @ApiProperty({ type: [ClosingPayrollLineDto] }) payroll!: ClosingPayrollLineDto[]
  @ApiProperty({ type: [ClosingExpenseLineDto] }) expenses!: ClosingExpenseLineDto[]
}
