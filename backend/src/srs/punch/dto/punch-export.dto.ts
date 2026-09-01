import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator'

import { IsValidPunchDateRange } from '../punch-date-range'
import { PUNCH_ISSUE_TYPES } from '../punch-issue-types'
import { PUNCH_LIST_LIVE_STATUS, PunchListLiveStatus } from './punch-list.dto'

export class PunchExportPrepareDto {
  @ApiProperty({ example: '2026-04-01' })
  @IsDateString()
  @IsNotEmpty()
  fechaDesde!: string

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  @IsNotEmpty()
  @IsValidPunchDateRange()
  fechaHasta!: string

  @ApiProperty({ example: '12,34' })
  @IsString()
  @IsNotEmpty()
  idDealer!: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minHours?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxHours?: number

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idPaymentType?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idEmployee?: number

  @ApiPropertyOptional({ enum: PUNCH_ISSUE_TYPES })
  @IsOptional()
  @IsIn(PUNCH_ISSUE_TYPES as unknown as string[])
  issueType?: string

  @ApiPropertyOptional({
    description: 'Lista blanca de tipos de error (1,2,3). Ausente = 1,2,3.',
    example: '1,3',
  })
  @IsOptional()
  @Matches(/^[123](,[123]){0,2}$/, {
    message: 'errorTypes must be a comma-separated list of 1, 2 and/or 3.',
  })
  errorTypes?: string

  @ApiPropertyOptional({ enum: PUNCH_LIST_LIVE_STATUS })
  @IsOptional()
  @IsIn(PUNCH_LIST_LIVE_STATUS as unknown as string[])
  todayLiveStatus?: PunchListLiveStatus
}

export class PunchExportPrepareResponseDto {
  @ApiProperty()
  ticket!: string

  @ApiProperty()
  expiresAt!: string
}

export class PunchExportTicketQueryDto {
  @ApiProperty()
  @IsUUID()
  ticket!: string
}

export class PunchExportStatusDto {
  @ApiProperty({ enum: ['pending', 'running', 'done', 'error'] })
  status!: 'pending' | 'running' | 'done' | 'error'

  @ApiPropertyOptional()
  errorMessage?: string
}
