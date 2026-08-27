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
