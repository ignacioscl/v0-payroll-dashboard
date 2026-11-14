import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsDateString, IsDefined, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

export class BillingKpiQueryDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  fechaHasta!: string
}

export class BillingKpiDto {
  @ApiProperty({ example: 254700 }) invoicedValue!: number
  @ApiProperty({ example: 312 }) statementsIssued!: number
  @ApiProperty({ example: 816 }) avgInvoiceValue!: number
  @ApiProperty({ example: 391 }) unbilledWos!: number
  /** Unbilled service lines only (not the whole WO). */
  @ApiProperty({ example: 20460 }) unbilledValue!: number
  @ApiProperty({ example: 7605 }) unbilledServices!: number
  /** Gross value of the unbilled WOs including already-invoiced services. */
  @ApiProperty({ example: 75343.5 }) unbilledWoTotalValue!: number
  @ApiProperty({ example: 4.6 }) avgDoneToInvoicedDays!: number
  @ApiProperty({ example: 93.6 }) sentPct!: number
  @ApiProperty({ example: 20 }) unsentStatements!: number
  /** WO statements (types 1–4) overlapping the header range but not fully contained in it. */
  @ApiProperty({ example: 7 }) partialOverlapWoStatements!: number
  /** WO service lines on statements; filtered by WO done date (General Report). */
  @ApiProperty({ example: 182400 }) woInvoicedValue!: number
  @ApiProperty({ example: 120000 }) woInvoicedInRangeValue!: number
  @ApiProperty({ example: 62400 }) woInvoicedOutsideRangeValue!: number
  /** TTK punch amounts on statements; filtered by punch_in (General Report). */
  @ApiProperty({ example: 42100 }) ttkInvoicedValue!: number
  @ApiProperty({ example: 28000 }) ttkInvoicedInRangeValue!: number
  @ApiProperty({ example: 14100 }) ttkInvoicedOutsideRangeValue!: number
  /** Generic statement lines prorated to the header range (General Report). */
  @ApiProperty({ example: 30200 }) genericInvoicedValue!: number
  @ApiProperty({ example: 5000 }) genericInvoicedInRangeValue!: number
  @ApiProperty({ example: 25200 }) genericInvoicedOutsideRangeValue!: number
}

/** Aging de WOs Done sin facturar (por bucket de antigüedad). */
export class UnbilledAgingBucketDto {
  @ApiProperty({ example: '0-7 days' }) bucket!: string
  @ApiProperty({ example: 214 }) wos!: number
  @ApiProperty({ example: 11180 }) value!: number
}

/** Punto de la serie semanal del gráfico Invoiced by Week. */
export class BillingWeekRowDto {
  @ApiProperty({ example: '2026-06-02', description: 'Monday of the ISO week (YYYY-MM-DD)' })
  weekStart!: string

  @ApiProperty({ example: 61500 }) invoicedValue!: number
}

/** WOs Done sin facturar agrupadas por dealer (tabla Unbilled Work by Dealer). */
export class UnbilledDealerRowDto {
  @ApiProperty({ example: 42 }) dealerId!: number
  @ApiProperty({ example: 'Ford Hollywood' }) dealer!: string
  @ApiProperty({ example: 84 }) wos!: number
  @ApiProperty({ example: 120 }) services!: number
  @ApiProperty({ example: 4690 }) value!: number
  @ApiProperty({ example: 38, description: 'Días desde el Done más antiguo sin facturar' })
  oldestDays!: number
}

