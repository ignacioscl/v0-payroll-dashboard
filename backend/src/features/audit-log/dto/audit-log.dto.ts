import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator'
import { Type } from 'class-transformer'

import { AuditLog } from '../entity/audit-log.entity'
import { PaginationDto, RequestPaginationDto } from 'src/commons/pagination/Pagination.dto'

export class AuditLogDto extends OmitType(AuditLog, [] as const) {}

export class UpdateAuditLogDto extends PartialType(AuditLogDto) {}

export class AuditLogQueryDto extends RequestPaginationDto {
  @ApiProperty({
    description: 'ID del log',
    example: 1,
    required: false,
  })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  id?: number

  @ApiProperty({
    description: 'Nombre de la tabla',
    example: 'module_route',
    required: false,
  })
  @IsString()
  @IsOptional()
  tableName?: string

  @ApiProperty({
    description: 'ID del registro',
    example: 8,
    required: false,
  })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  recordId?: number
}

export class AuditLogPaginationDto extends PaginationDto<AuditLogDto> {
  @ApiProperty({ type: AuditLogDto, isArray: true })
  data: AuditLogDto[]
}
