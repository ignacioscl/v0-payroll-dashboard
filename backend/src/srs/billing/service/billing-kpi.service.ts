import { Inject, Injectable } from '@nestjs/common'

import { BillingKpiRepository } from '../repository/billing-kpi.repository'
import { BillingKpiDto } from '../dto/billing-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'

/** Lógica de KPIs de billing. Resuelve el tenant del usuario y delega al repo. */
@Injectable()
export class BillingKpiService {
  constructor(@Inject(BillingKpiRepository) private readonly repository: BillingKpiRepository) {}

  async getBillingKpis(ctx: SrsContext, fechaDesde: string, fechaHasta: string): Promise<BillingKpiDto> {
    return this.repository.getBillingKpis(ctx.idDealerProvider, fechaDesde, fechaHasta)
  }

  async getUnbilledAging(ctx: SrsContext) {
    return this.repository.getUnbilledAging(ctx.idDealerProvider)
  }
}
