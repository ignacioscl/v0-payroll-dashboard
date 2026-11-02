import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : value
}
const toBoolish = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return undefined
}

export const EXPENSE_SORT_KEYS = [
  'date',
  'amount',
  'company',
  'category',
  'dealer',
  'author',
  'createdBy',
  'status',
  'description',
  'receiptNumber',
  'id',
] as const
export type ExpenseSortKey = (typeof EXPENSE_SORT_KEYS)[number]

/** Filtros de Expenses List, summary, export y Analytics (contrato en AVANCE.md). */
export class ExpenseListQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Choose a valid date.' })
  from?: string

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Choose a valid date.' })
  to?: string

  @ApiPropertyOptional({ description: 'Ids de dealer del combo, separados por coma. «All» = todos los del combo.' })
  @IsOptional()
  @IsString()
  idDealer?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCompany?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCategory?: number

  @ApiPropertyOptional({ description: 'Assigned to' })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idAuthor?: number

  @ApiPropertyOptional({ description: 'Created by' })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCreatedBy?: number

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: 'Enter an amount greater than 0 (up to 2 decimals).' })
  amountMin?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: 'Enter an amount greater than 0 (up to 2 decimals).' })
  amountMax?: string

  @ApiPropertyOptional({ enum: ['0', '1'], description: 'Show deleted' })
  @IsOptional()
  @IsIn(['0', '1'])
  deleted?: string

  @ApiPropertyOptional({ description: 'Página base 1.' })
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

  @ApiPropertyOptional({ enum: EXPENSE_SORT_KEYS })
  @IsOptional()
  @IsIn(EXPENSE_SORT_KEYS as unknown as string[])
  sort?: ExpenseSortKey

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc'

  @ApiPropertyOptional({ description: 'Analytics › Branch: solo Admin General / Admin Company.' })
  @IsOptional()
  @Transform(toBoolish)
  includeRemovedDealers?: boolean
}

/** GET /srs/expenses/analytics?groupBy=... */
export class ExpenseAnalyticsQueryDto extends ExpenseListQueryDto {
  @ApiPropertyOptional({ enum: ['category', 'company', 'dealer'] })
  @IsIn(['category', 'company', 'dealer'], { message: 'groupBy must be category, company or dealer' })
  groupBy!: 'category' | 'company' | 'dealer'
}

/** GET /srs/expenses/employees?term&idDealer */
export class ExpenseEmployeesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  term?: string

  @ApiPropertyOptional({ description: 'Con dealers (Add/Edit): empleados asignados a esos dealers. Sin: toda la empresa.' })
  @IsOptional()
  @IsString()
  idDealer?: string
}
