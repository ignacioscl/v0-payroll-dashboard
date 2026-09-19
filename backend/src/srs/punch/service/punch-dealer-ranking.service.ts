import { Inject, Injectable } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchAccessPolicyService } from '../punch-access-policy'
import {
  PunchDealerRankingQueryDto,
  PunchDealerRankingResponseDto,
} from '../dto/punch-dealer-ranking.dto'
import { PunchDealerRankingRepository } from '../repository/punch-dealer-ranking.repository'
import { parseErrorTypes } from '../repository/punch-error-types'

@Injectable()
export class PunchDealerRankingService {
  constructor(
    @Inject(PunchDealerRankingRepository)
    private readonly repository: PunchDealerRankingRepository,
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
  ) {}

  /**
   * Los dos rankings, Pending y Corrected, en una sola respuesta y sin LIMIT: la
   * tarjeta del Dashboard muestra los primeros 5 de la misma lista que el modal.
   */
  async getRanking(
    ctx: SrsContext,
    query: PunchDealerRankingQueryDto,
  ): Promise<PunchDealerRankingResponseDto> {
    // Se parsea UNA vez, antes del gate, y después circula la forma canónica.
    const errorTypes = parseErrorTypes(query.errorTypes).values
    // Gate SIN la acción de Punch Report: paridad con el resumen PHP (ver la policy).
    const access = await this.policy.assertDashboardRanking(ctx, query.idDealer, errorTypes)
    const filter = buildSrsKpiFilter(ctx, query)
    const opts = {
      errorTypes: access.effectiveErrorTypes,
      search: query.search,
      includeDeletedFixes: access.includeDeletedFixes,
    }
    // En serie, NO con Promise.all: el pool de Nest es de 5 conexiones y así se
    // ocupa una sola.
    const pending = await this.repository.getPendingByDealer(filter, opts)
    const corrected = await this.repository.getCorrectedByDealer(filter, opts)
    return { pending, corrected }
  }
}
