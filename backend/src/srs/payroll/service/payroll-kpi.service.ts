import { Inject, Injectable } from '@nestjs/common'

import { PayrollKpiRepository } from '../repository/payroll-kpi.repository'
import { PayrollKpiDto } from '../dto/payroll-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'

@Injectable()
export class PayrollKpiService {
  constructor(@Inject(PayrollKpiRepository) private readonly repository: PayrollKpiRepository) {}

  async getPayrollKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<PayrollKpiDto> {
    return this.repository.getPayrollKpis(buildSrsKpiFilter(ctx, query))
  }

  async getPayrollByType(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getPayrollByType(buildSrsKpiFilter(ctx, query))
  }
}
