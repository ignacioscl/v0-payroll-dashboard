import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'
import { Transactional } from 'typeorm-transactional'

import { fieldError } from 'src/commons/errors/field.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { ROL_ACCION_EXPENSES_APPROVE, SrsPermissionRepository } from 'src/srs/auth/srs-permission.repository'
import { buildTableExportWorkbook, type TableExportColumn } from 'src/srs/shared/export/table-export-xlsx'
import type { ReportInfoRow } from 'src/srs/shared/export/report-info-sheet'
import {
  buildNyStampedExportFilename,
  contentDispositionAttachment,
  formatNyStamp,
  XLSX_MIME,
  ymdToUs,
} from 'src/srs/punch/punch-export-format'
import { loadUserName, resolveLocale } from 'src/srs/punch/punch-export-lookups'
import { expenseExportLabels } from 'src/srs/expenses/expense-export-labels'
import { estimatedMonthlyCents, nextRun, runsInNextDays } from 'src/srs/expenses/recurring-schedule'
import { nowNyStamp } from 'src/srs/expenses/expense-period'
import { assertDealersInScope } from 'src/srs/expenses/expense-dealer-scope'
import { ExpenseReportRepository } from 'src/srs/expenses/repository/expense-report.repository'
import { ContratistaService } from 'src/features/srs-contratista/service/contratista.service'
import { ExpenseCatalogService } from 'src/features/srs-generic-data/service/expense-catalog.service'
import { GenericDataService } from 'src/features/srs-generic-data/service/generic-data.service'
import { EXPENSES_CATEGORY_CATEGORY, EXPENSES_COMPANY_CATEGORY } from 'src/features/srs-generic-data/entity/generic-data.entity'
import { LogChangeService } from 'src/features/srs-log-change/service/log-change.service'
import { ExpenseDealerAssign } from 'src/features/srs-expense-dealer-assign/entity/expense-dealer-assign.entity'
import {
  AddDealersDto,
  AssignDto,
  AssignRowDto,
} from 'src/features/srs-expense-dealer-assign/dto/expense-dealer-assign.dto'
import { ExpenseDealerAssignService } from 'src/features/srs-expense-dealer-assign/service/expense-dealer-assign.service'
import {
  ExpenseRuleError,
  MSG_AMOUNT_INVALID,
  MSG_CHOOSE_CATEGORY,
  MSG_CHOOSE_COMPANY,
  MSG_CHOOSE_WEEK_DAY,
  MSG_END_BEFORE_START,
  MSG_NOT_FOUND,
  MSG_PERCENT_INVALID,
  MSG_SPLIT_NEEDS_100,
  SPLIT_BY_FIXED_AMOUNT,
  SPLIT_BY_PERCENT,
  checkRun,
  distributeAutomatic,
  fixedSum,
  fromCents,
  manualFits,
  splitAmount,
  toCents,
  todayNy,
  totalCents,
  validateAmount,
  validateManualPercent,
  validateManualSum,
  validateRuleDates,
} from 'src/features/srs-expense/rules/expense-rules'
import {
  RecurringListQueryDto,
  RecurringRuleDto,
  RuleDetailDto,
  RuleFrequency,
  RuleRowDto,
  RuleSplitType,
  SplitTypeDto,
  UpdateRecurringRuleDto,
} from '../dto/expense-repetitive.dto'
import { ExpenseRepetitive, RULE_FREQUENCY_MONTHLY, RULE_FREQUENCY_WEEKLY } from '../entity/expense-repetitive.entity'
import { ExpenseRepetitiveService } from './expense-repetitive.service'

const PAGE_SIZE_DEFAULT = 25
const PAGE_SIZE_MAX = 200

/** Un assign como lo ven las reglas (`automatic` = has_automatic_percentaje). */
function asRule(a: ExpenseDealerAssign) {
  return {
    id: a.id,
    percentage: a.percentage ?? null,
    fixedAmount: a.fixedAmount ?? null,
    automatic: Number(a.hasAutomaticPercentaje) === 1,
  }
}

