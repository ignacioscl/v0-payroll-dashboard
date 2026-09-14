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
import { PunchDealerRankingService } from '../service/punch-dealer-ranking.service'
import { PunchDealerRankingExportService } from '../service/punch-dealer-ranking-export.service'
import {
  PunchDealerRankingExportPrepareDto,
  PunchDealerRankingQueryDto,
  PunchDealerRankingResponseDto,
} from '../dto/punch-dealer-ranking.dto'
import {
  PunchExportPrepareResponseDto,
  PunchExportStatusDto,
  PunchExportTicketQueryDto,
} from '../dto/punch-export.dto'

/**
 * Ranking de dealers del Dashboard: la tarjeta "Dealers with most errors" (top 5) y
 * el modal "View all" leen de acá. El export del modal usa el mismo protocolo de
 * ticket que Punch Report: prepare → status → descarga.
 *
 * El guard va explícito porque no hay guard global.
 */
@UseGuards(SrsJwtGuard)
@Controller('/srs/punch/dealer-ranking')
@ApiTags('SRS Punch - Dashboard dealers ranking')
@ApiBearerAuth()
export class PunchDealerRankingController {
  constructor(
    @Inject(PunchDealerRankingService) private readonly service: PunchDealerRankingService,
    @Inject(PunchDealerRankingExportService)
    private readonly exportService: PunchDealerRankingExportService,
  ) {}

  @Get('/')
  @ApiOkResponse({ type: PunchDealerRankingResponseDto })
  async getRanking(
    @Req() request: { srsContext: SrsContext },
    @Query() query: PunchDealerRankingQueryDto,
  ): Promise<PunchDealerRankingResponseDto> {
    return this.service.getRanking(request.srsContext, query)
  }

  @Post('export/prepare')
  @ApiOkResponse({ type: PunchExportPrepareResponseDto })
  async prepareExport(
    @Req() request: { srsContext: SrsContext },
    @Body() body: PunchDealerRankingExportPrepareDto,
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
  async exportRanking(
    @Req() request: { srsContext: SrsContext },
    @Query() query: PunchExportTicketQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.exportService.download(request.srsContext, query.ticket, res)
  }
}
