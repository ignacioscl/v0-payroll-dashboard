import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator'

import { UserCompanyRel } from '../entity/user.company.rel.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class UserCompanyRelDto extends OmitType(UserCompanyRel, ['id', 'user', 'company', 'role'] as const) {
  @ApiProperty({
    description: 'ID del usuario',
    type: Number,
    required: true,
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  idUser!: number

  @ApiProperty({
    description: 'ID de la compañía',
    type: Number,
    required: true,
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  idCompany!: number

  @ApiProperty({
    description: 'ID del rol en esta compañía',
    type: Number,
    required: true,
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  idRole!: number
}

export class UpdateUserCompanyRelDto extends PartialType(UserCompanyRelDto) {}

export class UserCompanyRelQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsNumber()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by user id', required: false })
  @IsNumber()
  @IsOptional()
  idUser?: number

  @ApiProperty({ description: 'filter by company id', required: false })
  @IsNumber()
  @IsOptional()
  idCompany?: number

  @ApiProperty({ description: 'filter by role id', required: false })
  @IsNumber()
  @IsOptional()
  idRole?: number
}

export class UserCompanyRelPaginationDto extends PaginationDto<UserCompanyRelDto> {
  @ApiProperty({ type: UserCompanyRelDto, isArray: true })
  data: UserCompanyRelDto[]
}

export class DeleteUserCompanyRelDto {
  @ApiProperty({
    description: 'ID del usuario',
    type: Number,
    required: true,
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  idUser: number

  @ApiProperty({
    description: 'ID de la compañía',
    type: Number,
    required: true,
    example: 1,
  })
  @IsNotEmpty()
  @IsNumber()
  idCompany: number
}
