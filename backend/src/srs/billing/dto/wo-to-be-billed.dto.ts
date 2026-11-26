import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

import { IsCalendarDate } from '../../shared/dto/is-calendar-date'

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T4). **Una sola clase de filtro** para la lista, el total, la cuenta
 * previa y generar: el `ValidationPipe` global descarta en silencio un campo que no esté acá (`app.setup.ts`), y si la
 * pantalla mandara un filtro con otro nombre se facturaría más de lo que se ve. Lo controla el spec de contrato.
 */

/** Status de la solapa: In Transit, Arrived, In Process, Completed, Pause. */
export const WO_TO_BE_BILLED_STATUSES = [15, 5, 6, 7, 16] as const
export const WORKFLOW_COMPLETED = 7
export const WORKFLOW_IN_TRANSIT = 15

/** Invoice Type: 2 «Invoice by Services», 3 «Invoice Multi-Services», 4 «Invoice by Selected Services». */
export const INVOICE_TYPE_BY_SERVICES = 2
export const INVOICE_TYPE_MULTI_SERVICES = 3
export const INVOICE_TYPE_SELECTED_SERVICES = 4
export const WO_INVOICE_TYPES = [
  INVOICE_TYPE_BY_SERVICES,
  INVOICE_TYPE_MULTI_SERVICES,
  INVOICE_TYPE_SELECTED_SERVICES,
] as const
export type WoInvoiceType = (typeof WO_INVOICE_TYPES)[number]

export const WO_TO_BE_BILLED_DEFAULT_PAGE_SIZE = 25
export const WO_TO_BE_BILLED_MAX_PAGE_SIZE = 200
/** Tope de WO tildadas en un pedido (la lista se trae de a 25; el dealer con más pendientes tiene ~1.000). */
export const WO_IDS_MAX = 5000
export const WO_SEARCH_MAX = 64
export const STOCK_SEARCH_MAX = 32
/** Ancho de `INVOICE.ro` / `INVOICE.po` (`DUMP:1323`). */
export const RO_PO_MAX = 16

