import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator'

import { parseCsvPositiveInts, parseOptionalTrimmed } from './invoice-filter-parsers'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/** Query of GET /srs/billing/invoices/:id/detail — slice + screen filters. */
export class InvoiceDetailQueryDto {
  @ApiPropertyOptional({
    description: 'BILLING.id of the list clone. 0 / omitted = unpaid remainder.',
    example: 0,
  })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(0)
  idBilling?: number

  @ApiPropertyOptional({
    description:
      "Slice payed: omit on remainder (idBilling 0). Send '1' on billed clones. Do not send ''.",
    enum: ['0', '1'],
  })
  @IsOptional()
  @IsIn(['0', '1'])
  payed?: '0' | '1'

  @ApiPropertyOptional({ description: 'Department ids (comma-separated), same as the list' })
  @IsOptional()
  @IsString()
  idDepartment?: string

  @ApiPropertyOptional({ description: 'Invoice service ids (comma-separated), same as the list' })
  @IsOptional()
  @IsString()
  idInvoiceService?: string

  @ApiPropertyOptional({ description: 'Stock # or VIN (partial match), same as the list' })
  @IsOptional()
  @IsString()
  stock?: string
}

export type InvoiceDetailSlice = {
  idBilling: number
  payed?: '0' | '1'
  departmentIds: number[]
  invoiceServiceIds: number[]
  stock?: string
}

export function buildInvoiceDetailSlice(query: InvoiceDetailQueryDto): InvoiceDetailSlice {
  const idBilling =
    query.idBilling != null && Number.isFinite(query.idBilling) ? Math.max(0, query.idBilling) : 0
  return {
    idBilling,
    payed: query.payed,
    departmentIds: parseCsvPositiveInts(query.idDepartment),
    invoiceServiceIds: parseCsvPositiveInts(query.idInvoiceService),
    stock: parseOptionalTrimmed(query.stock),
  }
}

/**
 * Fila de detalle de un statement de tipo WO (statement_type 1-4).
 * Espeja InvoiceStatementDao::loadStatementRel (una fila por servicio de WO).
 */
export class InvoiceDetailWoRowDto {
  @ApiProperty() id!: number
  @ApiProperty() idStatement!: number
  @ApiProperty({ nullable: true }) woNro?: string
  @ApiProperty({ nullable: true }) fechaAlta?: string
  @ApiProperty({ nullable: true }) vin?: string
  @ApiProperty({ nullable: true }) stockNumber?: string
  @ApiProperty({ nullable: true }) ro?: string
  @ApiProperty({ nullable: true }) po?: string
  @ApiProperty({ nullable: true }) department?: string
  @ApiProperty({ nullable: true }) service?: string
  @ApiProperty({ nullable: true }) observation?: string
  @ApiProperty({ nullable: true }) qty?: number
  @ApiProperty({ nullable: true }) price?: number
  @ApiProperty() isStatementFullBilled!: number
  @ApiProperty({ nullable: true }) checkNumber?: string
  @ApiProperty({ nullable: true }) amount?: number
  @ApiProperty({ nullable: true }) fechaPago?: string
}

/**
 * Fila de detalle de statement TTK (5) o Generic (6).
 * Espeja InvoiceStatementDao::loadStatementRelGenerics (UNION generic + ttk).
 */
export class InvoiceDetailGenericRowDto {
  @ApiProperty({ nullable: true }) id?: number
  @ApiProperty() idStatement!: number
  @ApiProperty({ nullable: true }) description?: string
  @ApiProperty({ nullable: true }) genericQty?: number
  @ApiProperty({ nullable: true }) price?: number
  @ApiProperty() isStatementFullBilled!: number
  @ApiProperty({ nullable: true }) checkNumber?: string
  @ApiProperty({ nullable: true }) amount?: number
  @ApiProperty({ nullable: true }) fechaPago?: string
  /** TTK rollup por autor (null en filas generic puras). */
  @ApiProperty({ nullable: true }) idAuthorTtk?: number
  @ApiProperty({ nullable: true }) rolName?: string
  @ApiProperty({ nullable: true }) departmentName?: string
  @ApiProperty() onlyTimecard!: number
}

export class InvoiceDetailResponseDto {
  @ApiProperty() idStatement!: number
  @ApiProperty({ description: 'statement_type del statement' }) statementType!: number
  @ApiProperty({ type: [InvoiceDetailWoRowDto] }) woRows!: InvoiceDetailWoRowDto[]
  @ApiProperty({ type: [InvoiceDetailGenericRowDto] }) genericRows!: InvoiceDetailGenericRowDto[]
}
