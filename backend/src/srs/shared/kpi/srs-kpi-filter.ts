import { BadRequestException } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsKpiQueryDto } from './srs-kpi-query.dto'
import { parseDealerIds, parseFilterDateDone, parseIncludeZero, skipDealerRestrictionForRol } from './srs-kpi-dealer-filter'

export interface SrsKpiFilter {
  idDealerProvider: number
  idUsuario: number
  dealerIds: number[]
  fechaDesde: string
  fechaHasta: string
  /** Production WO metrics only; default true (Filter Date DONE). */
  filterDateDone: boolean
  /** When true, include zero-value WO/invoice rows in production & billing KPIs. Default false. */
  includeZero: boolean
  /** Admin General / Admin Company: skip RESTRICTION_DEALER_V2 (PHP ProductionReportService). */
  skipDealerRestriction: boolean
  /**
   * «Include removed dealers» (T1.7): true only for Admin General / Admin Company; forced to false
   * for every other user, whatever the request says. Only the screens with totals by dealer read it.
   */
  includeRemovedDealers: boolean
}

/** Parse the «Include removed dealers» flag of a request (boolean or 'true' / '1'). */
function parseIncludeRemovedDealers(raw?: string | boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return false
  if (typeof raw === 'boolean') return raw
  return raw === '1' || raw.toLowerCase() === 'true'
}

/**
 * The switch is honoured only when the session already sees every dealer of its company
 * (skipDealerRestriction = rol 1 or 2 of the session). Shared by the two filter builders.
 */
export function includeRemovedDealersForSession(
  skipDealerRestriction: boolean,
  raw?: string | boolean,
): boolean {
  return skipDealerRestriction && parseIncludeRemovedDealers(raw)
}

/**
 * Filter for endpoints that look at the whole history, with no period (Outstanding AR of the
 * invoice list). The dates stay empty on purpose: those queries run with range = null.
 */
export function buildSrsKpiFilterNoPeriod(
  ctx: SrsContext,
  query: { idDealer?: string; includeZero?: string | boolean; includeRemovedDealers?: string | boolean },
): SrsKpiFilter {
  const dealerIds = parseDealerIds(query.idDealer)
  if (dealerIds.length === 0) {
    throw new BadRequestException('idDealer is required (select dealer(s) in header)')
  }
  const skipDealerRestriction = skipDealerRestrictionForRol(ctx.idRol)
  return {
    idDealerProvider: ctx.idDealerProvider,
    idUsuario: ctx.idUsuario,
    dealerIds,
    fechaDesde: '',
    fechaHasta: '',
    filterDateDone: false,
    includeZero: parseIncludeZero(query.includeZero),
    skipDealerRestriction,
    includeRemovedDealers: includeRemovedDealersForSession(skipDealerRestriction, query.includeRemovedDealers),
  }
}

export function buildSrsKpiFilter(ctx: SrsContext, query: SrsKpiQueryDto): SrsKpiFilter {
  const dealerIds = parseDealerIds(query.idDealer)
  if (dealerIds.length === 0) {
    throw new BadRequestException('idDealer is required (select dealer(s) in header)')
  }
  const skipDealerRestriction = skipDealerRestrictionForRol(ctx.idRol)
  return {
    idDealerProvider: ctx.idDealerProvider,
    idUsuario: ctx.idUsuario,
    dealerIds,
    fechaDesde: query.fechaDesde,
    fechaHasta: query.fechaHasta,
    filterDateDone: parseFilterDateDone(query.filterDateDone),
    includeZero: parseIncludeZero(query.includeZero),
    skipDealerRestriction,
    includeRemovedDealers: includeRemovedDealersForSession(skipDealerRestriction, query.includeRemovedDealers),
  }
}
