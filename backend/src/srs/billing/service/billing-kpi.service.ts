import { Inject, Injectable } from '@nestjs/common'

import { BillingKpiRepository } from '../repository/billing-kpi.repository'
import { BillingKpiDto } from '../dto/billing-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'

@Injectable()
export class BillingKpiService {
  constructor(@Inject(BillingKpiRepository) private readonly repository: BillingKpiRepository) {}

  async getBillingKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<BillingKpiDto> {
    return this.repository.getBillingKpis(buildSrsKpiFilter(ctx, query))
  }

  async getUnbilledAging(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getUnbilledAging(buildSrsKpiFilter(ctx, query))
  }
}
