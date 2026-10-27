import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import { BillingKpiRepository } from '../repository/billing-kpi.repository'
import {
  BillingKpiDto,
  IncomeByDealerDto,
  RemovedDealersAvailableDto,
  RemovedDealersAvailableQueryDto,
} from '../dto/billing-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_PRODUCTION_REPORT, SrsPermissionRepository } from '../../auth/srs-permission.repository'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { parseFilterDateDone, skipDealerRestrictionForRol } from '../../shared/kpi/srs-kpi-dealer-filter'

/** Header range split by calendar year, each year cropped to the range (D1). */
export function splitRangeByYear(
  fechaDesde: string,
  fechaHasta: string,
): { year: number; fechaDesde: string; fechaHasta: string; partial: boolean }[] {
  const from = String(fechaDesde).slice(0, 10)
  const to = String(fechaHasta).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new BadRequestException('fechaDesde must be on or before fechaHasta')
  }
  const out: { year: number; fechaDesde: string; fechaHasta: string; partial: boolean }[] = []
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const start = from > yearStart ? from : yearStart
    const end = to < yearEnd ? to : yearEnd
    out.push({ year, fechaDesde: start, fechaHasta: end, partial: start !== yearStart || end !== yearEnd })
  }
  return out
}

@Injectable()
export class BillingKpiService {
  constructor(
    @Inject(BillingKpiRepository) private readonly repository: BillingKpiRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  async getBillingKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<BillingKpiDto> {
    return this.repository.getBillingKpis(buildSrsKpiFilter(ctx, query))
  }

  async getUnbilledAging(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getUnbilledAging(buildSrsKpiFilter(ctx, query))
  }

  async getBillingByWeek(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getBillingByWeek(buildSrsKpiFilter(ctx, query))
  }

  async getUnbilledByDealer(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getUnbilledByDealer(buildSrsKpiFilter(ctx, query))
  }

  async getPeriodCollectionKpis(ctx: SrsContext, query: SrsKpiQueryDto) {
    return this.repository.getPeriodCollectionKpis(buildSrsKpiFilter(ctx, query))
  }

  /**
   * Reports > Income by Dealer: Admin General / Admin Company, or «Reports > Production Report»
   * (the same people that see the Billing tab of Business KPIs).
   */
  async getIncomeByDealer(ctx: SrsContext, query: SrsKpiQueryDto): Promise<IncomeByDealerDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_PRODUCTION_REPORT)
    const filter = buildSrsKpiFilter(ctx, query)
    const years = await this.repository.getIncomeByDealer(filter, splitRangeByYear(filter.fechaDesde, filter.fechaHasta))
    const grandCents = years.reduce((acc, y) => acc + Math.round(y.total * 100), 0)
    return { years, grandTotal: grandCents / 100 }
  }

  /**
   * «Include removed dealers» is shown only when this says there is something to show.
   * Company = the session one (never from the request). Users that do not see every dealer of
   * their company (anyone but Admin General / Admin Company) get false without a query.
   */
  async getRemovedDealersAvailable(
    ctx: SrsContext,
    query: RemovedDealersAvailableQueryDto,
  ): Promise<RemovedDealersAvailableDto> {
    if (!skipDealerRestrictionForRol(ctx.idRol)) {
      return { available: false }
    }
    const hasFrom = !!query.fechaDesde
    const hasTo = !!query.fechaHasta
    if (hasFrom !== hasTo) {
      throw new BadRequestException('fechaDesde and fechaHasta go together')
    }
    let range: { fechaDesde: string; fechaHasta: string } | null = null
    if (hasFrom) {
      range = { fechaDesde: String(query.fechaDesde).slice(0, 10), fechaHasta: String(query.fechaHasta).slice(0, 10) }
      if (range.fechaDesde > range.fechaHasta) {
        throw new BadRequestException('fechaDesde must be on or before fechaHasta')
      }
    }
    const available = await this.repository.hasRemovedDealersWithMoney(
      ctx.idDealerProvider,
      range,
      parseFilterDateDone(query.filterDateDone),
    )
    return { available }
  }
}
