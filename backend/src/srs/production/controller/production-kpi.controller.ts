import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'

import { ProductionKpiService } from '../service/production-kpi.service'
import {
  DealerProductionRowDto,
  ProductionKpiDto,
  ProductionWeekRowDto,
  WoStatusSliceDto,
} from '../dto/production-kpi.dto'

@UseGuards(SrsJwtGuard)
@Controller('/srs/kpis/production')
@ApiTags('SRS KPIs - Production')
@ApiBearerAuth()
export class ProductionKpiController {
  constructor(@Inject(ProductionKpiService) private readonly service: ProductionKpiService) {}

  @Get('/')
  @ApiOkResponse({ type: ProductionKpiDto })
  async getProductionKpis(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<ProductionKpiDto> {
    return this.service.getProductionKpis(request.srsContext, query)
  }

  @Get('/pipeline')
  @ApiOkResponse({ type: [WoStatusSliceDto] })
  async getOpenPipeline(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<WoStatusSliceDto[]> {
    return this.service.getOpenPipeline(request.srsContext, query)
  }

  @Get('/by-dealer')
  @ApiOkResponse({ type: [DealerProductionRowDto] })
  async getDealerProduction(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<DealerProductionRowDto[]> {
    return this.service.getDealerProduction(request.srsContext, query)
  }

  @Get('/by-week')
  @ApiOkResponse({ type: [ProductionWeekRowDto] })
  async getProductionByWeek(
    @Req() request: any,
    @Query() query: SrsKpiQueryDto,
  ): Promise<ProductionWeekRowDto[]> {
    return this.service.getProductionByWeek(request.srsContext, query)
  }
}
