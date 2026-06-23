import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { SrsJwtGuard } from '../../auth/srs-jwt.guard'

import { ProductionKpiService } from '../service/production-kpi.service'
import {
  DealerProductionRowDto,
  ProductionKpiDto,
  ProductionKpiQueryDto,
  WoStatusSliceDto,
} from '../dto/production-kpi.dto'

/**
 * KPIs de producción (SRS legacy, solo lectura).
 * SOLO HTTP: valida el JWT (SrsJwtGuard) y delega. El contexto del usuario
 * (provider + dealers + restricciones) sale de request.srsContext, nunca del cliente.
 */
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
    @Query() query: ProductionKpiQueryDto,
  ): Promise<ProductionKpiDto> {
    return this.service.getProductionKpis(request.srsContext, query.fechaDesde, query.fechaHasta)
  }

  @Get('/pipeline')
  @ApiOkResponse({ type: [WoStatusSliceDto] })
  async getOpenPipeline(@Req() request: any): Promise<WoStatusSliceDto[]> {
    return this.service.getOpenPipeline(request.srsContext)
  }

  @Get('/by-dealer')
  @ApiOkResponse({ type: [DealerProductionRowDto] })
  async getDealerProduction(
    @Req() request: any,
    @Query() query: ProductionKpiQueryDto,
  ): Promise<DealerProductionRowDto[]> {
    return this.service.getDealerProduction(request.srsContext, query.fechaDesde, query.fechaHasta)
  }
}
