import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsNumberString, IsOptional, IsString } from 'class-validator'

import { Role } from '../entity/role.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class RoleDto extends OmitType(Role, ['idCompany'] as const) {}

export class UpdateRoleDto extends PartialType(RoleDto) {}

export class RoleQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by idCompany', required: false })
  @IsNumberString()
  @IsOptional()
  idCompany?: number

  @ApiProperty({ description: 'filter by roleName', required: false })
  @IsString()
  @IsOptional()
  roleName?: string
}

export class RolePaginationDto extends PaginationDto<RoleDto> {
  @ApiProperty({ type: RoleDto, isArray: true })
  data: RoleDto[]
}
