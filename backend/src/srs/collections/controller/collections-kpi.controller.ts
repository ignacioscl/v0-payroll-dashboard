import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'

import { CollectionsKpiService } from '../service/collections-kpi.service'
import { ArAgingBucketDto, CollectionsKpiDto, CollectionsKpiQueryDto } from '../dto/collections-kpi.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/kpis/collections')
@ApiTags('SRS KPIs - Collections')
@ApiBearerAuth()
export class CollectionsKpiController {
  constructor(@Inject(CollectionsKpiService) private readonly service: CollectionsKpiService) {}

  @Get('/')
  @ApiOkResponse({ type: CollectionsKpiDto })
  async getCollectionsKpis(
    @Req() request: any,
    @Query() query: CollectionsKpiQueryDto,
  ): Promise<CollectionsKpiDto> {
    return this.service.getCollectionsKpis(request.srsContext, query.fechaDesde, query.fechaHasta)
  }

  @Get('/ar-aging')
  @ApiOkResponse({ type: [ArAgingBucketDto] })
  async getArAging(@Req() request: any): Promise<ArAgingBucketDto[]> {
    return this.service.getArAging(request.srsContext)
  }
}
