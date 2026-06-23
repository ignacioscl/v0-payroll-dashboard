import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

import { PunchKpiService } from '../service/punch-kpi.service'
import { PunchKpiDto, PunchOffenderRowDto } from '../dto/punch-kpi.dto'

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
    @Query() query: SrsKpiQueryDto,
  ): Promise<PunchKpiDto> {
    return this.service.getPunchKpis(request.srsContext, query)
  }

  @Get('/offenders')
  @ApiOkResponse({ type: [PunchOffenderRowDto] })
  async getOffenders(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<PunchOffenderRowDto[]> {
    return this.service.getOffenders(request.srsContext, query)
  }
}
