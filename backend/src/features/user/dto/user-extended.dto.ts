import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

import { UserExtended } from '../entity/user-extended.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class UserExtendedDto extends OmitType(UserExtended, ['id', 'user'] as const) {
  // Sin validaciones automáticas - se validan programáticamente en el servicio
}

export class UpdateUserExtendedDto extends PartialType(UserExtendedDto) {}

export class UserExtendedQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by documentNumber', required: false })
  @IsString()
  @IsOptional()
  documentNumber?: string

  @ApiProperty({ description: 'filter by phone', required: false })
  @IsString()
  @IsOptional()
  phone?: string
}

export class UserExtendedPaginationDto extends PaginationDto<UserExtendedDto> {
  @ApiProperty({ type: UserExtendedDto, isArray: true })
  data: UserExtendedDto[]
}