/** Facturado / cobrado / impago para facturas cuyo período cae en el rango (cohorte única). */
export class BillingPeriodCollectionKpiDto {
  @ApiProperty({ example: 254700 }) invoicedValue!: number
  @ApiProperty({ example: 312 }) statementsIssued!: number
  @ApiProperty({ example: 816 }) avgInvoiceValue!: number
  @ApiProperty({ example: 198300 }) collectedValue!: number
  @ApiProperty({ example: 77.9 }) collectionRatePct!: number
  @ApiProperty({ example: 56400 }) unpaidInPeriodValue!: number
  @ApiProperty({ example: 48 }) unpaidInPeriodStatements!: number
  /**
   * Las mismas líneas que las tres cards facturadas de Income: WO Invoiced (todo el trabajo de WO
   * del rango, también de invoices que cruzan el rango), TTK y Generic Invoiced (solo invoices con el
   * período entero en el rango). Valoradas como Income: WO y generic sin tax ni descuento, TTK tipo 5
   * con descuento. `incomeCollectedValue` es el número grande de Collected.
   */
  @ApiProperty({ example: 228000 }) incomeInvoicedValue!: number
  @ApiProperty({ example: 178500 }) incomeCollectedValue!: number
  /**
   * `incomeCollectedValue` abierto por tipo, sin redondear a dólares. La pantalla redondea cada
   * tarjeta facturada por separado; lo cobrado se redondea igual (por tipo) para que Unpaid no dé
   * −$1 cuando todo está cobrado.
   */
  @ApiProperty({ example: 90000 }) incomeCollectedWoValue!: number
  @ApiProperty({ example: 60000 }) incomeCollectedTtkValue!: number
  @ApiProperty({ example: 28500 }) incomeCollectedGenericValue!: number
  /** Las mismas líneas, con tax y descuento (plata real): los subtítulos de Collected y Unpaid. */
  @ApiProperty({ example: 230000 }) incomeInvoicedRealValue!: number
  @ApiProperty({ example: 180000 }) incomeCollectedRealValue!: number
  /** incomeCollectedValue / incomeInvoicedValue. */
  @ApiProperty({ example: 78.3 }) incomeCollectionRatePct!: number
}

/** One dealer of one year of Income by Dealer: the same parts as the Income cards of Billing. */
export class IncomeByDealerRowDto {
  @ApiProperty({ example: 192 }) dealerId!: number
  @ApiProperty({ example: 'Lamborghini Broward' }) dealer!: string
  @ApiProperty({ example: 0, description: 'WO Invoiced (discount, no tax)' }) wo!: number
  @ApiProperty({ example: 0, description: 'TTK Invoiced (discount, no tax)' }) ttk!: number
  @ApiProperty({ example: 115637.24, description: 'Generic Invoiced, prorated by day (discount, no tax)' })
  generic!: number
  @ApiProperty({ example: 0, description: 'WO Not Invoiced (list price)' }) notInvoiced!: number
  @ApiProperty({ example: 115637.24, description: 'wo + ttk + generic + notInvoiced' }) income!: number
}

/** One line of the Closing Report (groupBy 'closingLine'), as Monthly Closing shows it. */
export class ClosingLineDto {
  @ApiProperty({ example: 192 }) dealerId!: number
  @ApiProperty({ enum: ['wo', 'woUnbilled', 'ttk', 'genericFree', 'genericPunch'] })
  kind!: 'wo' | 'woUnbilled' | 'ttk' | 'genericFree' | 'genericPunch'
  @ApiProperty({ example: 'DG1632', description: 'WO or invoice number' }) nro!: string
  @ApiProperty({ example: '2026-08-14' }) dateFrom!: string
  @ApiProperty({ example: '2026-08-14' }) dateTo!: string
  @ApiProperty({ example: 'Used', description: 'WO department; «TTK» or «Generic» for the others' })
  department!: string
  @ApiProperty({ example: 'Window Tint - 2 Doors', description: 'Service; the employee in TTK and generic punches' })
  service!: string
  @ApiProperty({ example: 1 }) qty!: number
  @ApiProperty({ example: 75, description: 'Discount included, no tax; not rounded' }) amount!: number
  @ApiPropertyOptional({ example: 812345, description: 'Car of the WO (wo / woUnbilled), only with withCar' })
  idCar?: number
}

/** Income by Dealer by service (plans/plan-income-by-dealer-por-servicio T2). */
export class IncomeByDealerServicesQueryDto extends SrsKpiQueryDto {
  @ApiPropertyOptional({
    description: 'Also return the list of vehicles (VIN, make, model, year) of each dealer. Default false.',
    example: 'false',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || value === 'true' || value === '1' || value === 1) return true
    if (value === false || value === 'false' || value === '0' || value === 0) return false
    return undefined
  })
  withVehicles?: boolean
}

export class IncomeWoServiceDto {
  @ApiProperty({ example: 'NewCarDetail' }) service!: string
  @ApiProperty({ example: 120, description: 'Sum of the qty of the services' }) qty!: number
  @ApiProperty({ example: 98, description: 'Different vehicles (VIN)' }) vehicles!: number
  @ApiProperty({ example: 15400 }) income!: number
}

export class IncomeWoSectionDto {
  @ApiProperty({ example: 6043 }) qty!: number
  @ApiProperty({ example: 4712, description: 'Different vehicles (VIN) of the dealer, not the sum of the services' })
  vehicles!: number
  @ApiProperty({ example: 484770 }) income!: number
  @ApiProperty({ type: [IncomeWoServiceDto], description: 'Income desc, then name' }) services!: IncomeWoServiceDto[]
}

