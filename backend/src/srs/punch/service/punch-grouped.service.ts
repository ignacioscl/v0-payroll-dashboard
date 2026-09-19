import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { SRS_CONNECTION } from '../../srs.datasource'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchGroupedQueryDto, PunchGroupedResponseDto } from '../dto/punch-grouped.dto'
import { GroupedPunchRepository } from '../repository/punch-grouped.repository'
import { PunchAccessPolicyService } from '../punch-access-policy'
import { parseErrorTypes } from '../repository/punch-error-types'
import { parsePaymentTypeIds } from '../repository/punch-payment-types'
import { assertPaymentTypesInCatalog } from '../repository/punch-payment-type-catalog'

@Injectable()
export class GroupedPunchService {
  constructor(
    @Inject(GroupedPunchRepository) private readonly repository: GroupedPunchRepository,
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
    @InjectDataSource(SRS_CONNECTION) private readonly dataSource: DataSource,
  ) {}

  async getGrouped(ctx: SrsContext, query: PunchGroupedQueryDto): Promise<PunchGroupedResponseDto> {
    // Se parsea UNA vez, antes de la policy (ver T.0.5 del plan).
    const errorTypes = parseErrorTypes(query.errorTypes).values
    // Idem payment type: se parsea una vez y despues circula la forma canonica.
    // El `sort` entra a la policy porque ordenar POR payment type tambien es
    // usarlo (4.2.3bis).
    const idPaymentTypes = parsePaymentTypeIds(query.idPaymentTypes)
    const access = await this.policy.assertAndResolve(ctx, { ...query, errorTypes, idPaymentTypes })
    // Recien con el permiso confirmado se toca la base: los ids tienen que ser
    // del catalogo de ESTE provider, no cualquier entero (4.2.3ter).
    await assertPaymentTypesInCatalog(this.dataSource, ctx.idDealerProvider, idPaymentTypes)
    const filter = buildSrsKpiFilter(ctx, query)
    const response = await this.repository.getGrouped(filter, {
      errorTypes: access.effectiveErrorTypes,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
      sort: query.sort,
      dir: query.dir,
      minHoursTotal: query.minHoursTotal,
      maxHoursTotal: query.maxHoursTotal,
      idPaymentTypes,
      search: query.search,
      idEmployee: query.idEmployee,
      issueType: query.issueType,
      todayLiveStatus: query.todayLiveStatus,
      snapshotAt: query.snapshotAt,
      includeDeletedFixes: access.includeDeletedFixes,
      includePaymentTypeName: access.canViewPaymentTypeName,
    })
    // Sin Time Tracking > View Fake GPS la fila no lleva ni el dato (el ⚠ lo leería).
    if (!access.canViewFakeGps) {
      for (const row of response.results) delete row.fakeGpsEvents
    }
    return response
  }
}
