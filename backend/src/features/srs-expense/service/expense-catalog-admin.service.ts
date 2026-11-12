import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { fieldError } from 'src/commons/errors/field.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { ROL_ACCION_EXPENSES_APPROVE, SrsPermissionRepository } from 'src/srs/auth/srs-permission.repository'
import { expenseClosingClass } from 'src/srs/expenses/expense-closing-class'
import { ExpenseRepetitiveService } from 'src/features/srs-expense-repetitive/service/expense-repetitive.service'
import { CatalogMergeResultDto, CatalogUsageDto } from 'src/features/srs-generic-data/dto/generic-data.dto'
import { EXPENSES_COMPANY_CATEGORY, GenericData } from 'src/features/srs-generic-data/entity/generic-data.entity'
import { CatalogKind, ExpenseCatalogService } from 'src/features/srs-generic-data/service/expense-catalog.service'
import { GenericDataService } from 'src/features/srs-generic-data/service/generic-data.service'
import { LogChangeService } from 'src/features/srs-log-change/service/log-change.service'
import { LogGenericService } from 'src/features/srs-log-generic/service/log-generic.service'
import {
  MSG_CATALOG_IN_USE,
  MSG_CHOOSE_CATEGORY,
  MSG_CHOOSE_COMPANY,
  MSG_MERGE_OTHER_CATEGORY,
  MSG_MERGE_OTHER_COMPANY,
} from '../rules/expense-rules'
import { ExpenseService } from './expense.service'

/** MySQL: «Cannot delete or update a parent row: a foreign key constraint fails». */
const ER_ROW_IS_REFERENCED_2 = 1451

function isForeignKeyBlock(e: unknown): boolean {
  const err = e as { errno?: number; driverError?: { errno?: number } }
  return err?.errno === ER_ROW_IS_REFERENCED_2 || err?.driverError?.errno === ER_ROW_IS_REFERENCED_2
}

const fieldOf = (kind: CatalogKind): 'idCompany' | 'idCategory' => (kind === 'company' ? 'idCompany' : 'idCategory')

/**
 * Expenses › Settings: borrar y unificar compañías (GENERIC_DATA 34) y categorías (35). Orquesta los services de
 * cada dueño (gastos, reglas, catálogo, logs) en una sola transacción. Todo acotado a la empresa de la sesión:
 * la fila y la elegida por `requireOwned`; los gastos por `id_detailer`; las reglas y las compañías por
 * `id_dealer_provider`. plans/plan-expenses-settings/PLAN.md, §3.
 */
@Injectable()
export class ExpenseCatalogAdminService {
  constructor(
    @Inject(ExpenseCatalogService) private readonly catalog: ExpenseCatalogService,
    @Inject(GenericDataService) private readonly generic: GenericDataService,
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
    @Inject(ExpenseRepetitiveService) private readonly rules: ExpenseRepetitiveService,
    @Inject(LogGenericService) private readonly expenseLogs: LogGenericService,
    @Inject(LogChangeService) private readonly ruleLogs: LogChangeService,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  /** Lo que se mueve si se unifica la fila (solo lo de la empresa). */
  async usage(ctx: SrsContext, kind: CatalogKind, id: number): Promise<CatalogUsageDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    await this.catalog.requireOwned(ctx, kind, id)
    return this.usageOf(ctx, kind, id)
  }

