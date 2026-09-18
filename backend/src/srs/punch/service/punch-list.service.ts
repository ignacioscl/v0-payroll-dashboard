import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { SRS_CONNECTION } from '../../srs.datasource'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchListQueryDto, PunchListResponseDto } from '../dto/punch-list.dto'
import { PunchListRepository } from '../repository/punch-list.repository'
import { PunchAccessPolicyService } from '../punch-access-policy'
import { parseErrorTypes } from '../repository/punch-error-types'
import { parsePaymentTypeIds } from '../repository/punch-payment-types'
import { assertCursorShape } from '../repository/punch-list-sort'
import { assertPaymentTypesInCatalog } from '../repository/punch-payment-type-catalog'

@Injectable()
export class PunchListService {
  constructor(
    @Inject(PunchListRepository) private readonly repository: PunchListRepository,
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
    @InjectDataSource(SRS_CONNECTION) private readonly dataSource: DataSource,
  ) {}

  async getList(ctx: SrsContext, query: PunchListQueryDto): Promise<PunchListResponseDto> {
    // Se parsea UNA vez, antes de la policy: de acá en adelante circula sólo la
    // forma canónica; ningún consumidor vuelve a mirar el string crudo.
    const errorTypes = parseErrorTypes(query.errorTypes).values
    // Idem payment type: se parsea una vez y despues circula la forma canonica.
    // El `sort` entra a la policy porque ordenar POR payment type tambien es
    // usarlo (4.2.3bis).
    const idPaymentTypes = parsePaymentTypeIds(query.idPaymentTypes)
    // Lleva el `sort` a proposito: la forma valida del cursor depende de si la
    // columna ordenada tiene tramo de vacios o no.
    assertCursorShape(query)
    const access = await this.policy.assertAndResolve(ctx, { ...query, errorTypes, idPaymentTypes })
    // Recien con el permiso confirmado se toca la base: los ids tienen que ser
    // del catalogo de ESTE provider, no cualquier entero (4.2.3ter).
    await assertPaymentTypesInCatalog(this.dataSource, ctx.idDealerProvider, idPaymentTypes)
    const filter = buildSrsKpiFilter(ctx, query)
    return this.repository.getList(filter, {
      errorTypes: access.effectiveErrorTypes,
      includeErrorType: access.includeErrorType,
      includeDeletedFixes: access.includeDeletedFixes,
      pageSize: query.pageSize ?? 25,
      sort: query.sort,
      dir: query.dir,
      afterValue: query.afterValue,
      afterId: query.afterId,
      afterEmpty: query.afterEmpty,
      minHours: query.minHours,
      maxHours: query.maxHours,
      idPaymentTypes,
      search: query.search,
      idEmployee: query.idEmployee,
      issueType: query.issueType,
      snapshotAt: query.snapshotAt,
      todayLiveStatus: query.todayLiveStatus,
      includeAmounts: access.canViewPaymentAmounts,
      includePaymentTypeName: access.canViewPaymentTypeName,
    })
  }
}