function splitName(splitType: number): string {
  return Number(splitType) === SPLIT_BY_FIXED_AMOUNT ? 'By fixed amount' : 'By percent'
}

function money(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '-' : fromCents(toCents(value))
}

/** `samePercent` legacy: vacíos iguales; si no, comparan en centésimos. */
function samePercent(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const emptyA = a === null || a === undefined || a === ''
  const emptyB = b === null || b === undefined || b === ''
  if (emptyA || emptyB) return emptyA && emptyB
  return toCents(a) === toCents(b)
}

function describe(a: ExpenseDealerAssign | null, fixed: boolean): string {
  if (!a) return '-'
  if (fixed) return `Fixed ${money(a.fixedAmount)}`
  return `${Number(a.hasAutomaticPercentaje) === 1 ? 'Automatic ' : 'Manual '}${money(a.percentage)}`
}

/**
 * Port función por función de public/php/api/modulos/expense/ExpenseRepetitiveHelper.php (misma semántica, mismos
 * textos), más el listado, las tarjetas y el export de dealers. Permiso 111 en todo (como el botón legacy).
 */
@Injectable()
export class RecurringExpenseFacadeService {
  constructor(
    @Inject(ExpenseRepetitiveService) private readonly rules: ExpenseRepetitiveService,
    @Inject(ExpenseDealerAssignService) private readonly assigns: ExpenseDealerAssignService,
    @Inject(LogChangeService) private readonly logs: LogChangeService,
    @Inject(ContratistaService) private readonly dealers: ContratistaService,
    @Inject(ExpenseCatalogService) private readonly catalog: ExpenseCatalogService,
    @Inject(GenericDataService) private readonly generic: GenericDataService,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
    @Inject(ExpenseReportRepository) private readonly report: ExpenseReportRepository,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(ctx: SrsContext, query: RecurringListQueryDto) {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, query.pageSize ?? PAGE_SIZE_DEFAULT))
    const today = todayNy()
    const { rows, total } = await this.rules.listActive({
      idDealerProvider: ctx.idDealerProvider,
      term: query.term,
      page: page - 1,
      pageSize,
    })
    const all = await this.rules.listAllActive(ctx.idDealerProvider)
    let estimatedMonthly = 0
    let next30Days = 0
    for (const rule of all) {
      const cents = toCents(rule.amount ?? 0)
      estimatedMonthly += estimatedMonthlyCents(rule, cents)
      next30Days += runsInNextDays(rule, today, 30) * cents
    }
    return {
      data: rows.map((r) => this.toRow(r.rule, r.companyName, r.categoryName, r.dealersCount, today)),
      total,
      page,
      pageSize,
      cards: {
        activeRules: all.length,
        estimatedMonthly: fromCents(estimatedMonthly),
        next30Days: fromCents(next30Days),
      },
    }
  }

  async get(ctx: SrsContext, id: number): Promise<RuleDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const rule = await this.requireRule(ctx, id)
    return this.detail(ctx, rule)
  }

  private async requireRule(ctx: SrsContext, id: number): Promise<ExpenseRepetitive> {
    const rule = await this.rules.findOwned(id, ctx.idDealerProvider)
    if (!rule) throw new NotFoundException(MSG_NOT_FOUND)
    return rule
  }

  private async detail(ctx: SrsContext, rule: ExpenseRepetitive): Promise<RuleDetailDto> {
    const [company, category, assigns] = await Promise.all([
      this.generic.findOwned(rule.idCompany, EXPENSES_COMPANY_CATEGORY, ctx.idDealerProvider),
      this.generic.findOwned(rule.idCategory, EXPENSES_CATEGORY_CATEGORY, ctx.idDealerProvider),
      this.assigns.listForRuleWithNames(rule.id, ctx.idDealerProvider),
    ])
    const ruleAssigns = assigns.map((a) => asRule(a.assign))
    const total = totalCents(ruleAssigns)
    const rows: AssignRowDto[] = assigns.map((a) => ({
      id: a.assign.id,
      dealer: { id: a.assign.idDealer, name: a.dealerName },
      automatic: Number(a.assign.hasAutomaticPercentaje) === 1,
      percentage: a.assign.percentage ?? null,
      fixedAmount: a.assign.fixedAmount ?? null,
    }))
    return {
      ...this.toRow(rule, company?.name ?? '', category?.name ?? '', assigns.length, todayNy()),
      assigns: rows,
      totalPercent: total === null ? null : fromCents(total),
      canRun: assigns.length ? checkRun(rule.amount ?? null, ruleAssigns, rule.splitType) : 'no dealers',
    }
  }

  private toRow(rule: ExpenseRepetitive, companyName: string, categoryName: string, dealersCount: number, today: string): RuleRowDto {
    const weekly = Number(rule.frequency) === RULE_FREQUENCY_WEEKLY
    return {
      id: rule.id,
      description: rule.description,
      company: { id: rule.idCompany, name: companyName },
      category: { id: rule.idCategory, name: categoryName },
      amount: rule.amount === null || rule.amount === undefined ? null : fromCents(toCents(rule.amount)),
      splitType: Number(rule.splitType) === SPLIT_BY_FIXED_AMOUNT ? 'fixed' : 'percent',
      frequency: weekly ? 'weekly' : 'monthly',
      weekDay: weekly ? rule.weekDay ?? null : null,
      startDate: String(rule.startDate).slice(0, 10),
      endDate: rule.endDate ? String(rule.endDate).slice(0, 10) : null,
      dealersCount,
      nextRun: nextRun(rule, today),
      active: Number(rule.status) === 1,
    }
  }

  // ---------------------------------------------------------------- regla (save / delete)

  private async resolveCatalog(ctx: SrsContext, kind: 'company' | 'category', id?: number, newName?: string): Promise<number> {
    const field = kind === 'company' ? 'idCompany' : 'idCategory'
    const message = kind === 'company' ? MSG_CHOOSE_COMPANY : MSG_CHOOSE_CATEGORY
    if (id) {
      const item = await this.generic.findOwned(id, ExpenseCatalogService.idCategoriaOf(kind), ctx.idDealerProvider)
      if (!item) throw fieldError(field, message)
      return item.id
    }
    const name = (newName ?? '').trim()
    if (!name) throw fieldError(field, message)
    return (await this.catalog.findOrCreate(ctx, kind, name)).item.id
  }

  private dates(start: string | undefined, end: string | null | undefined): { start: string; end: string | null } {
    try {
      return validateRuleDates(start, end)
    } catch (e) {
      const msg = (e as Error).message
      throw fieldError(msg === MSG_END_BEFORE_START ? 'endDate' : 'startDate', msg)
    }
  }

  private frequency(frequency: RuleFrequency, weekDay: number | null | undefined): { frequency: number; weekDay: number | null } {
    if (frequency === 'weekly') {
      if (weekDay === null || weekDay === undefined) throw fieldError('weekDay', MSG_CHOOSE_WEEK_DAY)
      return { frequency: RULE_FREQUENCY_WEEKLY, weekDay: Number(weekDay) }
    }
    return { frequency: RULE_FREQUENCY_MONTHLY, weekDay: null }
  }

  private ruleFields(rule: ExpenseRepetitive) {
    return {
      description: rule.description,
      amount: money(rule.amount),
      frequency: String(rule.frequency),
      weekDay: rule.weekDay === null || rule.weekDay === undefined ? '' : String(rule.weekDay),
      startDate: String(rule.startDate ?? '').slice(0, 10),
      endDate: rule.endDate ? String(rule.endDate).slice(0, 10) : '',
      company: String(rule.idCompany),
      category: String(rule.idCategory),
      splitType: Number(rule.splitType),
    }
  }

  /** `save` (alta): Split del pedido, Amount validado en By percent y NULL en By fixed amount, start_date del pedido. */
  @Transactional()
  async create(ctx: SrsContext, body: RecurringRuleDto): Promise<RuleDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const idCompany = await this.resolveCatalog(ctx, 'company', body.idCompany, body.newCompanyName)
    const idCategory = await this.resolveCatalog(ctx, 'category', body.idCategory, body.newCategoryName)
    const dates = this.dates(body.startDate, body.endDate)
    const freq = this.frequency(body.frequency, body.weekDay)
    const splitType = body.splitType === 'fixed' ? SPLIT_BY_FIXED_AMOUNT : SPLIT_BY_PERCENT
    let amount: string | null = null
    if (splitType === SPLIT_BY_PERCENT) {
      try {
        amount = validateAmount(body.amount ?? '')
      } catch (e) {
        throw fieldError('amount', (e as Error).message)
      }
    }
    const created = await this.rules.create({
      idDealerProvider: ctx.idDealerProvider,
      idAuthor: ctx.idUsuario,
      idCompany,
      idCategory,
      description: body.description.trim(),
      amount,
      splitType,
      startDate: dates.start,
      endDate: dates.end,
      frequency: freq.frequency,
      weekDay: freq.weekDay,
      status: 1,
    })
    await this.logs.logRule(created.id, ctx.idUsuario, `Recurring expense ${created.id} created`, {
      before: null,
      after: this.ruleFields(created),
    })
    return this.detail(ctx, created)
  }

  /** `save` (edición): no cambia `split_type` ni `start_date` salvo que vengan; log de los campos que cambiaron. */
  @Transactional()
  async update(ctx: SrsContext, id: number, body: UpdateRecurringRuleDto): Promise<RuleDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const rule = await this.requireRule(ctx, id)
    const before = this.ruleFields(rule)
    const patch: Partial<ExpenseRepetitive> = {}
    if (body.description !== undefined) patch.description = body.description.trim()
    if (body.idCompany !== undefined || (body.newCompanyName ?? '').trim() !== '') {
      patch.idCompany = await this.resolveCatalog(ctx, 'company', body.idCompany, body.newCompanyName)
    }
    if (body.idCategory !== undefined || (body.newCategoryName ?? '').trim() !== '') {
      patch.idCategory = await this.resolveCatalog(ctx, 'category', body.idCategory, body.newCategoryName)
    }
    const dates = this.dates(body.startDate ?? String(rule.startDate).slice(0, 10), body.endDate === undefined ? rule.endDate ?? null : body.endDate)
    patch.startDate = dates.start
    patch.endDate = dates.end
    const frequency: RuleFrequency = body.frequency ?? (Number(rule.frequency) === RULE_FREQUENCY_WEEKLY ? 'weekly' : 'monthly')
    const freq = this.frequency(frequency, body.weekDay ?? rule.weekDay)
    patch.frequency = freq.frequency
    patch.weekDay = freq.weekDay
    if (Number(rule.splitType) === SPLIT_BY_FIXED_AMOUNT) {
      // By fixed amount el Amount no se escribe: es la suma de los dealers.
      patch.amount = fixedSum((await this.assigns.listForRule(id)).map(asRule))
    } else if (body.amount !== undefined) {
      try {
        patch.amount = validateAmount(body.amount)
      } catch (e) {
        throw fieldError('amount', (e as Error).message)
      }
    }
    await this.rules.updateById(id, patch)
    const updated = Object.assign(rule, patch)
    const after = this.ruleFields(updated)
    const parts: string[] = []
    for (const field of Object.keys(before) as (keyof typeof before)[]) {
      if (before[field] !== after[field]) parts.push(`${field} ${before[field]} -> ${after[field]}`)
    }
    if (parts.length) {
      await this.logs.logRule(id, ctx.idUsuario, `Recurring expense ${id}: ${parts.join(', ')}`, { before, after })
    }
    return this.detail(ctx, updated)
  }

  @Transactional()
  async remove(ctx: SrsContext, id: number): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    await this.requireRule(ctx, id)
    await this.rules.updateById(id, { status: 0, idAuthorDelete: ctx.idUsuario, deleteDate: nowNyStamp() })
    await this.logs.logRule(id, ctx.idUsuario, `Recurring expense ${id} deleted`, { before: null, after: null })
  }

  // ---------------------------------------------------------------- reparto (port de ExpenseRepetitiveHelper)

  /**
   * `changeSplitType`: a By fixed amount solo desde un reparto que el cron genera (cada dealer arranca con lo que
   * hoy le toca por corrida); a By percent todos Automatic y el Amount queda.
   */
  @Transactional()
  async changeSplitType(ctx: SrsContext, id: number, body: SplitTypeDto): Promise<RuleDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const rule = await this.requireRule(ctx, id)
    const splitType = body.splitType === 'fixed' ? SPLIT_BY_FIXED_AMOUNT : SPLIT_BY_PERCENT
    if (Number(rule.splitType) === splitType) return this.detail(ctx, rule)
    await this.changeAssigns(ctx, id, async () => {
      const assigns = await this.assigns.listForRule(id)
      if (splitType === SPLIT_BY_FIXED_AMOUNT) {
        if (assigns.length > 0 && checkRun(rule.amount ?? null, assigns.map(asRule)) !== null) {
          throw fieldError('splitType', MSG_SPLIT_NEEDS_100)
        }
        const amounts = assigns.length > 0 ? splitAmount(rule.amount ?? null, assigns.map(asRule)) : {}
        for (const a of assigns) {
          const value = amounts[String(a.id)]
          await this.assigns.updateAssign(a.id, {
            fixedAmount: value && toCents(value) > 0 ? value : null,
            percentage: null,
            hasAutomaticPercentaje: 0,
          })
        }
      } else {
        for (const a of assigns) {
          await this.assigns.updateAssign(a.id, { fixedAmount: null, hasAutomaticPercentaje: 1 })
        }
      }
      await this.rules.updateSplitType(id, splitType)
      await this.logs.logRule(
        id,
        ctx.idUsuario,
        `Recurring expense ${id}: Split ${splitName(rule.splitType)} -> ${splitName(splitType)}`,
        { before: { splitType: Number(rule.splitType) }, after: { splitType } },
      )
    })
    return this.detail(ctx, await this.requireRule(ctx, id))
  }

  /**
   * `addDealer`, pero solo dealers de la empresa (findScopedByIds) y, para un usuario con restricción, dentro de
   * su alcance (RESTRICTION_DEALER_V2), como los dealers de un gasto; uno afuera → 400 en `idDealers`. Un
   * duplicado se ignora como hoy.
   */
  @Transactional()
  async addDealers(ctx: SrsContext, id: number, body: AddDealersDto): Promise<RuleDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    await this.requireRule(ctx, id)
    const ids = [...new Set(body.idDealers.map(Number).filter((n) => n > 0))]
    await assertDealersInScope(this.dealers, this.report, ctx, ids, () => 'idDealers')
    await this.changeAssigns(
      ctx,
      id,
      async () => {
        const existing = new Set(await this.assigns.dealerIdsInRule(id))
        for (const idDealer of ids) {
          if (existing.has(idDealer)) continue
          await this.assigns.create({ idExpRepetitive: id, idDealer, percentage: null, fixedAmount: null, hasAutomaticPercentaje: 1 })
        }
      },
      body.allowAnyTotal === true,
    )
    return this.detail(ctx, await this.requireRule(ctx, id))
  }

  /**
   * `editAssign`: Automatic / Manual o el porcentaje Manual de un dealer (By percent), o su monto (By fixed amount).
   * Un cambio que deja los Manual sumando más de 100 no se graba, salvo con «Don't block changes».
   */
  @Transactional()
  async editAssign(ctx: SrsContext, idRule: number, idAssign: number, body: AssignDto): Promise<RuleDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const rule = await this.requireRule(ctx, idRule)
    const assign = await this.assigns.findWithRule(idAssign)
    if (!assign || Number(assign.idExpRepetitive) !== Number(idRule)) throw new NotFoundException(MSG_NOT_FOUND)
    const hasFixed = body.fixedAmount !== undefined
    if (Number(rule.splitType) === SPLIT_BY_FIXED_AMOUNT) {
      if (!hasFixed) throw fieldError('fixedAmount', MSG_AMOUNT_INVALID)
      let amount: string
      try {
        amount = validateAmount(body.fixedAmount)
      } catch (e) {
        throw fieldError('fixedAmount', (e as Error).message)
      }
      await this.changeAssigns(ctx, idRule, async () => {
        await this.assigns.updateAssign(assign.id, { fixedAmount: amount })
      })
      return this.detail(ctx, await this.requireRule(ctx, idRule))
    }
    if (hasFixed) throw fieldError('percentage', MSG_PERCENT_INVALID)
    const allowAny = body.allowAnyTotal === true
    const isAuto = body.automatic !== undefined ? body.automatic : body.percentage !== undefined ? false : Number(assign.hasAutomaticPercentaje) === 1
    let percentage: number | null = null
    if (!isAuto && body.percentage !== undefined) {
      try {
        percentage = validateManualPercent(body.percentage)
      } catch (e) {
        throw fieldError('percentage', (e as Error).message)
      }
    }
    await this.changeAssigns(
      ctx,
      idRule,
      async () => {
        const patch: { percentage?: string | null; hasAutomaticPercentaje: number } = { hasAutomaticPercentaje: isAuto ? 1 : 0 }
        if (percentage !== null) {
          patch.percentage = fromCents(percentage)
        } else if (!isAuto && !allowAny) {
          // pasa a Manual conservando el porcentaje que tenía
          try {
            patch.percentage = fromCents(validateManualPercent(assign.percentage))
          } catch (e) {
            throw fieldError('percentage', (e as Error).message)
          }
        }
        await this.assigns.updateAssign(assign.id, patch)
      },
      allowAny,
    )
    return this.detail(ctx, await this.requireRule(ctx, idRule))
  }

  /** `removeDealerFromExpRepetotove`. */
  @Transactional()
  async removeAssign(ctx: SrsContext, idRule: number, idAssign: number, allowAnyTotal: boolean): Promise<RuleDetailDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    await this.requireRule(ctx, idRule)
    const assign = await this.assigns.findWithRule(idAssign)
    if (!assign || Number(assign.idExpRepetitive) !== Number(idRule)) throw new NotFoundException(MSG_NOT_FOUND)
    await this.changeAssigns(
      ctx,
      idRule,
      async () => {
        await this.assigns.remove(assign.id)
      },
      allowAnyTotal,
    )
    return this.detail(ctx, await this.requireRule(ctx, idRule))
  }

  /**
   * `changeAssigns`: el cambio, la validación de los Manual, el recálculo de los Automatic (By percent) o del
   * Amount (By fixed amount) y el histórico en LOG_CHANGE, todo en la transacción del endpoint. Con
   * `allowAnyTotal` no se valida la suma; los Automatic se recalculan igual mientras los Manual no pasen de 100.
   */
  private async changeAssigns(ctx: SrsContext, idRule: number, change: () => Promise<void>, allowAnyTotal = false): Promise<void> {
    const ruleBefore = await this.requireRule(ctx, idRule)
    const before = await this.assigns.listForRule(idRule)
    await change()
    const rule = await this.requireRule(ctx, idRule)
    const after = await this.assigns.listForRule(idRule)
    const fixedAfter = Number(rule.splitType) === SPLIT_BY_FIXED_AMOUNT
    if (fixedAfter) {
      const amount = fixedSum(after.map(asRule))
      if (!samePercent(rule.amount ?? null, amount)) {
        await this.rules.updateAmount(idRule, amount)
        await this.logs.logRule(
          idRule,
          ctx.idUsuario,
          `Recurring expense ${idRule}: Amount ${money(rule.amount)} -> ${money(amount)} (sum of the dealers' amounts)`,
          { before: { amount: rule.amount ?? null }, after: { amount } },
        )
      }
    } else {
      if (!allowAnyTotal) {
        try {
          validateManualSum(after.map(asRule))
        } catch (e) {
          if (e instanceof ExpenseRuleError) throw fieldError('percentage', e.message)
          throw e
        }
      }
      // Con los Manual pasados de 100 no hay qué repartir, pero el total también pasa de 100 y el cron no genera.
      if (manualFits(after.map(asRule))) {
        const distributed = distributeAutomatic(after.map(asRule))
        for (const idAssign of Object.keys(distributed)) {
          const value = after.find((a) => String(a.id) === idAssign)
          if (value && !samePercent(value.percentage ?? null, distributed[idAssign])) {
            await this.assigns.updateAssign(value.id, { percentage: distributed[idAssign] })
          }
        }
      }
    }
    await this.logChanges(
      ctx,
      idRule,
      before,
      await this.assigns.listForRule(idRule),
      Number(ruleBefore.splitType) === SPLIT_BY_FIXED_AMOUNT,
      fixedAfter,
    )
  }

  /** Una fila de LOG_CHANGE por dealer que entró, salió o cambió de modo, de porcentaje o de monto. */
  private async logChanges(
    ctx: SrsContext,
    idRule: number,
    before: ExpenseDealerAssign[],
    after: ExpenseDealerAssign[],
    fixedBefore: boolean,
    fixedAfter: boolean,
  ): Promise<void> {
    const old = new Map(before.map((a) => [a.id, a]))
    const nw = new Map(after.map((a) => [a.id, a]))
    const ids = [...new Set([...old.keys(), ...nw.keys()])]
    const names = await this.dealerNames(ctx, [...new Set([...before, ...after].map((a) => a.idDealer))])
    for (const idAssign of ids) {
      const a = old.get(idAssign) ?? null
      const b = nw.get(idAssign) ?? null
      if (
        a &&
        b &&
        Number(a.hasAutomaticPercentaje) === Number(b.hasAutomaticPercentaje) &&
        samePercent(a.percentage ?? null, b.percentage ?? null) &&
        samePercent(a.fixedAmount ?? null, b.fixedAmount ?? null)
      ) {
        continue
      }
      const dealerId = (b ?? a)!.idDealer
      await this.logs.logRule(
        idRule,
        ctx.idUsuario,
        `Recurring expense ${idRule} - ${names.get(dealerId) ?? dealerId}: ${describe(a, fixedBefore)} -> ${describe(b, fixedAfter)}`,
        {
          idAssign,
          idDealer: dealerId,
          before: a ? { automatic: Number(a.hasAutomaticPercentaje) === 1 ? 1 : 0, percentage: a.percentage ?? null, fixedAmount: a.fixedAmount ?? null } : null,
          after: b ? { automatic: Number(b.hasAutomaticPercentaje) === 1 ? 1 : 0, percentage: b.percentage ?? null, fixedAmount: b.fixedAmount ?? null } : null,
        },
      )
    }
  }

  private async dealerNames(ctx: SrsContext, ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    if (!ids.length) return out
    const rows: { id: unknown; name: unknown }[] = await this.db.query(
      `SELECT c.id, GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS name FROM CONTRATISTA c WHERE c.id IN (${ids.map(() => '?').join(',')})`,
      [ctx.idDealerProvider, ...ids],
    )
    for (const r of rows) out.set(Number(r.id), String(r.name ?? r.id))
    return out
  }

  // ---------------------------------------------------------------- export de dealers (T3)

  /**
   * «Export dealers»: Report Info (regla, Split, Amount, frecuencia, fechas, usuario, fecha y hora) y la hoja
   * Dealers (Dealer ID, Dealer, Mode, Percent, Amount). By percent: Amount = `splitAmount` si `checkRun` da que la
   * regla se genera; si no, vacío y la línea «Amounts not shown: {motivo}». By fixed amount: el monto del dealer.
   */
  async exportDealers(ctx: SrsContext, id: number, res: Response): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const rule = await this.requireRule(ctx, id)
    const detail = await this.detail(ctx, rule)
    const generatedAt = new Date()
    const [locale, generatedBy] = await Promise.all([resolveLocale(this.db, ctx), loadUserName(this.db, ctx.idUsuario)])
    const labels = expenseExportLabels(locale)
    const fixed = Number(rule.splitType) === SPLIT_BY_FIXED_AMOUNT
    const ruleAssigns = detail.assigns.map((a) => ({ id: a.id, percentage: a.percentage, fixedAmount: a.fixedAmount, automatic: a.automatic }))
    const problem = detail.assigns.length ? checkRun(rule.amount ?? null, ruleAssigns, rule.splitType) : null
    const amounts = fixed || problem === null ? splitAmount(rule.amount ?? null, ruleAssigns, rule.splitType) : {}
    const reportInfo: ReportInfoRow[] = [
      { field: labels.report, value: labels.dealersReportName },
      { field: labels.generated, value: formatNyStamp(generatedAt) },
      { field: labels.generatedBy, value: generatedBy },
      { field: labels.screen, value: labels.dealersScreen },
      { field: labels.rule, value: rule.description },
      { field: labels.split, value: fixed ? labels.splitFixed : labels.splitPercent },
      { field: labels.amount, value: detail.amount ?? '-' },
      {
        field: labels.frequency,
        value:
          detail.frequency === 'weekly' ? `${labels.weeklyOn} ${labels.weekDays[detail.weekDay ?? 0]}` : labels.monthly,
      },
      { field: labels.startDate, value: ymdToUs(detail.startDate) },
      { field: labels.endDate, value: detail.endDate ? ymdToUs(detail.endDate) : labels.forever },
    ]
    if (!fixed && problem !== null) reportInfo.push({ field: labels.amountsNotShown, value: problem })
    type Row = AssignRowDto
    const columns: TableExportColumn<Row>[] = [
      { header: labels.colDealerId, width: 12, kind: 'int', value: (r) => r.dealer.id },
      { header: labels.colDealer, width: 40, kind: 'text', value: (r) => r.dealer.name },
      { header: labels.colMode, width: 12, kind: 'text', value: (r) => (fixed ? '' : r.automatic ? labels.automatic : labels.manual) },
      {
        header: labels.colPercent,
        width: 12,
        kind: 'money',
        value: (r) => (fixed || r.percentage === null ? null : Number(fromCents(toCents(r.percentage)))),
      },
      {
        header: labels.colAmount,
        width: 14,
        kind: 'money',
        value: (r) => {
          const v = amounts[String(r.id)]
          return v === undefined ? null : Number(v)
        },
      },
    ]
    const workbook = buildTableExportWorkbook({
      reportInfoSheet: labels.reportInfo,
      reportInfoHeader: { field: labels.field, value: labels.value },
      reportInfo,
      dataSheet: labels.dealersReportName,
      stamp: `${labels.generated} ${formatNyStamp(generatedAt)} · ${rule.description}`,
      columns,
      rows: detail.assigns,
    })
    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader('Content-Disposition', contentDispositionAttachment(buildNyStampedExportFilename(`recurring_${id}_dealers`, generatedAt)))
    await workbook.xlsx.write(res)
  }
}

export type { RuleSplitType }
