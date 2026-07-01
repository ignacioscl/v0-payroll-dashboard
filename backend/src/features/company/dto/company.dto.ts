import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'

import { Company } from '../entity/company.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class CompanyDto extends OmitType(Company, [] as const) {}

export class UpdateCompanyDto extends PartialType(CompanyDto) {}

export class CompanyQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by company parent', required: false })
  @IsString()
  @IsOptional()
  idCompanyParent?: number

  @ApiProperty({ description: 'filter by is parent', required: false })
  @IsIn([0, 1, '0', '1'])
  @IsOptional()
  isParent?: 0 | 1
}

export class CompanyPaginationDto extends PaginationDto<CompanyDto> {
  @ApiProperty({ type: CompanyDto, isArray: true })
  data: CompanyDto[]
}
