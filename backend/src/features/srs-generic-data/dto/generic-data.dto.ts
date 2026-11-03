import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

import { CATALOG_NAME_MAX } from 'src/features/srs-expense/rules/expense-rules'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

const toOptionalBool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return value
}

/** Filtro del feature (lo que pide BaseRepository.fetch). */
export class GenericDataQueryDto {
  id?: number
  idCategoria?: number
  idDealerProvider?: number
  estado?: number
  term?: string
  page?: number
  pageSize?: number
}

/** GET /srs/expenses/companies | categories: `page` base 1 desde el front. */
export class CatalogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  term?: string

  @ApiPropertyOptional({ description: 'Página base 1 (default 1).' })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ description: 'Default 25, máximo 200.' })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  pageSize?: number

  @ApiPropertyOptional({ enum: ['0', '1'], description: '1 = solo activos (los combos).' })
  @IsOptional()
  @IsIn(['0', '1'])
  activeOnly?: string
}

export class CreateCatalogItemDto {
  @ApiProperty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'Enter a name.' })
  @MaxLength(CATALOG_NAME_MAX, { message: `Up to ${CATALOG_NAME_MAX} characters.` })
  name!: string
}

export class UpdateCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'Enter a name.' })
  @MaxLength(CATALOG_NAME_MAX, { message: `Up to ${CATALOG_NAME_MAX} characters.` })
  name?: string

  /** Sin `@Type(() => Boolean)`: `Boolean('false')` es true; el Transform de arriba entiende 'false' / '0'. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBool)
  @IsBoolean()
  active?: boolean
}

export interface CatalogItemDto {
  id: number
  name: string
  active: boolean
  expensesCount: number
  /** Solo en compañías (D4). */
  lastCategory?: { id: number; name: string; active: boolean } | null
}
