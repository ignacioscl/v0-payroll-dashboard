import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import {
  parseDealerIds,
  parseIncludeZero,
  skipDealerRestrictionForRol,
} from '../../shared/kpi/srs-kpi-dealer-filter'
import { StatementType, WO_STATEMENT_TYPES } from '../entity/invoice-statement.srsentity'
import {
  parseCsvPositiveInts,
  parseFlag01,
  parseOptionalTrimmed,
  parseWoNumbers,
} from './invoice-filter-parsers'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/** Máximo de filas por página del listado de invoices (protege la DB de LIMITs enormes). */
export const INVOICE_LIST_MAX_PAGE_SIZE = 200
export const INVOICE_LIST_DEFAULT_PAGE_SIZE = 25

export type InvoiceDeletedMode = 'hide' | 'only' | 'all'

export function parseDeletedMode(
  deleted?: string,
  showDeletedFallback?: boolean,
): InvoiceDeletedMode {
  if (deleted === 'hide' || deleted === 'only' || deleted === 'all') return deleted
  return showDeletedFallback ? 'only' : 'hide'
}

/**
 * Query de GET /srs/billing/invoices. Extiende la query KPI compartida
 * (fechaDesde/fechaHasta/idDealer requeridos) y agrega paginación + filtros
 * propios de la solapa Invoice (tipos, búsqueda, pago, envío).
 */
