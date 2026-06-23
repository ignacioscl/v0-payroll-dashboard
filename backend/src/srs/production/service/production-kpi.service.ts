import { Inject, Injectable } from '@nestjs/common'

import { ProductionKpiRepository } from '../repository/production-kpi.repository'
import { ProductionKpiDto, WoStatusSliceDto } from '../dto/production-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'

@Injectable()
export class ProductionKpiService {
  constructor(
    @Inject(ProductionKpiRepository) private readonly repository: ProductionKpiRepository,
  ) {}

  async getProductionKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<ProductionKpiDto> {
    return this.repository.getProductionKpis(buildSrsKpiFilter(ctx, query))
  }

  async getOpenPipeline(ctx: SrsContext, query: SrsKpiQueryDto): Promise<WoStatusSliceDto[]> {
    return this.repository.getOpenPipeline(buildSrsKpiFilter(ctx, query))
  }

  async getDealerProduction(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getDealerProduction(buildSrsKpiFilter(ctx, query))
  }
}
