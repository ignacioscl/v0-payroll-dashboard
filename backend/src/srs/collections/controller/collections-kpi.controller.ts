import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

import { CollectionsKpiService } from '../service/collections-kpi.service'
import { CollectionsByMonthQueryDto, CollectionsByMonthRowDto } from '../dto/collections-by-month.dto'
import { ArAgingBucketDto, CollectionsKpiDto } from '../dto/collections-kpi.dto'

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
    @Query() query: SrsKpiQueryDto,
  ): Promise<CollectionsKpiDto> {
    return this.service.getCollectionsKpis(request.srsContext, query)
  }

  @Get('/ar-aging')
  @ApiOkResponse({ type: [ArAgingBucketDto] })
  async getArAging(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<ArAgingBucketDto[]> {
    return this.service.getArAging(request.srsContext, query)
  }

  @Get('/by-month')
  @ApiOkResponse({ type: [CollectionsByMonthRowDto] })
  async getCollectionsByMonth(
    @Req() request: any,
    @Query() query: CollectionsByMonthQueryDto,
  ): Promise<CollectionsByMonthRowDto[]> {
    return this.service.getCollectionsByMonth(request.srsContext, query)
  }
}
