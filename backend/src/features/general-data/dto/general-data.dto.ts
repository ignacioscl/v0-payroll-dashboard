import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsNumberString, IsOptional, IsString } from 'class-validator'

import { GeneralData } from '../entity/general-data.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class GeneralDataDto extends OmitType(GeneralData, [] as const) {}

export class UpdateGeneralDataDto extends PartialType(GeneralDataDto) {}

export class GeneralDataQueryDto extends RequestPaginationDto {
  @ApiProperty({ description: 'filter by id', required: false })
  @IsString()
  @IsOptional()
  id?: number

  @ApiProperty({ description: 'filter by id_category', required: false })
  @IsNumberString()
  @IsOptional()
  idCategory?: number

  @ApiProperty({ description: 'filter by id_user', required: false })
  @IsNumberString()
  @IsOptional()
  idUser?: number

  @ApiProperty({ description: 'filter by description', required: false })
  @IsString()
  @IsOptional()
  descriptionEquals?: string
}

export class GeneralDataPaginationDto extends PaginationDto<GeneralDataDto> {
  @ApiProperty({ type: GeneralDataDto, isArray: true })
  data: GeneralDataDto[]
}
