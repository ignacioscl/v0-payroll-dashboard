import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

import { Template } from '../entity/template'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class TemplateDto extends OmitType(Template, [] as const) {}

export class UpdateTemplateDto extends PartialType(TemplateDto) {}

export class TemplateQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number
}

export class TemplatePaginationDto extends PaginationDto<TemplateDto> {
  @ApiProperty({ type: TemplateDto, isArray: true })
  data: TemplateDto[]
}
