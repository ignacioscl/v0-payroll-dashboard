import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import { parseCsvPositiveInts, parseOptionalTrimmed } from './invoice-filter-parsers'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

export class InvoiceLookupQueryDto {
  @ApiProperty({ description: 'Dealer ids (comma-separated)', example: '12,34' })
  @IsString()
  idDealer!: string

  @ApiPropertyOptional({ description: 'Filter by name', example: 'Body' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ description: 'Department ids for service lookup (comma-separated)' })
  @IsOptional()
  @IsString()
  idDepartment?: string

  @ApiPropertyOptional({ default: 80 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}

export interface InvoiceLookupOptionDto {
  id: number
  label: string
  sublabel?: string
}

export class InvoiceLookupResponseDto {
  @ApiProperty({ type: [Object] })
  results!: InvoiceLookupOptionDto[]
}

export function buildDepartmentLookupFilter(query: InvoiceLookupQueryDto) {
  return {
    dealerIds: parseCsvPositiveInts(query.idDealer),
    search: parseOptionalTrimmed(query.search),
    limit: query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 80,
  }
}

export function buildServiceLookupFilter(query: InvoiceLookupQueryDto) {
  return {
    dealerIds: parseCsvPositiveInts(query.idDealer),
    departmentIds: parseCsvPositiveInts(query.idDepartment),
    search: parseOptionalTrimmed(query.search),
    limit: query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 80,
  }
}
