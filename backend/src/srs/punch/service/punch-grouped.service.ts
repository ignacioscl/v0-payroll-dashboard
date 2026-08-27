import { Inject, Injectable } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchGroupedQueryDto, PunchGroupedResponseDto } from '../dto/punch-grouped.dto'
import { GroupedPunchRepository } from '../repository/punch-grouped.repository'
import { PunchAccessPolicyService } from '../punch-access-policy'

@Injectable()
export class GroupedPunchService {
  constructor(
    @Inject(GroupedPunchRepository) private readonly repository: GroupedPunchRepository,
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
  ) {}

  async getGrouped(ctx: SrsContext, query: PunchGroupedQueryDto): Promise<PunchGroupedResponseDto> {
    const access = await this.policy.assertAndResolve(ctx, query)
    const filter = buildSrsKpiFilter(ctx, query)
    return this.repository.getGrouped(filter, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
      sort: query.sort,
      dir: query.dir,
      minHoursTotal: query.minHoursTotal,
      maxHoursTotal: query.maxHoursTotal,
      idPaymentType: query.idPaymentType,
      search: query.search,
      idEmployee: query.idEmployee,
      issueType: query.issueType,
      snapshotAt: query.snapshotAt,
      includePaymentTypeName: access.canViewPaymentTypeName,
    })
  }
}
