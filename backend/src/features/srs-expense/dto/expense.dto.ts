import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

import {
  DESCRIPTION_MAX,
  MSG_AMOUNT_INVALID,
  MSG_DATE_INVALID,
  MSG_PERCENT_INVALID,
  NOTES_MAX,
  RECEIPT_NUMBER_MAX,
  msgTooLong,
} from '../rules/expense-rules'

/** Filtro del feature (lo que pide BaseRepository.fetch). */
export class ExpenseQueryDto {
  id?: number
  idDetailer?: number
  idExpGroup?: number
  estado?: number
  page?: number
  pageSize?: number
}

export type ExpenseMode = 'single' | 'equal' | 'percent' | 'amount'
export const EXPENSE_MODES: ExpenseMode[] = ['single', 'equal', 'percent', 'amount']

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : value
}
const toMoneyString = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined
  return typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value
}

/** El formato lo controla el DTO; «> 0», «≤ 99.999.999,99» y el reparto los aplica expense-rules.ts en el facade. */
export const AMOUNT_RE = /^\d{1,8}(\.\d{1,2})?$/
export const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/
export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export class ExpenseBranchDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Choose a branch.' })
  idDealer!: number

  @ApiPropertyOptional({ description: 'By percentage: 0–100 con dos decimales.' })
  @IsOptional()
  @Transform(toMoneyString)
  @IsString()
  @Matches(PERCENT_RE, { message: MSG_PERCENT_INVALID })
  percentage?: string

  @ApiPropertyOptional({ description: 'By amount: monto de ese dealer.' })
  @IsOptional()
  @Transform(toMoneyString)
  @IsString()
  @Matches(AMOUNT_RE, { message: MSG_AMOUNT_INVALID })
  amount?: string
}

/**
 * POST /srs/expenses (pareja de frontend/lib/expenses/expense-form-schema.ts). Lo que depende de la base
 * (empresa, alcance de dealers, empleado, suma del reparto, fecha ≤ hoy NY) se controla en el facade con error en
 * el campo.
 */
export class CreateExpenseDto {
  @ApiProperty({ example: '2026-11-02' })
  @Transform(trim)
  @IsString()
  @Matches(YMD_RE, { message: MSG_DATE_INVALID })
  ticketDate!: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idCompany?: number

  @ApiPropertyOptional({ description: 'Alta al vuelo («Create "…"»).' })
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
  @Transform(trim)
  @IsString()
  @MaxLength(DESCRIPTION_MAX, { message: msgTooLong(DESCRIPTION_MAX) })
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(RECEIPT_NUMBER_MAX, { message: msgTooLong(RECEIPT_NUMBER_MAX) })
  receiptNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(NOTES_MAX, { message: msgTooLong(NOTES_MAX) })
  notes?: string

  /** «Assign to employee» (117). Sin él, el usuario que carga. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idAuthor?: number

  @ApiProperty({ enum: EXPENSE_MODES })
  @IsIn(EXPENSE_MODES, { message: 'Choose how to split the amount.' })
  mode!: ExpenseMode

  /** Single branch. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1, { message: 'Choose a branch.' })
  idDealer?: number

  /** Single | Equal | By percentage. En By amount es la suma y no se escribe. */
  @ApiPropertyOptional({ example: '1250.00' })
  @IsOptional()
  @Transform(toMoneyString)
  @IsString()
  @Matches(AMOUNT_RE, { message: MSG_AMOUNT_INVALID })
  totalAmount?: string

  @ApiPropertyOptional({ type: [ExpenseBranchDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ExpenseBranchDto)
  branches?: ExpenseBranchDto[]

  /** Precarga desde una regla recurrente (F3): queda en cada fila para ver de dónde salió. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  idExpRepetitive?: number
}

/**
 * PUT /srs/expenses/:id — mismo cuerpo; `kind: 'group'` dice que :id es el groupId. `ticketDate` y `mode` son
 * opcionales: un grupo con alguna fila aprobada se edita mandando solo description, receiptNumber y notes (el
 * facade conserva lo demás); un gasto suelto o un grupo sin aprobadas los exige (400 en el campo si faltan).
 */
export class UpdateExpenseDto extends OmitType(CreateExpenseDto, ['ticketDate', 'mode'] as const) {
  @ApiPropertyOptional({ example: '2026-11-02' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(YMD_RE, { message: MSG_DATE_INVALID })
  ticketDate?: string

  @ApiPropertyOptional({ enum: EXPENSE_MODES })
  @IsOptional()
  @IsIn(EXPENSE_MODES, { message: 'Choose how to split the amount.' })
  mode?: ExpenseMode

  @ApiPropertyOptional({ enum: ['single', 'group'] })
  @IsOptional()
  @IsIn(['single', 'group'])
  kind?: 'single' | 'group'
}

/** POST /srs/expenses/:id/attachment-log — el BFF de adjuntos lo llama después de un 200 del Node. */
export class AttachmentLogDto {
  @ApiProperty({ example: 'receipt.jpg' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Enter the file name.' })
  @MaxLength(255, { message: msgTooLong(255) })
  filename!: string
}

export class ApprovalDto {
  @ApiProperty()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1' || value === 1) return true
    if (value === false || value === 'false' || value === '0' || value === 0) return false
    return value
  })
  @IsBoolean()
  approved!: boolean
}
