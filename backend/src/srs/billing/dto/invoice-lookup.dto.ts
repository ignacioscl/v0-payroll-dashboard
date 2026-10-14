import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import { parseCsvPositiveInts, parseOptionalTrimmed } from './invoice-filter-parsers'

/**
 * Safety ceiling for the filter lookups. The pickers must list every match (a silent cap made
 * "Check all" pick a fraction of the services and the totals came out wrong); this only guards
 * against a runaway catalog and the response says `truncated` when it bites.
 */
export const LOOKUP_MAX_ROWS = 5000

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

export class InvoiceLookupQueryDto {
  @ApiPropertyOptional({ description: 'Dealer ids (comma-separated)', example: '12,34' })
  @IsOptional()
  @IsString()
  idDealer?: string

  @ApiPropertyOptional({ description: 'Filter by name', example: 'Body' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Department ids for service lookup (comma-separated)' })
  @IsOptional()
  @IsString()
  idDepartment?: string

  @ApiPropertyOptional({ default: LOOKUP_MAX_ROWS })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(LOOKUP_MAX_ROWS)
  limit?: number
}

export interface InvoiceLookupOptionDto {
  id: number
  label: string
  sublabel?: string
  thumbnailUuid?: string | null
  logoImg?: string | null
}

export class InvoiceLookupResponseDto {
  @ApiProperty({ type: [Object] })
  results!: InvoiceLookupOptionDto[]

  @ApiPropertyOptional({ description: `True when more than ${LOOKUP_MAX_ROWS} options matched` })
  truncated?: boolean
}

/** Repositories are asked for `limit + 1` rows; the extra one only tells that the list was cut. */
export function capLookupRows<T>(rows: T[], limit: number): { results: T[]; truncated: boolean } {
  return rows.length > limit
    ? { results: rows.slice(0, limit), truncated: true }
    : { results: rows, truncated: false }
}

export function buildDepartmentLookupFilter(query: InvoiceLookupQueryDto) {
  return {
    dealerIds: parseCsvPositiveInts(query.idDealer ?? ''),
    search: parseOptionalTrimmed(query.search),
    limit: query.limit && query.limit > 0 ? Math.min(query.limit, LOOKUP_MAX_ROWS) : LOOKUP_MAX_ROWS,
  }
}

export function buildServiceLookupFilter(query: InvoiceLookupQueryDto) {
  return {
    dealerIds: parseCsvPositiveInts(query.idDealer ?? ''),
    departmentIds: parseCsvPositiveInts(query.idDepartment),
    search: parseOptionalTrimmed(query.search),
    limit: query.limit && query.limit > 0 ? Math.min(query.limit, LOOKUP_MAX_ROWS) : LOOKUP_MAX_ROWS,
  }
}
