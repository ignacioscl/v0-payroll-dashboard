import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

/** Filtro del feature (lo que pide BaseRepository.fetch). */
export class InvoiceStatementQueryDto {
  id?: number
  page?: number
  pageSize?: number
}

/** Una invoice creada: lo que el front necesita para «View in Invoices» (período) y el PDF. */
export class CreatedWoInvoiceDto {
  id!: number
  fullNro!: string
  /** `YYYY-MM-DD`. */
  dateFrom!: string
  dateTo!: string
}

/** `POST /srs/billing/wo-to-be-billed/generate`: las invoices y las WO que de verdad se facturaron. */
export class GenerateWoInvoicesResponseDto {
  invoices!: CreatedWoInvoiceDto[]
  workOrders!: number
}

/** `POST /srs/billing/wo-to-be-billed/:idInvoice/individual`. */
export class GenerateIndividualInvoiceDto {
  @ApiPropertyOptional({ description: '«Include Zero Value»: true = también los servicios en cero', example: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || value === 'true' || value === '1' || value === 1) return true
    if (value === false || value === 'false' || value === '0' || value === 0) return false
    return value
  })
  @IsBoolean()
  includeZero?: boolean
}
