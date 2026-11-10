import { BadRequestException } from '@nestjs/common'

import { SrsContext } from '../auth/srs-auth-context.service'
import { parseDealerIds, skipDealerRestrictionForRol } from '../shared/kpi/srs-kpi-dealer-filter'
import { includeRemovedDealersForSession } from '../shared/kpi/srs-kpi-filter'
import { ExpenseListQueryDto } from './dto/expense-list-query.dto'
import { monthRange } from './expense-period'
import { todayNy } from 'src/features/srs-expense/rules/expense-rules'

export type ExpenseStatusFilter = 'pending' | 'approved' | 'rejected'

/** Lo que entra a `buildExpenseWhere`: una sola definición para lista, summary, export, analytics y Monthly Closing. */
export interface ExpenseListFilter {
  idDealerProvider: number
  idUsuario: number
  skipDealerRestriction: boolean
  /** Siempre con ids: «All» = todos los del combo (como Billing). */
  dealerIds: number[]
  includeRemovedDealers: boolean
  from: string
  to: string
  idCompany?: number
  idCategory?: number
  /**
   * Solo los gastos de la categoría de gastos con este nombre (minúsculas, sin espacios en las puntas). Lo pasa
   * el Window Tint Closing con 'window tint film' (T4 de plans/plan-reporte-tint/PLAN.md); ninguna pantalla de
   * Expenses lo usa. Por nombre y tipo 35, nunca por id (regla generic-data-no-hardcoded-ids).
   */
  categoryNameIs?: string
  idAuthor?: number
  idCreatedBy?: number
  status?: ExpenseStatusFilter
  amountMin?: string
  amountMax?: string
  /** Show deleted: `estado = 0`. */
  deleted: boolean
}

export const EXPENSE_PAGE_SIZE_DEFAULT = 25
export const EXPENSE_PAGE_SIZE_MAX = 200

/**
 * Filtro de la sesión + el pedido. Exige al menos un dealer (400 «Select at least one dealer», como
 * invoice.service.ts); el provider sale del JWT, nunca del pedido.
 */
export function buildExpenseListFilter(ctx: SrsContext, query: ExpenseListQueryDto): ExpenseListFilter {
  const dealerIds = [...new Set(parseDealerIds(query.idDealer))]
  if (dealerIds.length === 0) {
    throw new BadRequestException('Select at least one dealer')
  }
  const skipDealerRestriction = skipDealerRestrictionForRol(ctx.idRol)
  const defaults = monthRange(todayNy())
  const from = query.from?.trim() || defaults.from
  const to = query.to?.trim() || defaults.to
  if (to < from) throw new BadRequestException('The end date is before the start date')
  return {
    idDealerProvider: ctx.idDealerProvider,
    idUsuario: ctx.idUsuario,
    skipDealerRestriction,
    dealerIds,
    includeRemovedDealers: includeRemovedDealersForSession(skipDealerRestriction, query.includeRemovedDealers),
    from,
    to,
    idCompany: query.idCompany,
    idCategory: query.idCategory,
    idAuthor: query.idAuthor,
    idCreatedBy: query.idCreatedBy,
    status: query.status,
    amountMin: query.amountMin,
    amountMax: query.amountMax,
    deleted: query.deleted === '1',
  }
}

export function pageOf(query: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(EXPENSE_PAGE_SIZE_MAX, Math.max(1, query.pageSize ?? EXPENSE_PAGE_SIZE_DEFAULT))
  return { page, pageSize }
}
