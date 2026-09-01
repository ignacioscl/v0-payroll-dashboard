import { Inject, Injectable } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchListQueryDto, PunchListResponseDto } from '../dto/punch-list.dto'
import { PunchListRepository } from '../repository/punch-list.repository'
import { PunchAccessPolicyService } from '../punch-access-policy'
import { parseErrorTypes } from '../repository/punch-error-types'

@Injectable()
export class PunchListService {
  constructor(
    @Inject(PunchListRepository) private readonly repository: PunchListRepository,
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
  ) {}

  async getList(ctx: SrsContext, query: PunchListQueryDto): Promise<PunchListResponseDto> {
    // Se parsea UNA vez, antes de la policy: de acá en adelante circula sólo la
    // forma canónica; ningún consumidor vuelve a mirar el string crudo.
    const errorTypes = parseErrorTypes(query.errorTypes).values
    const access = await this.policy.assertAndResolve(ctx, { ...query, errorTypes })
    const filter = buildSrsKpiFilter(ctx, query)
    return this.repository.getList(filter, {
      errorTypes,
      includeErrorType: access.includeErrorType,
      pageSize: query.pageSize ?? 25,
      sort: query.sort,
      dir: query.dir,
      afterValue: query.afterValue,
      afterId: query.afterId,
      minHours: query.minHours,
      maxHours: query.maxHours,
      idPaymentType: query.idPaymentType,
      search: query.search,
      idEmployee: query.idEmployee,
      issueType: query.issueType,
      todayLiveStatus: query.todayLiveStatus,
      includeAmounts: access.canViewPaymentAmounts,
      includePaymentTypeName: access.canViewPaymentTypeName,
    })
  }
}
