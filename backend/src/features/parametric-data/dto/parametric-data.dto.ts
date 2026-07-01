import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsNumber, IsNumberString, IsOptional, IsString } from 'class-validator'

import { ParametricData } from '../entity/parametric-data.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class ParametricDataDto extends OmitType(ParametricData, [] as const) {}

export class UpdateParametricDataDto extends PartialType(ParametricDataDto) {}

export class ParametricDataQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by id parametric category', required: false })
  @IsNumberString()
  @IsOptional()
  idParametricCategory?: number

  @ApiProperty({ description: 'filter by id parent', required: false })
  @IsNumberString()
  @IsOptional()
  idParent?: number

  @ApiProperty({ description: 'include permission actions', required: false })
  @IsIn([0, 1, '0', '1'])
  @IsOptional()
  includePermissionActions?: 0 | 1

  @ApiProperty({ description: 'filter by id role', required: false })
  @IsNumberString()
  @IsOptional()
  idRole?: number
}

export class ParametricDataPaginationDto extends PaginationDto<ParametricDataDto> {
  @ApiProperty({ type: ParametricDataDto, isArray: true })
  data: ParametricDataDto[]
}
