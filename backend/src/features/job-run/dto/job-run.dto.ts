import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/** Filtros del listado de corridas (`GET /api/jobs/runs`). */
export class JobRunQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  id?: number

  @ApiPropertyOptional({ example: 'payroll-snapshot' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number
}

/** Cuerpo de `POST /api/jobs/:name/run`. */
export class JobRunRequestDto {
  @ApiPropertyOptional({ example: { idContratista: 79, desde: '2026-07-01', hasta: '2026-07-15' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force?: boolean
}