  /** Borra la fila si nada la usa (tampoco gastos borrados, reglas ni una compañía que la tenga de última). */
  @Transactional()
  async remove(ctx: SrsContext, kind: CatalogKind, id: number): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    await this.catalog.requireOwned(ctx, kind, id)
    await this.deleteOrConflict(ctx, kind, id)
  }

  /** Pasa gastos, reglas y compañías de la fila a `targetId`, deja su log y borra la fila. */
  @Transactional()
  async merge(ctx: SrsContext, kind: CatalogKind, id: number, targetId: number | undefined): Promise<CatalogMergeResultDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const source = await this.catalog.requireOwned(ctx, kind, id)
    if (!targetId) throw fieldError('targetId', kind === 'company' ? MSG_CHOOSE_COMPANY : MSG_CHOOSE_CATEGORY)
    const other = kind === 'company' ? MSG_MERGE_OTHER_COMPANY : MSG_MERGE_OTHER_CATEGORY
    if (targetId === id) throw fieldError('targetId', other)
    const target = await this.catalog.requireOwned(ctx, kind, targetId)
    if (Number(target.estado) !== 1) throw fieldError('targetId', other)
    // Los cierres leen «Window Tint Film» y «Accident» por nombre: solo se unen categorías de la misma clase (D2).
    if (kind === 'category' && expenseClosingClass(source.name) !== expenseClosingClass(target.name)) {
      throw fieldError('targetId', other)
    }

    const field = fieldOf(kind)
    const label = kind === 'company' ? 'Company' : 'Category'

    // 1. Gastos de la empresa (vivos y borrados), con una línea de log por fila.
    const rows = await this.expenses.findByCatalog(field, id, ctx.idDealerProvider)
    const expensesMoved = await this.expenses.reassignCatalog(field, id, targetId, ctx.idDealerProvider)
    for (const row of rows) {
      await this.expenseLogs.logExpense(row.id, ctx.idUsuario, `${label}: ${source.name} -> ${target.name} (merged in Settings)`)
    }

    // 2. Reglas recurrentes de la empresa, con su fila en LOG_CHANGE.
    const rules = await this.rules.findByCatalog(field, id, ctx.idDealerProvider)
    const rulesMoved = await this.rules.reassignCatalog(field, id, targetId, ctx.idDealerProvider)
    for (const rule of rules) {
      await this.ruleLogs.logRule(
        rule.id,
        ctx.idUsuario,
        `Recurring expense ${rule.id}: ${label.toLowerCase()} ${source.name} -> ${target.name} (merged in Settings)`,
        { before: { [field]: id }, after: { [field]: targetId } },
      )
    }

    // 3. Última categoría de las compañías (D4 de plan-expenses-pro).
    let companiesUpdated = 0
    if (kind === 'category') {
      companiesUpdated = await this.generic.reassignParent(id, targetId, EXPENSES_COMPANY_CATEGORY, ctx.idDealerProvider)
    } else if (!target.idParent && source.idParent) {
      await this.generic.updateById(target.id, { idParent: source.idParent })
      target.idParent = source.idParent
    }

    // 4. La fila ya no tiene nada propio: se borra. Si queda algo de otra empresa, todo vuelve atrás (409).
    await this.deleteOrConflict(ctx, kind, id)

    return {
      target: await this.catalog.itemWithCounts(kind, target as GenericData),
      expensesMoved,
      rulesMoved,
      companiesUpdated,
    }
  }

  private async usageOf(ctx: SrsContext, kind: CatalogKind, id: number): Promise<CatalogUsageDto> {
    const field = fieldOf(kind)
    const expenses = await this.expenses.catalogUsage(field, id, ctx.idDealerProvider)
    const rules = await this.rules.findByCatalog(field, id, ctx.idDealerProvider)
    const companies =
      kind === 'category' ? (await this.generic.childrenOf(id, EXPENSES_COMPANY_CATEGORY, ctx.idDealerProvider)).length : 0
    return { expenses: expenses.live, deletedExpenses: expenses.notLive, rules: rules.length, companies }
  }

  /** Borra la fila de la empresa; cualquier referencia (también ajena) → 409 y la transacción vuelve atrás. */
  private async deleteOrConflict(ctx: SrsContext, kind: CatalogKind, id: number): Promise<void> {
    const idCategoria = ExpenseCatalogService.idCategoriaOf(kind)
    if (await this.generic.inUseOf(id, idCategoria)) throw new ConflictException(MSG_CATALOG_IN_USE)
    try {
      await this.generic.deleteOwned(id, idCategoria, ctx.idDealerProvider)
    } catch (e) {
      if (isForeignKeyBlock(e)) throw new ConflictException(MSG_CATALOG_IN_USE)
      throw e
    }
  }
}
