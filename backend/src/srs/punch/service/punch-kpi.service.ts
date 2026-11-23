import { Inject, Injectable } from '@nestjs/common'

import { PunchKpiRepository } from '../repository/punch-kpi.repository'
import { PunchKpiDto } from '../dto/punch-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_REPORT_BUSINESS_KPIS, SrsPermissionRepository } from '../../auth/srs-permission.repository'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchAccessPolicyService } from '../punch-access-policy'

@Injectable()
export class PunchKpiService {
  constructor(
    @Inject(PunchKpiRepository) private readonly repository: PunchKpiRepository,
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  /**
   * La tab Punch Quality de Business KPIs, su único consumidor: «Report Pro > Business KPIs» (148, tema 10 de
   * plans/plan-reunion-juan-18-11; antes no pedía nada). De la política de Punch usa solo el gate ESTRECHO, no
   * `assertAndResolve()`: ese exige la acción de Punch Report y metería un 403 a quien tiene Business KPIs sin Punch
   * Report.
   */
  async getPunchKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<PunchKpiDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_REPORT_BUSINESS_KPIS)
    const includeDeletedFixes = await this.policy.resolveDeletedVisibility(ctx)
    return this.repository.getPunchKpis(buildSrsKpiFilter(ctx, query), includeDeletedFixes)
  }

  async getOffenders(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getOffenders(buildSrsKpiFilter(ctx, query))
  }
}