export class InvoiceListQueryDto extends SrsKpiQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({
    example: 25,
    default: INVOICE_LIST_DEFAULT_PAGE_SIZE,
    description: 'Filas por página; -1 = todas (sin LIMIT)',
  })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  pageSize?: number

  @ApiPropertyOptional({
    description: "csv de 'wo' | 'ttk' | 'generic' (vacío = todos)",
    example: 'wo,ttk,generic',
  })
  @IsOptional()
  @IsString()
  types?: string

  @ApiPropertyOptional({ description: 'Busca en INVOICE_STATEMENT.full_nro', example: 'A1042' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Filtro por IS_STATEMENT_BILLED', enum: ['0', '1'] })
  @IsOptional()
  @IsIn(['0', '1'])
  payed?: string

  @ApiPropertyOptional({ description: 'Filtro por flag sended', enum: ['0', '1'] })
  @IsOptional()
  @IsIn(['0', '1'])
  sended?: string

  @ApiPropertyOptional({ description: 'Department ids (comma-separated)' })
  @IsOptional()
  @IsString()
  idDepartment?: string

  @ApiPropertyOptional({ description: 'Invoice service ids (comma-separated)' })
  @IsOptional()
  @IsString()
  idInvoiceService?: string

  @ApiPropertyOptional({ description: 'WO numbers (comma / space separated)' })
  @IsOptional()
  @IsString()
  wo?: string

  @ApiPropertyOptional({ description: 'PO or RO number' })
  @IsOptional()
  @IsString()
  roPo?: string

  @ApiPropertyOptional({ description: 'Stock # or VIN (partial match)' })
  @IsOptional()
  @IsString()
  stock?: string

  @ApiPropertyOptional({ description: 'Check / payment date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  checkDate?: string

  @ApiPropertyOptional({ description: 'Check number (partial match on BILLING.check_number)' })
  @IsOptional()
  @IsString()
  checkNumber?: string

  @ApiPropertyOptional({ description: 'Invoice author (employee) id' })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idAuthor?: number

  @ApiPropertyOptional({ description: 'Author ids CSV (multi). Prefer over idAuthor.' })
  @IsOptional()
  @IsString()
  idAuthorIn?: string

  @ApiPropertyOptional({
    description: 'When 1 with idAuthorIn: NOT IN authors (invoices NOT created by)',
    enum: [0, 1],
  })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsIn([0, 1])
  authorsExclude?: number

  @ApiPropertyOptional({
    description:
      'When 1: include statements authored by System/Schedule (batch runs and non-employee ' +
      'accounts such as Administrator, which are hidden from the employee combo). ' +
      'Combined with idAuthorIn it widens the result: those employees OR system/schedule.',
  })
  @IsOptional()
  @Transform(({ value }) => parseFlag01(value))
  createdBySystem?: boolean

  @ApiPropertyOptional({ description: 'When 1: full_nro exact match instead of LIKE' })
  @IsOptional()
  @Transform(({ value }) => parseFlag01(value))
  exactMatch?: boolean

  @ApiPropertyOptional({ description: 'Overdue unpaid statements (due_on)' })
  @IsOptional()
  @Transform(({ value }) => parseFlag01(value))
  dueOn?: boolean

  @ApiPropertyOptional({
    description:
      "Deleted statements: hide (estado=1, default), only (estado=0), all (IN (0,1)). " +
      'Replaces showDeleted. The API does not infer this from search.',
    enum: ['hide', 'only', 'all'],
  })
  @IsOptional()
  @IsIn(['hide', 'only', 'all'])
  deleted?: InvoiceDeletedMode

  /** @deprecated Use `deleted=only`. Mapped only when `deleted` is omitted. */
  @ApiPropertyOptional({ description: 'Deprecated: use deleted=only', deprecated: true })
  @IsOptional()
  @Transform(({ value }) => parseFlag01(value))
  showDeleted?: boolean

  @ApiPropertyOptional({
    description:
      'Employee who worked ids CSV (TTK_EMPLOYEE_WORK.id_author on invoice lines). ' +
      'Restricts to statement_type 5/6. Provider comes from JWT, not this param.',
  })
  @IsOptional()
  @IsString()
  employeeWorkedIn?: string

  /** @deprecated Prefer employeeWorkedIn. Mapped when the CSV is empty. */
  @ApiPropertyOptional({ description: 'Deprecated: use employeeWorkedIn' })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  employeeWorkedId?: number

  @ApiPropertyOptional({
    description:
      'When 1: skip header fecha_desde/fecha_hasta on the list WHERE. ' +
      'Dates stay required on the request. Front sends this from the Ignore date range switch.',
  })
  @IsOptional()
  @Transform(({ value }) => parseFlag01(value))
  ignorePeriod?: boolean

  @ApiPropertyOptional({ description: 'Server-side sort column', enum: ['invoiceNro', 'dateFrom'] })
  @IsOptional()
  @IsIn(['invoiceNro', 'dateFrom'])
  orderBy?: 'invoiceNro' | 'dateFrom'

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  orderDir?: 'asc' | 'desc'
}

/** Filtro resuelto (contexto + query) que consume el repositorio. */
export interface InvoiceListFilter {
  idDealerProvider: number
  idUsuario: number
  dealerIds: number[]
  fechaDesde: string
  fechaHasta: string
  /** [] = sin filtro de tipo (todos). */
  statementTypes: StatementType[]
  search?: string
  payed?: '0' | '1'
  sended?: '0' | '1'
  page: number
  pageSize: number
  /** When false (default), exclude statements with GET_TOTAL_BY_STATEMENT = 0. */
  includeZero: boolean
  skipDealerRestriction: boolean
  departmentIds: number[]
  invoiceServiceIds: number[]
  woNumbers: string[]
  roPo?: string
  stock?: string
  checkDate?: string
  checkNumber?: string
  idAuthor?: number
  /** Multi-author filter (CSV resolved to ints). */
  authorIds: number[]
  /** When true with authorIds: NOT IN. */
  authorsExclude: boolean
  createdBySystem: boolean
  exactMatch: boolean
  dueOn: boolean
  deleted: InvoiceDeletedMode
  employeeWorkedIds: number[]
  /** When true, do not add fecha_desde/fecha_hasta to the list WHERE. */
  ignorePeriod: boolean
  orderBy?: 'invoiceNro' | 'dateFrom'
  orderDir: 'asc' | 'desc'
}

const TYPE_TOKENS: Record<string, StatementType[]> = {
  wo: [...WO_STATEMENT_TYPES],
  ttk: [StatementType.TTK],
  generic: [StatementType.GENERIC],
}

/** csv de tokens (wo/ttk/generic) → lista de statement_type, deduplicada. */
export function parseStatementTypes(raw?: string): StatementType[] {
  if (!raw?.trim()) return []
  const set = new Set<StatementType>()
  for (const token of raw.split(',').map((t) => t.trim().toLowerCase())) {
    for (const type of TYPE_TOKENS[token] ?? []) set.add(type)
  }
  return [...set]
}

export function buildInvoiceListFilter(
  ctx: SrsContext,
  query: InvoiceListQueryDto,
): InvoiceListFilter {
  const dealerIds = parseDealerIds(query.idDealer)
  const page = query.page && query.page > 0 ? query.page : 1
  const pageSize =
    query.pageSize === -1
      ? -1
      : query.pageSize && query.pageSize > 0
        ? Math.min(query.pageSize, INVOICE_LIST_MAX_PAGE_SIZE)
        : INVOICE_LIST_DEFAULT_PAGE_SIZE
  return {
    idDealerProvider: ctx.idDealerProvider,
    idUsuario: ctx.idUsuario,
    dealerIds,
    fechaDesde: query.fechaDesde,
    fechaHasta: query.fechaHasta,
    statementTypes: parseStatementTypes(query.types),
    search: query.search?.trim() || undefined,
    payed: query.payed as '0' | '1' | undefined,
    sended: query.sended as '0' | '1' | undefined,
    page,
    pageSize,
    includeZero: parseIncludeZero(query.includeZero),
    skipDealerRestriction: skipDealerRestrictionForRol(ctx.idRol),
    departmentIds: parseCsvPositiveInts(query.idDepartment),
    invoiceServiceIds: parseCsvPositiveInts(query.idInvoiceService),
    woNumbers: parseWoNumbers(query.wo),
    roPo: parseOptionalTrimmed(query.roPo),
    stock: parseOptionalTrimmed(query.stock),
    checkDate: parseOptionalTrimmed(query.checkDate),
    checkNumber: parseOptionalTrimmed(query.checkNumber),
    idAuthor: query.idAuthor && query.idAuthor > 0 ? query.idAuthor : undefined,
    authorIds: parseCsvPositiveInts(query.idAuthorIn),
    authorsExclude: Number(query.authorsExclude) === 1,
    createdBySystem: parseFlag01(query.createdBySystem),
    exactMatch: parseFlag01(query.exactMatch),
    dueOn: parseFlag01(query.dueOn),
    deleted: parseDeletedMode(query.deleted, parseFlag01(query.showDeleted)),
    employeeWorkedIds: (() => {
      const ids = parseCsvPositiveInts(query.employeeWorkedIn)
      if (query.employeeWorkedId && query.employeeWorkedId > 0) ids.push(query.employeeWorkedId)
      return [...new Set(ids)]
    })(),
    ignorePeriod: parseFlag01(query.ignorePeriod),
    orderBy: query.orderBy,
    orderDir: query.orderDir === 'asc' ? 'asc' : 'desc',
  }
}

/* -------------------------------------------------------------------------- */
/* Response DTOs                                                               */
/* -------------------------------------------------------------------------- */

export class InvoiceRowDto {
  @ApiProperty() id!: number
  @ApiProperty() fullNro!: string
  @ApiProperty({ description: 'fullNro with -N / *N suffix from nroBilled (grid label)' })
  displayFullNro!: string
  @ApiProperty({ description: 'statement_type (1-4 WO, 5 TTK, 6 Generic)' }) statementType!: number
  @ApiProperty() estado!: number
  @ApiProperty({ nullable: true }) wo?: string
  @ApiProperty({ nullable: true }) department?: string
  @ApiProperty({ nullable: true }) invoiceService?: string
  @ApiProperty({ nullable: true }) invoiceServiceSelRel?: string
  @ApiProperty({
    nullable: true,
    description: 'GET_SERVICES_NAMES_BY_WO raw (Individual statements only)',
  })
  invoiceServicesByWo?: string
  @ApiProperty({ nullable: true }) invoiceNote?: string
  @ApiProperty({ nullable: true }) author?: string
  @ApiProperty({
    description: 'True when invoice was generated by INVOICE_STATEMENT_SCHEDULE cron',
  })
  createdBySchedule!: boolean
  @ApiProperty({
    nullable: true,
    description: 'Dealer name from GET_DEALER_NAME_BY_PROVIDER(provider, dealer)',
  })
  dealer?: string
  @ApiProperty({ nullable: true, description: 'Dealer id (INVOICE_STATEMENT.id_dealer)' }) idDealer?: number
  @ApiProperty() fechaCreate!: string
  @ApiProperty({ nullable: true }) fechaDesde?: string
  @ApiProperty({ nullable: true }) fechaHasta?: string
  @ApiProperty() subtotal!: number
  @ApiProperty({ nullable: true }) discount?: number
  @ApiProperty({ nullable: true }) discountType?: number
  @ApiProperty({ nullable: true }) discountDetail?: string
  @ApiProperty() total!: number
  @ApiProperty() tax!: number
  @ApiProperty({ nullable: true }) po?: string
  @ApiProperty({ nullable: true }) ro?: string
  @ApiProperty() sended!: number
  @ApiProperty({ nullable: true, description: 'Comma-separated recipients from last sends' })
  emailsSended?: string
  @ApiProperty({ nullable: true, description: 'Last email send datetime' })
  lastSended?: string
  @ApiProperty() isBilled!: number
  @ApiProperty() isPartialBilled!: number
  @ApiProperty({ description: 'Active statement notes count' }) notesCount!: number
  @ApiProperty({ description: 'LOG_CHANGE rows for this statement' }) logCount!: number
  @ApiProperty({ nullable: true }) idBilling?: number
  @ApiProperty({
    nullable: true,
    description: 'BILLING_WO_REL.id (union2) or -1 (union3 line slice); null on unpaid remainder',
  })
  idBillingWoRel?: number | null
  @ApiProperty({
    nullable: true,
    description: 'null unpaid remainder; 1 whole-statement billing; real nro_billed on line slices',
  })
  nroBilled?: number | null
  @ApiProperty({ nullable: true }) fechaPago?: string
  @ApiProperty({ nullable: true }) checkNumber?: string
  @ApiProperty({ nullable: true }) amount?: number
}

export class InvoiceSummaryDto {
  @ApiProperty() count!: number
  @ApiProperty() subtotal!: number
  @ApiProperty() discount!: number
  @ApiProperty() total!: number
  @ApiProperty({ description: 'Rows in the list WHERE with estado=0 (deleted)' })
  deletedInList!: number
}

export class InvoiceListResponseDto {
  @ApiProperty({ type: [InvoiceRowDto] }) results!: InvoiceRowDto[]
  @ApiProperty({ description: '1-based' }) page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() hasMore!: boolean
}

export class InvoiceSummaryResponseDto {
  @ApiProperty({ description: 'Total clone rows matching the filter (not statements)' })
  total!: number
  @ApiProperty({ type: InvoiceSummaryDto, description: 'Totales sobre TODO el filtro (no solo la página)' })
  summary!: InvoiceSummaryDto
}
