import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

import { BillingKpiService } from '../service/billing-kpi.service'
import {
  BillingKpiDto,
  BillingWeekRowDto,
  UnbilledAgingBucketDto,
  UnbilledDealerRowDto,
} from '../dto/billing-kpi.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/kpis/billing')
@ApiTags('SRS KPIs - Billing')
@ApiBearerAuth()
export class BillingKpiController {
  constructor(@Inject(BillingKpiService) private readonly service: BillingKpiService) {}

  @Get('/')
  @ApiOkResponse({ type: BillingKpiDto })
  async getBillingKpis(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<BillingKpiDto> {
    return this.service.getBillingKpis(request.srsContext, query)
  }

  @Get('/unbilled-aging')
  @ApiOkResponse({ type: [UnbilledAgingBucketDto] })
  async getUnbilledAging(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<UnbilledAgingBucketDto[]> {
    return this.service.getUnbilledAging(request.srsContext, query)
  }

  @Get('/by-week')
  @ApiOkResponse({ type: [BillingWeekRowDto] })
  async getBillingByWeek(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<BillingWeekRowDto[]> {
    return this.service.getBillingByWeek(request.srsContext, query)
  }

  @Get('/unbilled-by-dealer')
  @ApiOkResponse({ type: [UnbilledDealerRowDto] })
  async getUnbilledByDealer(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<UnbilledDealerRowDto[]> {
    return this.service.getUnbilledByDealer(request.srsContext, query)
  }
}
