import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'

import { RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

export class RolTemplateQueryDto extends RequestPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idCompaniaOwner?: number

  @ApiPropertyOptional({ enum: ['1', '2'] })
  @IsOptional()
  @IsIn(['1', '2'])
  type?: string

  @ApiPropertyOptional({ enum: ['0', '1'] })
  @IsOptional()
  @IsIn(['0', '1'])
  estado?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  term?: string
}

export class CreateRolTemplateDto {
  @ApiProperty({ enum: [1, 2] })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  tipo!: number

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  nombre!: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ponderacion?: number | null
}

export class UpdateRolTemplateDto extends PartialType(CreateRolTemplateDto) {
  @ApiPropertyOptional({ enum: [0, 1] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  estado?: number

  /** tipo is immutable after create — strip in service */
  tipo?: never
}

export class RolAccionRelTemplateQueryDto extends RequestPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idRolTemplate?: number
}

export class RolActivityLogQueryDto extends RequestPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idRolTemplate?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idRol?: number
}

/** @deprecated Use RolActivityLogQueryDto */
export class RolTemplateLogQueryDto extends RolActivityLogQueryDto {}

export class SetRolTemplatePermissionsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  idsRolAccion!: number[]
}

export class CreateRolesFromTemplateDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  idDealers?: number[]
}
