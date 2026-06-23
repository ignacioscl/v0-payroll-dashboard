import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { Type } from 'class-transformer'

import { RolePermissionAction } from '../entity/role-permission-action.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class RolePermissionActionDto extends OmitType(RolePermissionAction, [] as const) {}

export class UpdateRolePermissionActionDto extends PartialType(RolePermissionActionDto) {}

export class RolePermissionActionQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by idRole', required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  idRole?: number
}

export class RolePermissionActionPaginationDto extends PaginationDto<RolePermissionActionDto> {
  @ApiProperty({ type: RolePermissionActionDto, isArray: true })
  data: RolePermissionActionDto[]
}
