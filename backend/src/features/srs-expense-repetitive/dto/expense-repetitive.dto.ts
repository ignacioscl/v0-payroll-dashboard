import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'

import {
  MSG_AMOUNT_INVALID,
  MSG_CHOOSE_START_DATE,
  MSG_CHOOSE_WEEK_DAY,
  MSG_END_BEFORE_START,
  MSG_ENTER_DESCRIPTION,
  RULE_DESCRIPTION_MAX,
  msgTooLong,
} from 'src/features/srs-expense/rules/expense-rules'
import { AssignRowDto } from 'src/features/srs-expense-dealer-assign/dto/expense-dealer-assign.dto'

/** Filtro del feature (lo que pide BaseRepository.fetch). */
export class ExpenseRepetitiveQueryDto {
  id?: number
  idDealerProvider?: number
  status?: number
  term?: string
  page?: number
  pageSize?: number
}

export type RuleSplitType = 'percent' | 'fixed'
export type RuleFrequency = 'monthly' | 'weekly'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : value
}
const toMoneyString = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  return typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value
}
const toNullableYmd = ({ value }: { value: unknown }) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return typeof value === 'string' ? value.trim() : value
}

/** GET /srs/expenses/recurring?term&page&pageSize */
export class RecurringListQueryDto {
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
}

/** POST /srs/expenses/recurring (pareja de frontend/lib/expenses/recurring-form-schema.ts). */
export class RecurringRuleDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: MSG_ENTER_DESCRIPTION })
  @MaxLength(RULE_DESCRIPTION_MAX, { message: msgTooLong(RULE_DESCRIPTION_MAX) })
  description!: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCompany?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128, { message: msgTooLong(128) })
  newCompanyName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCategory?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128, { message: msgTooLong(128) })
  newCategoryName?: string

  /** Obligatorio en By percent; en By fixed amount no se escribe (es la suma de los dealers). */
  @ApiPropertyOptional({ example: '1250.00' })
  @IsOptional()
  @Transform(toMoneyString)
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: MSG_AMOUNT_INVALID })
  amount?: string

  @ApiProperty({ enum: ['percent', 'fixed'] })
  @IsIn(['percent', 'fixed'])
  splitType!: RuleSplitType

  @ApiProperty({ enum: ['monthly', 'weekly'] })
  @IsIn(['monthly', 'weekly'])
  frequency!: RuleFrequency

  /** 0 = Sunday … 6 = Saturday; obligatorio en weekly. */
  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: MSG_CHOOSE_WEEK_DAY })
  @Min(0, { message: MSG_CHOOSE_WEEK_DAY })
  @Max(6, { message: MSG_CHOOSE_WEEK_DAY })
  weekDay?: number

  @ApiProperty({ example: '2026-11-02' })
  @Transform(trim)
  @IsString({ message: MSG_CHOOSE_START_DATE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: MSG_CHOOSE_START_DATE })
  startDate!: string

  @ApiPropertyOptional({ example: '2027-01-31', nullable: true })
  @IsOptional()
  @Transform(toNullableYmd)
  @IsString({ message: MSG_END_BEFORE_START })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: MSG_END_BEFORE_START })
  endDate?: string | null
}

/** PUT /srs/expenses/recurring/:id — parcial; `splitType` cambia solo por /split. */
export class UpdateRecurringRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: MSG_ENTER_DESCRIPTION })
  @MaxLength(RULE_DESCRIPTION_MAX, { message: msgTooLong(RULE_DESCRIPTION_MAX) })
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCompany?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128, { message: msgTooLong(128) })
  newCompanyName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCategory?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(128, { message: msgTooLong(128) })
  newCategoryName?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toMoneyString)
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: MSG_AMOUNT_INVALID })
  amount?: string

  @ApiPropertyOptional({ enum: ['monthly', 'weekly'] })
  @IsOptional()
  @IsIn(['monthly', 'weekly'])
  frequency?: RuleFrequency

  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: MSG_CHOOSE_WEEK_DAY })
  @Min(0, { message: MSG_CHOOSE_WEEK_DAY })
  @Max(6, { message: MSG_CHOOSE_WEEK_DAY })
  weekDay?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: MSG_CHOOSE_START_DATE })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: MSG_CHOOSE_START_DATE })
  startDate?: string

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(toNullableYmd)
  @IsString({ message: MSG_END_BEFORE_START })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: MSG_END_BEFORE_START })
  endDate?: string | null
}

/** PUT /srs/expenses/recurring/:id/split */
export class SplitTypeDto {
  @ApiProperty({ enum: ['percent', 'fixed'] })
  @IsIn(['percent', 'fixed'], { message: 'Recurring expense not found.' })
  splitType!: RuleSplitType
}

/** Fila del listado (contrato `RuleRow`). */
export interface RuleRowDto {
  id: number
  description: string
  company: { id: number; name: string }
  category: { id: number; name: string }
  amount: string | null
  splitType: RuleSplitType
  frequency: RuleFrequency
  weekDay?: number | null
  startDate: string
  endDate: string | null
  dealersCount: number
  nextRun: string | null
  active: boolean
  /** Por qué no va a generar lo que se espera (`ruleWarnings`); vacío si se genera completa. */
  warnings: string[]
}

/** Detalle (contrato `RuleDetail`). */
export interface RuleDetailDto extends RuleRowDto {
  assigns: AssignRowDto[]
  totalPercent: string | null
  /** El problema que ve `checkRun` (texto del cron), o null si la regla se genera. */
  canRun: string | null
}
