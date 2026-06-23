import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'

import { BillingKpiService } from '../service/billing-kpi.service'
import { BillingKpiDto, BillingKpiQueryDto, UnbilledAgingBucketDto } from '../dto/billing-kpi.dto'

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
    @Query() query: BillingKpiQueryDto,
  ): Promise<BillingKpiDto> {
    return this.service.getBillingKpis(request.srsContext, query.fechaDesde, query.fechaHasta)
  }

  @Get('/unbilled-aging')
  @ApiOkResponse({ type: [UnbilledAgingBucketDto] })
  async getUnbilledAging(@Req() request: any): Promise<UnbilledAgingBucketDto[]> {
    return this.service.getUnbilledAging(request.srsContext)
  }
}
