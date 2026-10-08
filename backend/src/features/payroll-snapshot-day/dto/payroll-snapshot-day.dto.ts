import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString } from 'class-validator'

export class PayrollSnapshotDayQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  idContratista?: number

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsString()
  periodoDesde?: string
}
