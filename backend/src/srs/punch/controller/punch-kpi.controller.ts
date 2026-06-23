import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'

import { PunchKpiService } from '../service/punch-kpi.service'
import { PunchKpiDto, PunchKpiQueryDto, PunchOffenderRowDto } from '../dto/punch-kpi.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/kpis/punch')
@ApiTags('SRS KPIs - Punch Quality')
@ApiBearerAuth()
export class PunchKpiController {
  constructor(@Inject(PunchKpiService) private readonly service: PunchKpiService) {}

  @Get('/')
  @ApiOkResponse({ type: PunchKpiDto })
  async getPunchKpis(
    @Req() request: any,
    @Query() query: PunchKpiQueryDto,
  ): Promise<PunchKpiDto> {
    return this.service.getPunchKpis(request.srsContext, query.fechaDesde, query.fechaHasta)
  }

  @Get('/offenders')
  @ApiOkResponse({ type: [PunchOffenderRowDto] })
  async getOffenders(
    @Req() request: any,
    @Query() query: PunchKpiQueryDto,
  ): Promise<PunchOffenderRowDto[]> {
    return this.service.getOffenders(request.srsContext, query.fechaDesde, query.fechaHasta)
  }
}
