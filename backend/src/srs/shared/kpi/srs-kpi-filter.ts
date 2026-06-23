import { BadRequestException } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from './srs-kpi-query.dto'
import { parseDealerIds, parseFilterDateDone } from './srs-kpi-dealer-filter'

export interface SrsKpiFilter {
  idDealerProvider: number
  idUsuario: number
  dealerIds: number[]
  fechaDesde: string
  fechaHasta: string
  /** Production WO metrics only; default true (Filter Date DONE). */
  filterDateDone: boolean
}

export function buildSrsKpiFilter(ctx: SrsContext, query: SrsKpiQueryDto): SrsKpiFilter {
  const dealerIds = parseDealerIds(query.idDealer)
  if (dealerIds.length === 0) {
    throw new BadRequestException('idDealer is required (select dealer(s) in header)')
  }
  return {
    idDealerProvider: ctx.idDealerProvider,
    idUsuario: ctx.idUsuario,
    dealerIds,
    fechaDesde: query.fechaDesde,
    fechaHasta: query.fechaHasta,
    filterDateDone: parseFilterDateDone(query.filterDateDone),
  }
}