export class IncomeGenericLineDto {
  @ApiProperty({ example: 'Detail hours' }) description!: string
  @ApiPropertyOptional({ example: 1.5, description: 'Qty written on the invoice; null for punches billed in a generic' })
  qty!: number | null
  @ApiProperty({ example: 300 }) income!: number
}

export class IncomeGenericSectionDto {
  @ApiProperty({ example: 300 }) income!: number
  @ApiProperty({ type: [IncomeGenericLineDto] }) lines!: IncomeGenericLineDto[]
}

export class IncomeTtkLineDto {
  @ApiProperty({ example: 'John Doe' }) employee!: string
  @ApiProperty({ example: 1200 }) income!: number
}

/** One TTK invoice of a dealer, with its employees (plans/plan-income-by-dealer-ttk-y-autos T2). */
export class IncomeTtkInvoiceDto {
  @ApiProperty({ example: 'MBP22166' }) nro!: string
  @ApiProperty({ example: '2026-10-05' }) dateFrom!: string
  @ApiProperty({ example: '2026-10-11' }) dateTo!: string
  @ApiProperty({ example: 5591.7, description: 'Its punches inside the range, as the employees add up' }) income!: number
  @ApiProperty({ type: [IncomeTtkLineDto], description: 'Income desc, then name' }) employees!: IncomeTtkLineDto[]
}

export class IncomeTtkSectionDto {
  @ApiProperty({ example: 1200 }) income!: number
  @ApiProperty({ type: [IncomeTtkLineDto], description: 'By employee; the Export reads this' }) lines!: IncomeTtkLineDto[]
  @ApiProperty({ type: [IncomeTtkInvoiceDto], description: 'By invoice: period, oldest first, then number' })
  invoices!: IncomeTtkInvoiceDto[]
}

export class IncomeServicesDealerDto {
  @ApiProperty({ example: 196 }) dealerId!: number
  @ApiProperty({ example: 'BMW of Pembroke Pines' }) dealer!: string
  @ApiProperty({ example: 484770, description: 'Same Income as the row of Income by Dealer, to the cent' })
  income!: number
  @ApiProperty({ type: IncomeWoSectionDto }) wo!: IncomeWoSectionDto
  @ApiProperty({ type: IncomeGenericSectionDto }) generic!: IncomeGenericSectionDto
  @ApiProperty({ type: IncomeTtkSectionDto }) ttk!: IncomeTtkSectionDto
}

export class IncomeVehicleServiceDto {
  @ApiProperty({ example: 'Cilajet' }) service!: string
  @ApiProperty({ example: 2 }) qty!: number
}

export class IncomeVehicleRowDto {
  @ApiProperty({ example: 196 }) dealerId!: number
  @ApiProperty({ example: 'BMW of Pembroke Pines' }) dealer!: string
  @ApiProperty({ example: 'WBA00000000000000' }) vin!: string
  @ApiProperty({ example: 'BMW' }) make!: string
  @ApiProperty({ example: 'X5' }) model!: string
  @ApiPropertyOptional({ example: 2025 }) carYear!: number | null
  @ApiProperty({ type: [IncomeVehicleServiceDto] }) services!: IncomeVehicleServiceDto[]
  @ApiProperty({ example: 3 }) qty!: number
  @ApiProperty({ example: 350 }) income!: number
}

export class IncomeServicesYearDto {
  @ApiProperty({ example: 2025 }) year!: number
  @ApiProperty({ example: '2025-01-01' }) fechaDesde!: string
  @ApiProperty({ example: '2025-12-31' }) fechaHasta!: string
  @ApiProperty({ example: false }) partial!: boolean
  @ApiProperty({ example: 6043 }) woQty!: number
  @ApiProperty({ example: 4712, description: 'Different vehicles (VIN) of the year, across the dealers' })
  vehicles!: number
  @ApiProperty({ example: 484770 }) woIncome!: number
  @ApiProperty({ example: 0, description: 'Generic + TTK' }) otherIncome!: number
  @ApiProperty({ example: 484770 }) income!: number
  @ApiProperty({ type: [IncomeServicesDealerDto], description: 'Income desc, then name' })
  dealers!: IncomeServicesDealerDto[]
  @ApiPropertyOptional({ type: [IncomeVehicleRowDto], description: 'Only with withVehicles' })
  vehiclesList?: IncomeVehicleRowDto[]
}

