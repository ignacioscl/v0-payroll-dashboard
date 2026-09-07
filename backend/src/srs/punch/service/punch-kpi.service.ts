import { Inject, Injectable } from '@nestjs/common'

import { PunchKpiRepository } from '../repository/punch-kpi.repository'
import { PunchKpiDto } from '../dto/punch-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchAccessPolicyService } from '../punch-access-policy'

@Injectable()
export class PunchKpiService {
  constructor(
    @Inject(PunchKpiRepository) private readonly repository: PunchKpiRepository,
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
  ) {}

  /**
   * Usa el gate ESTRECHO, no `assertAndResolve()`: ese exige la acción de Punch
   * Report, y el consumidor vivo de estos KPI es `/reports/business-kpis`, que se
   * autoriza con Admin o Production Report. Reusar el gate completo metería un 403
   * donde hoy no lo hay.
   */
  async getPunchKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<PunchKpiDto> {
    const includeDeletedFixes = await this.policy.resolveDeletedVisibility(ctx)
    return this.repository.getPunchKpis(buildSrsKpiFilter(ctx, query), includeDeletedFixes)
  }

  async getOffenders(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getOffenders(buildSrsKpiFilter(ctx, query))
  }
}
