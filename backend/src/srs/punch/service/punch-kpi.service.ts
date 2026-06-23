import { Inject, Injectable } from '@nestjs/common'

import { PunchKpiRepository } from '../repository/punch-kpi.repository'
import { PunchKpiDto } from '../dto/punch-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'

/** Lógica de KPIs de calidad de ponchadas. Resuelve el tenant y delega al repo. */
@Injectable()
export class PunchKpiService {
  constructor(@Inject(PunchKpiRepository) private readonly repository: PunchKpiRepository) {}

  async getPunchKpis(ctx: SrsContext, fechaDesde: string, fechaHasta: string): Promise<PunchKpiDto> {
    return this.repository.getPunchKpis(ctx.idDealerProvider, fechaDesde, fechaHasta)
  }

  async getOffenders(ctx: SrsContext, fechaDesde: string, fechaHasta: string) {
    return this.repository.getOffenders(ctx.idDealerProvider, ctx.idUsuario, fechaDesde, fechaHasta)
  }
}
