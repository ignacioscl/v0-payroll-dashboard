import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator'

import type { InvoiceListQueryDto } from './invoice-list.dto'

/** 1 = "Invoice" (one row per grid row); 2 = "Invoice with Wo Details" (one row per WO line). */
export type InvoiceExportType = 1 | 2

export const INVOICE_EXPORT_TYPE_INVOICE: InvoiceExportType = 1
export const INVOICE_EXPORT_TYPE_WO_DETAILS: InvoiceExportType = 2

/**
 * Body of POST /srs/billing/invoices/export/prepare. The filters travel in the query, through
 * the same InvoiceListQueryDto as the grid, so the file can never read a filter differently
 * than the list (plans/plan-export-invoices-nest §2.1.2).
 */
export class InvoiceExportPrepareBodyDto {
  @ApiProperty({ enum: [1, 2], description: '1 = Invoice, 2 = Invoice with Wo Details' })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  exportType!: InvoiceExportType

  @ApiPropertyOptional({ description: 'File name typed in the dialog (D12)', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fileName?: string
}

/** Same expression as the dialog and as the PHP (plans/plan-export-invoices-nest §2.1.6, D15). */
export const INVOICE_EXPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Email To → the list of addresses (D15, D22): split by comma, trimmed, empty ones skipped,
 * repeats removed. null when there is none, or when one is not valid or longer than 64.
 */
export function parseInvoiceExportEmails(raw: string): string[] | null {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of (raw ?? '').split(',')) {
    const email = part.trim()
    if (!email) continue
    if (email.length > 64 || !INVOICE_EXPORT_EMAIL_PATTERN.test(email)) return null
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(email)
  }
  return out.length ? out : null
}

/**
 * Body of POST /srs/billing/invoices/export/email and /queue (§8.7). Validations of D15 and D22:
 * Email To required (one or more valid addresses, up to 64 characters each); Reply-To valid;
 * subject up to 512, message up to 1024, Queue Name and File Name up to 64. The PHP checks them
 * again.
 */
export class InvoiceExportMailBodyDto extends InvoiceExportPrepareBodyDto {
  @ApiProperty({ description: 'Comma separated recipients' })
  @IsString()
  @IsNotEmpty({ message: 'This value is required.' })
  @MaxLength(2000)
  emailTo!: string

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512, { message: 'Max 512 characters.' })
  subject?: string

  @ApiPropertyOptional({ maxLength: 1024 })
  @IsOptional()
  @IsString()
  @MaxLength(1024, { message: 'Max 1024 characters.' })
  message?: string

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Max 64 characters.' })
  @Matches(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'This value should be a valid email.' })
  replyTo?: string

  @ApiPropertyOptional({ maxLength: 64, description: 'Create File to Email only' })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Max 64 characters.' })
  queueName?: string

  @ApiPropertyOptional({ description: 'Attach the Time Card PDF of the TTK invoices (D2, D16)' })
  @IsOptional()
  @IsBoolean()
  attachTimeCard?: boolean
}

/** What the PHP returns when the job ends well (§2.1.2). */
export type InvoiceExportMailResult = {
  idQueue: number
  descripcion: string
  timeCard: boolean
  sent: boolean
}

export class InvoiceExportTicketQueryDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  ticket!: string
}

export class InvoiceExportPrepareResponseDto {
  @ApiProperty() ticket!: string
  @ApiProperty() expiresAt!: string
}

export class InvoiceExportStatusDto {
  @ApiProperty({ enum: ['pending', 'running', 'done', 'error'] })
  status!: 'pending' | 'running' | 'done' | 'error'
  @ApiPropertyOptional() errorMessage?: string
  @ApiPropertyOptional() errorCode?: string
  @ApiPropertyOptional({ description: 'Send Email / Create File only, when the job ends well' })
  result?: InvoiceExportMailResult
}

/** What the ticket keeps between `prepare` and the download: the query as it passed validation. */
export type InvoiceExportStoredFilters = {
  query: InvoiceListQueryDto
  exportType: InvoiceExportType
  fileName?: string
  /** External user (`x-srs-company-type: 1`): first column is COMPANY instead of DEALER (D24). */
  isCompanyTypeCompany: boolean
  /** Send Email / Create File: the mail fields, as they passed validation. */
  mail?: InvoiceExportMailBodyDto & { action: 'email' | 'queue' }
}
