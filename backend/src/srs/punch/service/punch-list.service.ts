import { Inject, Injectable } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchListQueryDto, PunchListResponseDto } from '../dto/punch-list.dto'
import { PunchListRepository } from '../repository/punch-list.repository'

@Injectable()
export class PunchListService {
  constructor(@Inject(PunchListRepository) private readonly repository: PunchListRepository) {}

  async getList(ctx: SrsContext, query: PunchListQueryDto): Promise<PunchListResponseDto> {
    const filter = buildSrsKpiFilter(ctx, query)
    return this.repository.getList(filter, {
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
    })
  }
}
