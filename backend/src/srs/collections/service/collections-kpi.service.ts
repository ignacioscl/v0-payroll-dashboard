import { Inject, Injectable } from '@nestjs/common'

import { CollectionsKpiRepository } from '../repository/collections-kpi.repository'
import { CollectionsByMonthQueryDto } from '../dto/collections-by-month.dto'
import { CollectionsKpiDto, OutstandingArDto, OutstandingQueryDto } from '../dto/collections-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_REPORT_BUSINESS_KPIS, SrsPermissionRepository } from '../../auth/srs-permission.repository'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter, buildSrsKpiFilterNoPeriod } from '../../shared/kpi/srs-kpi-filter'

@Injectable()
export class CollectionsKpiService {
  constructor(
    @Inject(CollectionsKpiRepository) private readonly repository: CollectionsKpiRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  /**
   * The Open AR tab of Business KPIs, its only consumer: «Report Pro > Business KPIs» (148, tema 10 of
   * plans/plan-reunion-juan-18-11). Before, it asked nothing.
   */
  async getCollectionsKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<CollectionsKpiDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_REPORT_BUSINESS_KPIS)
    return this.repository.getCollectionsKpis(buildSrsKpiFilter(ctx, query))
  }

  /** Outstanding AR with no period, for the "Owed, all dates" card of the invoice list. */
  async getOutstanding(ctx: SrsContext, query: OutstandingQueryDto): Promise<OutstandingArDto> {
    const { outstandingAr, openStatements } = await this.repository.getOutstanding(
      buildSrsKpiFilterNoPeriod(ctx, query),
    )
    return { outstandingAr, openStatements }
  }

  async getArAging(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getArAging(buildSrsKpiFilter(ctx, query))
  }

  /** The by-month chart of the Open AR tab of Business KPIs: same permission as getCollectionsKpis. */
  async getCollectionsByMonth(ctx: SrsContext, query: CollectionsByMonthQueryDto) {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_REPORT_BUSINESS_KPIS)
    return this.repository.getCollectionsByMonth(
      buildSrsKpiFilter(ctx, query),
      query.historyMonths,
    )
  }
}
