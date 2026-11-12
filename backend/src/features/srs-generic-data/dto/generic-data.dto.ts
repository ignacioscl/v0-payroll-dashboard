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

  @ApiPropertyOptional({ enum: ['0', '1'], description: '1 = solo inactivos (Settings, «Show inactive»).' })
  @IsOptional()
  @IsIn(['0', '1'])
  inactiveOnly?: string

  @ApiPropertyOptional({
    enum: ['0', '1'],
    description: '1 = solo los nombres parecidos de la empresa, activos e inactivos (Settings, «Possible duplicates»).',
  })
  @IsOptional()
  @IsIn(['0', '1'])
  duplicatesOnly?: string
}

/**
 * POST /srs/expenses/companies|categories/:id/merge: la fila que queda. Vacío o no entero llega como undefined y el
 * servicio responde con el texto de cada tipo («Choose a company.» / «Choose a category.»).
 */
export class MergeCatalogItemDto {
  @ApiProperty()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  targetId?: number
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
  /** Se puede borrar: nada la usa, ni gastos borrados, ni reglas, ni una compañía que la tiene de última categoría. */
  deletable: boolean
  /** Solo en compañías (D4). */
  lastCategory?: { id: number; name: string; active: boolean } | null
  /** Solo en categorías: con cuáles se puede unificar (misma clase; srs/expenses/expense-closing-class.ts). */
  closingClass?: 'tint' | 'accident' | null
  /** Solo con `duplicatesOnly`: número de grupo (0, 1, 2…) en el orden de la lista entera, para alternar el fondo. */
  duplicateGroup?: number
}

/** Una página del listado de Settings. `groups` solo viene con `duplicatesOnly`. */
export interface CatalogPageDto {
  data: CatalogItemDto[]
  total: number
  page: number
  pageSize: number
  groups?: number
}

/** Lo que usa una fila de la empresa (diálogo de Merge). */
export interface CatalogUsageDto {
  expenses: number
  deletedExpenses: number
  rules: number
  /** Compañías que la tienen de última categoría (solo en categorías; 0 en compañías). */
  companies: number
}

export interface CatalogMergeResultDto {
  target: CatalogItemDto
  expensesMoved: number
  rulesMoved: number
  companiesUpdated: number
}
