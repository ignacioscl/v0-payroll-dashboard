import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

import { ParametricDataCategory } from '../entity/parametric-data-category.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class ParametricDataCategoryDto extends OmitType(ParametricDataCategory, [] as const) {}

export class UpdateParametricDataCategoryDto extends PartialType(ParametricDataCategoryDto) {}

export class ParametricDataCategoryQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number
}

export class ParametricDataCategoryPaginationDto extends PaginationDto<ParametricDataCategoryDto> {
  @ApiProperty({ type: ParametricDataCategoryDto, isArray: true })
  data: ParametricDataCategoryDto[]
}
