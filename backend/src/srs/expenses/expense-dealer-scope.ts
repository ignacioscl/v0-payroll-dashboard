import { fieldError } from 'src/commons/errors/field.error'
import { MSG_BRANCH_OUT_OF_SCOPE } from 'src/features/srs-expense/rules/expense-rules'
import type { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { skipDealerRestrictionForRol } from 'src/srs/shared/kpi/srs-kpi-dealer-filter'
import type { ExpenseScope } from './repository/expense-report.repository'

/** Lo que el helper necesita de ContratistaService (dealers de la empresa). */
export interface DealerLookup {
  findScopedByIds(ids: number[], idProvider: number): Promise<{ id: number | string }[]>
}

/** Lo que el helper necesita de ExpenseReportRepository (RESTRICTION_DEALER_V2). */
export interface DealerRestrictionLookup {
  dealerIdsInRestriction(scope: ExpenseScope, ids: number[]): Promise<number[]>
}

/** El alcance de la sesión para las consultas de Expenses (Admin, rol 1/2: sin RESTRICTION_DEALER_V2). */
export function expenseScopeOf(ctx: SrsContext): ExpenseScope {
  return {
    idDealerProvider: ctx.idDealerProvider,
    idUsuario: ctx.idUsuario,
    skipDealerRestriction: skipDealerRestrictionForRol(ctx.idRol),
  }
}

/**
 * De los ids pedidos, los que son de la empresa (`findScopedByIds`) **y** pasan `RESTRICTION_DEALER_V2` para un
 * usuario con restricción (Admin: todos los de la empresa). Una sola definición para los dealers de un gasto, los
 * de una regla recurrente y el combo de empleados.
 */
export async function dealerIdsInScope(
  dealers: DealerLookup,
  report: DealerRestrictionLookup,
  ctx: SrsContext,
  ids: number[],
): Promise<Set<number>> {
  const unique = [...new Set(ids.map(Number))]
  if (!unique.length) return new Set()
  const scoped = (await dealers.findScopedByIds(unique, ctx.idDealerProvider)).map((d) => Number(d.id))
  return new Set(await report.dealerIdsInRestriction(expenseScopeOf(ctx), scoped))
}

/** Todos los ids en el alcance, o 400 «This branch is outside your dealers.» en el campo que diga `fieldOf`. */
export async function assertDealersInScope(
  dealers: DealerLookup,
  report: DealerRestrictionLookup,
  ctx: SrsContext,
  ids: number[],
  fieldOf: (idDealer: number) => string,
): Promise<void> {
  const allowed = await dealerIdsInScope(dealers, report, ctx, ids)
  for (const id of ids) {
    if (!allowed.has(Number(id))) throw fieldError(fieldOf(Number(id)), MSG_BRANCH_OUT_OF_SCOPE)
  }
}