export class IncomeServicesByDealerDto {
  @ApiProperty({ type: [IncomeServicesYearDto] }) years!: IncomeServicesYearDto[]
}

/** The vehicles of one service of one dealer in one year (plans/plan-income-by-dealer-ttk-y-autos T3). */
export class IncomeServiceVehiclesQueryDto extends SrsKpiQueryDto {
  @ApiProperty({ example: 'Full Detail', description: 'Name of the service, as the row shows it (may be empty)' })
  @IsDefined()
  @IsString()
  @MaxLength(255)
  service!: string
}

export class IncomeServiceVehicleDto {
  @ApiProperty({ example: 'WBA00000000000000' }) vin!: string
  @ApiProperty({ example: 'BMW' }) make!: string
  @ApiProperty({ example: 'X5' }) model!: string
  @ApiPropertyOptional({ example: 2025 }) carYear!: number | null
  @ApiProperty({ example: ['MBP22106'], description: 'WO numbers of the vehicle with this service' }) wos!: string[]
  @ApiProperty({ example: 1 }) qty!: number
  @ApiProperty({ example: 99 }) income!: number
}

export class IncomeServiceVehiclesBodyDto {
  @ApiProperty({ example: 'Full Detail' }) service!: string
  @ApiProperty({ example: 76 }) qty!: number
  @ApiProperty({ example: 76, description: 'Rows = different VIN = Vehicles of the row' }) vehicles!: number
  @ApiProperty({ example: 7524 }) income!: number
  @ApiProperty({ type: [IncomeServiceVehicleDto], description: 'Income desc, then VIN' }) rows!: IncomeServiceVehicleDto[]
}

export class IncomeServiceVehiclesDto extends IncomeServiceVehiclesBodyDto {
  @ApiProperty({ example: 2026 }) year!: number
  @ApiProperty({ example: '2026-10-01' }) fechaDesde!: string
  @ApiProperty({ example: '2026-10-31' }) fechaHasta!: string
}

/** One calendar year of the header range, cropped to it. */
export class IncomeByDealerYearDto {
  @ApiProperty({ example: 2024 }) year!: number
  @ApiProperty({ example: '2024-01-01' }) fechaDesde!: string
  @ApiProperty({ example: '2024-12-31' }) fechaHasta!: string
  @ApiProperty({ example: false, description: 'True when the range covers only part of the year' })
  partial!: boolean
  @ApiProperty({ example: 7250314.02, description: 'Sum of the dealers of the year' }) total!: number
  @ApiProperty({ type: [IncomeByDealerRowDto], description: 'Income desc' })
  dealers!: IncomeByDealerRowDto[]
}

export class IncomeByDealerDto {
  @ApiProperty({ type: [IncomeByDealerYearDto] }) years!: IncomeByDealerYearDto[]
  @ApiProperty({ example: 22505068.07, description: 'Sum of every year' }) grandTotal!: number
}

/**
 * «Include removed dealers»: is there something to show? Dates optional (both or none; none = whole
 * history, the «Owed, all dates» card). The company is always the session one.
 */
export class RemovedDealersAvailableQueryDto {
  @ApiPropertyOptional({ description: 'Fecha desde (YYYY-MM-DD)', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  fechaDesde?: string

  @ApiPropertyOptional({ description: 'Fecha hasta (YYYY-MM-DD)', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  fechaHasta?: string

  @ApiPropertyOptional({
    description: 'Same «Filter by completion date» of the screen: WO by Done date (true) vs created date (false).',
    example: 'false',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || value === 'true' || value === '1' || value === 1) return true
    if (value === false || value === 'false' || value === '0' || value === 0) return false
    return undefined
  })
  filterDateDone?: boolean
}

export class RemovedDealerDto {
  @ApiProperty({ example: 812 })
  dealerId!: number

  @ApiProperty({ example: 'Lamborghini Broward' })
  dealer!: string
}

export class RemovedDealersAvailableDto {
  @ApiProperty({
    example: false,
    description:
      'True when the company has a dealer removed with «Remove» (DEALER_REL_REMOVED) and not added again with money in the dates. Always false for users with assigned dealers.',
  })
  available!: boolean

  @ApiProperty({
    type: [RemovedDealerDto],
    description:
      'Every removed dealer of the company (with or without money in the dates), by name. The screens mark their rows as «Removed». Empty when available is false.',
  })
  dealers!: RemovedDealerDto[]
}
