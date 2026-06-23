import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

import { PermissionAction } from '../entity/permission-action.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class PermissionActionDto extends OmitType(PermissionAction, [] as const) {}

export class UpdatePermissionActionDto extends PartialType(PermissionActionDto) {}

export class PermissionActionQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by codePage', required: false })
  @IsString()
  @IsOptional()
  codePage?: string
}

export class PermissionActionPaginationDto extends PaginationDto<PermissionActionDto> {
  @ApiProperty({ type: PermissionActionDto, isArray: true })
  data: PermissionActionDto[]
}
