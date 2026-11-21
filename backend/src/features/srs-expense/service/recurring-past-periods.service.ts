import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { fieldError } from 'src/commons/errors/field.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_EXPENSES_ADD,
  ROL_ACCION_EXPENSES_APPROVE,
  SrsPermissionRepository,
} from 'src/srs/auth/srs-permission.repository'
import { assertDealersInScope } from 'src/srs/expenses/expense-dealer-scope'
import { pastRuns } from 'src/srs/expenses/recurring-schedule'
import { ExpenseReportRepository } from 'src/srs/expenses/repository/expense-report.repository'
import { ContratistaService } from 'src/features/srs-contratista/service/contratista.service'
import type { AssignWithDealer } from 'src/features/srs-expense-dealer-assign/repository/expense-dealer-assign.repository'
import { ExpenseDealerAssignService } from 'src/features/srs-expense-dealer-assign/service/expense-dealer-assign.service'
import type { ExpenseRepetitive } from 'src/features/srs-expense-repetitive/entity/expense-repetitive.entity'
import { ExpenseRepetitiveService } from 'src/features/srs-expense-repetitive/service/expense-repetitive.service'
import { LogGenericService } from 'src/features/srs-log-generic/service/log-generic.service'
import { MSG_NOT_FOUND, SPLIT_BY_FIXED_AMOUNT, fromCents, toCents, todayNy, withAutomaticRecalculated } from '../rules/expense-rules'
import { ExpenseService } from './expense.service'

/** La nota que el cron deja en cada gasto que genera (`cron.expense_recursive.php`, `saveExpense`). */
export const RECURRING_EXPENSE_NOTES = 'Repetitive expense'

export interface PastPeriodRowDto {
  dealer: { id: number; name: string }
  amount: string
}

export interface PastPeriodDto {
  date: string
  rows: PastPeriodRowDto[]
  total: string
}

export interface PastPeriodsDto {
  periods: PastPeriodDto[]
  /** Gastos que se graban al confirmar: una fila por dealer y período, como el cron. */
  expenses: number
  total: string
  /** Por qué el reparto no se puede generar (el mismo texto que `checkRun` le da al cron); null si se puede. */
  problem: string | null
}

function asRule(a: AssignWithDealer) {
  return {
    id: a.assign.id,
    percentage: a.assign.percentage ?? null,
    fixedAmount: a.assign.fixedAmount ?? null,
    automatic: Number(a.assign.hasAutomaticPercentaje) === 1,
  }
}

/**
 * Tema 1 de plan-reunion-juan-18-11: los gastos de los períodos ya pasados de una regla recurrente. El cron
 * (`cron.expense_recursive.php`) genera solo el día de hoy; acá se muestran los días de corrida desde el inicio de la
 * regla hasta ayer que todavía no tienen gasto de la regla, y al confirmar se graban como los graba el cron: una fila
 * por dealer, pendiente de aprobación, `notes` «Repetitive expense», autor el de la regla. Los gastos cargados a mano
 * no cuentan (D2). Va en este módulo y no en el de Recurring porque graba gastos, y el módulo de Recurring no puede
 * importar este (este ya importa aquel).
 */
@Injectable()
export class RecurringPastPeriodsService {
  constructor(
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
    @Inject(ExpenseRepetitiveService) private readonly rules: ExpenseRepetitiveService,
    @Inject(ExpenseDealerAssignService) private readonly assigns: ExpenseDealerAssignService,
    @Inject(LogGenericService) private readonly logs: LogGenericService,
    @Inject(ContratistaService) private readonly dealers: ContratistaService,
    @Inject(ExpenseReportRepository) private readonly report: ExpenseReportRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  /** La vista previa del modal «Past periods». */
  async preview(ctx: SrsContext, id: number): Promise<PastPeriodsDto> {
    const { dto } = await this.compute(ctx, id)
    return dto
  }

  /** Graba los gastos de la vista previa, recalculada en el momento (lo ya generado no se repite). */
  @Transactional()
  async generate(ctx: SrsContext, id: number): Promise<PastPeriodsDto> {
    const { dto, rule } = await this.compute(ctx, id)
    if (dto.problem) throw fieldError('rule', `It can't generate the expenses: ${dto.problem}.`)
    for (const period of dto.periods) {
      for (const row of period.rows) {
        const created = await this.expenses.create({
          idDetailer: ctx.idDealerProvider,
          idDealer: row.dealer.id,
          idAuthor: rule.idAuthor,
          idCreatedBy: ctx.idUsuario,
          idCompany: rule.idCompany,
          idCategory: rule.idCategory,
          idExpRepetitive: rule.id,
          idExpGroup: null,
          amount: row.amount,
          ticketDate: period.date,
          hasOtherPhoto: 0,
          notes: RECURRING_EXPENSE_NOTES,
          description: null,
          receiptNumber: null,
          isApproved: null,
          estado: 1,
        })
        await this.logs.logExpense(
          created.id,
          ctx.idUsuario,
          `Expense created from the recurring expense «${rule.description}», past period ${period.date} ($${row.amount})`,
        )
      }
    }
    return dto
  }

  private async compute(ctx: SrsContext, id: number): Promise<{ dto: PastPeriodsDto; rule: ExpenseRepetitive }> {
    // Lo mismo que pide la regla (111) más el alta de gastos (110).
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_ADD)
    const rule = await this.rules.findOwned(id, ctx.idDealerProvider)
    if (!rule) throw new NotFoundException(MSG_NOT_FOUND)

    const withNames = await this.assigns.listForRuleWithNames(rule.id, ctx.idDealerProvider)
    await assertDealersInScope(
      this.dealers,
      this.report,
      ctx,
      withNames.map((a) => Number(a.assign.idDealer)),
      () => 'idDealers',
    )
    const assigns =
      Number(rule.splitType) === SPLIT_BY_FIXED_AMOUNT ? withNames.map(asRule) : withAutomaticRecalculated(withNames.map(asRule))
    const done = await this.expenses.ruleTicketDates(rule.id, ctx.idDealerProvider)
    const { runs, problem } = pastRuns(
      { ...rule, startDate: String(rule.startDate), endDate: rule.endDate ? String(rule.endDate) : null },
      assigns,
      todayNy(),
      done,
    )

    const byAssign = new Map(withNames.map((a) => [Number(a.assign.id), a]))
    let totalCents = 0
    let expenses = 0
    const periods: PastPeriodDto[] = runs.map((run) => {
      const rows = run.rows.map((r) => {
        const a = byAssign.get(r.idAssign) as AssignWithDealer
        return { dealer: { id: Number(a.assign.idDealer), name: a.dealerName }, amount: r.amount }
      })
      const cents = rows.reduce((acc, r) => acc + toCents(r.amount), 0)
      totalCents += cents
      expenses += rows.length
      return { date: run.date, rows, total: fromCents(cents) }
    })
    return { dto: { periods, expenses, total: fromCents(totalCents), problem }, rule }
  }
}