/** Lista de enteros positivos desde un arreglo (cuerpo JSON) o un texto `1,2,3` (query). Otra cosa queda tal cual. */
function toIntList({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return undefined
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null
  if (!parts) return value
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter((part) => part !== '')
    .map((part) => Number(part))
}

function toOptionalNumber({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : value
}

function toFlag({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return value
}

function trimmedOrUndefined({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return value
  const v = value.trim()
  return v === '' ? undefined : v
}

export class WoToBeBilledFilterDto {
  @ApiProperty({ description: 'Un solo dealer', example: 594 })
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  idDealer!: number

  /**
   * Las dos fechas o ninguna. Sin fechas la lista trae toda la historia del dealer, como legacy al entrar; para generar
   * (y para la cuenta previa) son obligatorias (service, `resolveFilter`).
   */
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsCalendarDate()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-11-12' })
  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsCalendarDate()
  dateTo?: string

  @ApiPropertyOptional({ description: 'Status (workflow): 15, 5, 6, 7, 16', example: '15,5' })
  @IsOptional()
  @Transform(toIntList)
  @IsArray()
  @IsIn(WO_TO_BE_BILLED_STATUSES as unknown as number[], { each: true })
  status?: number[]

  @ApiPropertyOptional({ description: 'Departments del dealer', example: '492' })
  @IsOptional()
  @Transform(toIntList)
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  departments?: number[]

  @ApiPropertyOptional({ description: 'Services del dealer', example: '147946' })
  @IsOptional()
  @Transform(toIntList)
  @IsArray()
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  services?: number[]

  @ApiPropertyOptional({ description: '2 by Services, 3 Multi-Services, 4 Selected Services', example: 3 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsIn(WO_INVOICE_TYPES as unknown as number[])
  invoiceType?: WoInvoiceType

  @ApiPropertyOptional({ description: '«Include Zero Value»: true = también los de valor cero', example: false })
  @IsOptional()
  @Transform(toFlag)
  @IsBoolean()
  includeZero?: boolean

  @ApiPropertyOptional({ description: "Approved: '' todas, '1' sí, '0' no", example: '' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : String(value)))
  @IsIn(['', '0', '1'])
  approved?: '' | '0' | '1'

  @ApiPropertyOptional({ description: 'WO # (contiene)' })
  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsString()
  @MaxLength(WO_SEARCH_MAX)
  wo?: string

  @ApiPropertyOptional({ description: 'Stock # del auto (exacto)' })
  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsString()
  @MaxLength(STOCK_SEARCH_MAX)
  stock?: string

  @ApiPropertyOptional({ description: 'Price (EQUAL_INVOICE_PRICE)' })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  price?: number

  @ApiPropertyOptional({ description: 'RO# (exacto)' })
  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsString()
  @MaxLength(RO_PO_MAX)
  ro?: string

  @ApiPropertyOptional({ description: 'PO# (exacto)' })
  @IsOptional()
  @Transform(trimmedOrUndefined)
  @IsString()
  @MaxLength(RO_PO_MAX)
  po?: string

  @ApiPropertyOptional({ description: 'WO tildadas: se suman al filtro (solo al generar y en la cuenta previa)' })
  @IsOptional()
  @Transform(toIntList)
  @IsArray()
  @ArrayMaxSize(WO_IDS_MAX)
  @IsInt({ each: true })
  @Min(1, { each: true })
  woIds?: number[]
}

/** `GET /srs/billing/wo-to-be-billed`: el filtro + la página. */
export class WoToBeBilledListQueryDto extends WoToBeBilledFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ default: WO_TO_BE_BILLED_DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(WO_TO_BE_BILLED_MAX_PAGE_SIZE)
  pageSize?: number
}

/** `GET /srs/billing/wo-to-be-billed/config`. */
export class WoToBeBilledConfigQueryDto {
  @ApiProperty({ example: 594 })
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  idDealer!: number
}

export class WoToBeBilledRowDto {
  id!: number
  fullNro!: string
  fechaAlta!: string
  stockNumber!: string | null
  ro!: string | null
  po!: string | null
  observation!: string | null
  idDepartment!: number
  department!: string
  idWorkflow!: number
  workflow!: string
  workflowIcon!: string | null
  workflowColor!: string | null
  vin!: string
  year!: string | null
  make!: string | null
  model!: string | null
  color!: string | null
  total!: number
  approved!: number | null
  approvedDate!: string | null
  approverName!: string | null
  unapproveNote!: string | null
  inspected!: number | null
  inspectedDate!: string | null
  inspectorName!: string | null
  internalInspected!: number | null
  internalInspectedDate!: string | null
  internalInspectorName!: string | null
  woHaveInvoice!: boolean
  isBilled!: boolean
  invoiceNumbers!: string
  /** `GET_SELECT_SERVICES_FROM_WO_DETAILED`: `[{ nombre, idStatement, … }]`. */
  services!: Array<Record<string, unknown>>
  /** `CARFLOW_GET_WORKED_TIME_BY_WO` como `HH:MM` (las horas pueden pasar de 99); el texto de Age lo arma el front. */
  timeWorked!: string | null
  hasFinalInspect!: boolean
  hasInternalInspect!: boolean
}

export class WoToBeBilledListResponseDto {
  results!: WoToBeBilledRowDto[]
  page!: number
  pageSize!: number
  hasMore!: boolean
}

export class WoToBeBilledSummaryDto {
  count!: number
  total!: number
}

export class WoToBeBilledConfigDto {
  canGenerate!: boolean
  canDeleteSelected!: boolean
  canDeleteRow!: boolean
  canDeleteRowInTransitOnly!: boolean
}

export class WoToBeBilledPreviewDto {
  workOrders!: number
  invoices!: number
}
