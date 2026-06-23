import { Inject, Injectable } from '@nestjs/common'

import { CollectionsKpiRepository } from '../repository/collections-kpi.repository'
import { CollectionsKpiDto } from '../dto/collections-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'

/** Lógica de KPIs de cobranza. Resuelve el tenant del usuario y delega al repo. */
@Injectable()
export class CollectionsKpiService {
  constructor(@Inject(CollectionsKpiRepository) private readonly repository: CollectionsKpiRepository) {}

  async getCollectionsKpis(ctx: SrsContext, fechaDesde: string, fechaHasta: string): Promise<CollectionsKpiDto> {
    return this.repository.getCollectionsKpis(ctx.idDealerProvider, fechaDesde, fechaHasta)
  }

  async getArAging(ctx: SrsContext) {
    return this.repository.getArAging(ctx.idDealerProvider)
  }
}
