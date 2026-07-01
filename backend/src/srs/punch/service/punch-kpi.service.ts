import { Inject, Injectable } from '@nestjs/common'

import { PunchKpiRepository } from '../repository/punch-kpi.repository'
import { PunchKpiDto } from '../dto/punch-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'

@Injectable()
export class PunchKpiService {
  constructor(@Inject(PunchKpiRepository) private readonly repository: PunchKpiRepository) {}

  async getPunchKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<PunchKpiDto> {
    return this.repository.getPunchKpis(buildSrsKpiFilter(ctx, query))
  }

  async getOffenders(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getOffenders(buildSrsKpiFilter(ctx, query))
  }
}
