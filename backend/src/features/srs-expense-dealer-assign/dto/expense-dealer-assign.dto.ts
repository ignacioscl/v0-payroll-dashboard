import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator'

import { MSG_AMOUNT_INVALID, MSG_PERCENT_INVALID } from 'src/features/srs-expense/rules/expense-rules'

/** Filtro del feature (lo que pide BaseRepository.fetch). */
export class ExpenseDealerAssignQueryDto {
  id?: number
  idExpRepetitive?: number
  page?: number
  pageSize?: number
}

const toOptionalBool = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return value
}
const toMoneyString = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined
  return typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value
}

/** POST /srs/expenses/recurring/:id/dealers */
export class AddDealersDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one dealer.' })
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  idDealers!: number[]

  /** «Don't block changes»: graba aunque la suma pase de 100. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBool)
  @IsBoolean()
  allowAnyTotal?: boolean
}

/**
 * PUT /srs/expenses/recurring/:id/dealers/:idAssign (pareja del input por fila de la tabla de dealers). Lo que
 * depende de la regla (Split, suma de los Manual) lo decide RecurringExpenseFacadeService con el texto del PHP.
 */
export class AssignDto {
  @ApiPropertyOptional({ description: 'By percent: true Automatic, false Manual.' })
  @IsOptional()
  @Transform(toOptionalBool)
  @IsBoolean()
  automatic?: boolean

  @ApiPropertyOptional({ description: 'By percent, Manual: 0–100 con dos decimales.' })
  @IsOptional()
  @Transform(toMoneyString)
  @IsString()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, { message: MSG_PERCENT_INVALID })
  percentage?: string

  @ApiPropertyOptional({ description: 'By fixed amount: el monto del dealer.' })
  @IsOptional()
  @Transform(toMoneyString)
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: MSG_AMOUNT_INVALID })
  fixedAmount?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBool)
  @IsBoolean()
  allowAnyTotal?: boolean
}

/** DELETE /srs/expenses/recurring/:id/dealers/:idAssign */
export class RemoveAssignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalBool)
  @IsBoolean()
  allowAnyTotal?: boolean
}

/** Un dealer de la regla como lo pinta la tabla (contrato `Assign`). */
export interface AssignRowDto {
  id: number
  dealer: { id: number; name: string }
  automatic: boolean
  percentage: string | null
  fixedAmount: string | null
}
