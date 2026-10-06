import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional } from 'class-validator'

export class JobRunLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  id?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  idJobRun?: number
}
