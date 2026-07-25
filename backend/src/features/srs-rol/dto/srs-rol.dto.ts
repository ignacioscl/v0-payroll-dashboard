import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator'

import { RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

export class SrsRolQueryDto extends RequestPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idTemplate?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idCompaniaOwner?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idDealer?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  tipo?: number
}

export class RolAccionRelQueryDto extends RequestPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  idRol?: number
}

export class SetSrsRolPermissionsDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  idsRolAccion!: number[]

  @ApiPropertyOptional()
  @IsBoolean()
  checked!: boolean
}
