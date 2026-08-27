import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { PunchListService } from '../service/punch-list.service'
import { PunchExportService } from '../service/punch-export.service'
import { PunchListQueryDto, PunchListResponseDto } from '../dto/punch-list.dto'
import {
  PunchExportPrepareDto,
  PunchExportPrepareResponseDto,
  PunchExportStatusDto,
  PunchExportTicketQueryDto,
} from '../dto/punch-export.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/punch/list')
@ApiTags('SRS Punch - Individual list (keyset)')
@ApiBearerAuth()
export class PunchListController {
  constructor(
    @Inject(PunchListService) private readonly service: PunchListService,
    @Inject(PunchExportService) private readonly exportService: PunchExportService,
  ) {}

  @Get('/')
  @ApiOkResponse({ type: PunchListResponseDto })
  async getList(
    @Req() request: { srsContext: SrsContext },
    @Query() query: PunchListQueryDto,
  ): Promise<PunchListResponseDto> {
    return this.service.getList(request.srsContext, query)
  }

  @Post('export/prepare')
  @ApiOkResponse({ type: PunchExportPrepareResponseDto })
  async prepareExport(
    @Req() request: { srsContext: SrsContext },
    @Body() body: PunchExportPrepareDto,
  ): Promise<PunchExportPrepareResponseDto> {
    return this.exportService.prepare(request.srsContext, body)
  }

  @Get('export/status')
  @ApiOkResponse({ type: PunchExportStatusDto })
  getExportStatus(
    @Req() request: { srsContext: SrsContext },
    @Query() query: PunchExportTicketQueryDto,
  ): PunchExportStatusDto {
    return this.exportService.getStatus(request.srsContext, query.ticket)
  }

  @Get('export')
  async exportList(
    @Req() request: { srsContext: SrsContext },
    @Query() query: PunchExportTicketQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.exportService.streamToResponse(request.srsContext, query.ticket, res)
  }
}
