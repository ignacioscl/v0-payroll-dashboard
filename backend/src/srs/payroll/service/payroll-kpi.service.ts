import { Inject, Injectable } from '@nestjs/common'

import { PayrollKpiRepository } from '../repository/payroll-kpi.repository'
import { PayrollKpiDto } from '../dto/payroll-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'

/** Lógica de KPIs de payroll. Resuelve el tenant del usuario y delega al repo. */
@Injectable()
export class PayrollKpiService {
  constructor(@Inject(PayrollKpiRepository) private readonly repository: PayrollKpiRepository) {}

  async getPayrollKpis(ctx: SrsContext, fechaDesde: string, fechaHasta: string): Promise<PayrollKpiDto> {
    return this.repository.getPayrollKpis(ctx.idDealerProvider, fechaDesde, fechaHasta)
  }

  async getPayrollByType(ctx: SrsContext, fechaDesde: string, fechaHasta: string) {
    return this.repository.getPayrollByType(ctx.idDealerProvider, fechaDesde, fechaHasta)
  }
}
