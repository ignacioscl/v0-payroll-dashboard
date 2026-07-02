import { Inject, Injectable } from '@nestjs/common'

import { CollectionsKpiRepository } from '../repository/collections-kpi.repository'
import { CollectionsByMonthQueryDto } from '../dto/collections-by-month.dto'
import { CollectionsKpiDto } from '../dto/collections-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'

@Injectable()
export class CollectionsKpiService {
  constructor(@Inject(CollectionsKpiRepository) private readonly repository: CollectionsKpiRepository) {}

  async getCollectionsKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<CollectionsKpiDto> {
    return this.repository.getCollectionsKpis(buildSrsKpiFilter(ctx, query))
  }

  async getArAging(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getArAging(buildSrsKpiFilter(ctx, query))
  }

  async getCollectionsByMonth(ctx: SrsContext, query: CollectionsByMonthQueryDto) {
    return this.repository.getCollectionsByMonth(
      buildSrsKpiFilter(ctx, query),
      query.historyMonths,
    )
  }
}
