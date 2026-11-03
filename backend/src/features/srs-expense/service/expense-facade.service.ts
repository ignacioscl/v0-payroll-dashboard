import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { fieldError } from 'src/commons/errors/field.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_EXPENSES_ADD,
  ROL_ACCION_EXPENSES_APPROVE,
  ROL_ACCION_EXPENSES_EDIT,
  ROL_ACCION_EXPENSES_ON_BEHALF,
  SrsPermissionRepository,
} from 'src/srs/auth/srs-permission.repository'
import { ymdToUs } from 'src/srs/punch/punch-export-format'
import { ExpenseReportRepository, ExpenseScope } from 'src/srs/expenses/repository/expense-report.repository'
import { SingleWithMeta, buildGroupRow, groupSplitTypeName } from 'src/srs/expenses/expense-row-assembler'
import { assertDealersInScope, expenseScopeOf } from 'src/srs/expenses/expense-dealer-scope'
import { nowNyStamp } from 'src/srs/expenses/expense-period'
import type { ExpenseDetail, ExpenseGroupRow, ExpenseLogEntry, ExpenseSingleRow } from 'src/srs/expenses/dto/expense-row.dto'
import { ContratistaService } from 'src/features/srs-contratista/service/contratista.service'
import { ExpenseCatalogService } from 'src/features/srs-generic-data/service/expense-catalog.service'
import { ExpenseGroupService } from 'src/features/expense-group/service/expense-group.service'
import {
  GROUP_SPLIT_AMOUNT,
  GROUP_SPLIT_EQUAL,
  GROUP_SPLIT_PERCENT,
} from 'src/features/expense-group/entity/expense-group.entity'
import { LogGenericService } from 'src/features/srs-log-generic/service/log-generic.service'
import { ExpenseRepetitiveService } from 'src/features/srs-expense-repetitive/service/expense-repetitive.service'
import { ApprovalDto, AttachmentLogDto, CreateExpenseDto, ExpenseBranchDto, ExpenseMode, UpdateExpenseDto } from '../dto/expense.dto'
import { Expense } from '../entity/expense.entity'
import {
  EXPENSE_ESTADO_RETIRED,
  MSG_AT_LEAST_TWO_BRANCHES,
  MSG_ATTACHMENT_BRANCH_LOCKED,
  MSG_CHOOSE_BRANCH,
  MSG_CHOOSE_CATEGORY,
  MSG_CHOOSE_COMPANY,
  MSG_NOT_FOUND,
  MSG_RECEIPT_APPROVED,
  MSG_SOME_BRANCHES_OUTSIDE,
  fromCents,
  splitAmount,
  splitEqual,
  toCents,
  todayNy,
  validateAmount,
  validateAmountSplit,
  validateLength,
  validateManualPercent,
  validatePercentSplit,
  validateReceiptDate,
  DESCRIPTION_MAX,
  NOTES_MAX,
  RECEIPT_NUMBER_MAX,
} from '../rules/expense-rules'
import { ExpenseService } from './expense.service'

/** Lo común a todas las filas de un gasto (suelto o grupo). */
interface CommonFields {
  ticketDate: string
  idCompany: number
  idCategory: number
  description: string
  receiptNumber: string
  notes: string
}

/** El reparto resuelto: una fila por dealer con su importe. */
interface ResolvedSplit {
  mode: ExpenseMode
  splitType: number | null
  rows: { idDealer: number; amount: string }[]
}

/** Lo que `resolveCommon` lee del cuerpo (alta o edición; en la edición `ticketDate` puede faltar). */
type CommonBody = Pick<
  CreateExpenseDto,
  'idCompany' | 'newCompanyName' | 'idCategory' | 'newCategoryName' | 'description' | 'receiptNumber' | 'notes'
> & { ticketDate?: string }

/** Lo que el reparto lee del cuerpo. */
type SplitBody = Pick<CreateExpenseDto, 'idDealer' | 'totalAmount' | 'branches'> & { mode?: ExpenseMode }

const MSG_CHOOSE_MODE = 'Choose how to split the amount.'

const MODE_LABEL: Record<ExpenseMode, string> = {
  single: 'Single dealer',
  equal: 'Equal',
  percent: 'By percentage',
  amount: 'By amount',
}

function stripGroupId(row: ExpenseSingleRow): ExpenseSingleRow {
  const { groupId: _g, ...rest } = row
  return rest
}

/**
 * Alta, edición, aprobación, baja, restauración y log de gastos (T2.2 del plan). Una sola transacción por
 * operación; cada escritura deja su fila en LOG_GENERIC (tipo 7). Toda escritura sobre un grupo visto
 * parcialmente (D8) da 403.
 */
@Injectable()
export class ExpenseFacadeService {
  constructor(
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
    @Inject(ExpenseGroupService) private readonly groups: ExpenseGroupService,
    @Inject(ExpenseCatalogService) private readonly catalog: ExpenseCatalogService,
    @Inject(LogGenericService) private readonly logs: LogGenericService,
    @Inject(ContratistaService) private readonly dealers: ContratistaService,
    @Inject(ExpenseRepetitiveService) private readonly rules: ExpenseRepetitiveService,
    @Inject(ExpenseReportRepository) private readonly report: ExpenseReportRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  private scope(ctx: SrsContext): ExpenseScope {
    return expenseScopeOf(ctx)
  }

  // ---------------------------------------------------------------- lectura

  async get(ctx: SrsContext, id: number): Promise<ExpenseDetail> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    return this.detailByExpenseId(ctx, id)
  }

  async log(ctx: SrsContext, id: number): Promise<{ data: ExpenseLogEntry[] }> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const meta = await this.requireVisible(ctx, id)
    return { data: await this.report.logRows(id, meta.row.groupId ?? null, this.scope(ctx)) }
  }

  /** Un gasto o, si pertenece a un grupo, el grupo con sus filas visibles. 404 si no es de la empresa o no se ve. */
  private async detailByExpenseId(ctx: SrsContext, id: number): Promise<ExpenseDetail> {
    const [meta] = await this.report.rowsByIds([id], this.scope(ctx))
    if (!meta) throw new NotFoundException('Expense not found')
    if (!meta.row.groupId) {
      if (!meta.inScope) throw new NotFoundException('Expense not found')
      return stripGroupId(meta.row)
    }
    return this.groupDetail(ctx, meta.row.groupId, meta.row.deleted ? 0 : 1)
  }

  private async groupDetail(ctx: SrsContext, groupId: number, estado: number): Promise<ExpenseGroupRow> {
    const scope = this.scope(ctx)
    const rows = await this.report.rowsByGroup(groupId, estado, scope)
    const visible = rows.filter((r) => r.inScope)
    if (!visible.length) throw new NotFoundException('Expense not found')
    const agg = (await this.report.groupAggregates([groupId], estado, scope)).get(groupId) ?? {
      total: rows.length,
      approved: 0,
      rejected: 0,
      inScope: visible.length,
      hasLog: false,
      totalCents: rows.reduce((acc, r) => acc + toCents(r.row.amount), 0),
    }
    const group = buildGroupRow(groupId, visible, agg)
    group.rows = group.rows.map(stripGroupId)
    return group
  }

  /** La fila existe, es de la empresa y el usuario la ve (suelta en su alcance o grupo con alguna fila visible). */
  private async requireVisible(ctx: SrsContext, id: number): Promise<SingleWithMeta> {
    const [meta] = await this.report.rowsByIds([id], this.scope(ctx))
    if (!meta) throw new NotFoundException('Expense not found')
    if (meta.inScope) return meta
    if (meta.row.groupId) {
      const rows = await this.report.rowsByGroup(meta.row.groupId, meta.row.deleted ? 0 : 1, this.scope(ctx))
      if (rows.some((r) => r.inScope)) return meta
    }
    throw new NotFoundException('Expense not found')
  }

  /** D8: ninguna escritura sobre un grupo con filas fuera del alcance del usuario. */
  private async assertGroupWritable(ctx: SrsContext, groupId: number, estado: number): Promise<void> {
    const agg = (await this.report.groupAggregates([groupId], estado, this.scope(ctx))).get(groupId)
    if (!agg) throw new NotFoundException('Expense not found')
    if (agg.inScope < agg.total) throw new ForbiddenException(MSG_SOME_BRANCHES_OUTSIDE)
  }

  /** Una fila para escribir: de la empresa; suelta → en el alcance; de un grupo → el grupo entero en el alcance. */
  private async requireWritable(ctx: SrsContext, id: number): Promise<{ expense: Expense; meta: SingleWithMeta }> {
    const expense = await this.expenses.findOwned(id, ctx.idDealerProvider)
    if (!expense) throw new NotFoundException('Expense not found')
    const [meta] = await this.report.rowsByIds([id], this.scope(ctx))
    if (!meta) throw new NotFoundException('Expense not found')
    if (expense.idExpGroup) {
      await this.assertGroupWritable(ctx, expense.idExpGroup, expense.estado)
    } else if (!meta.inScope) {
      throw new NotFoundException('Expense not found')
    }
    return { expense, meta }
  }

  // ---------------------------------------------------------------- resolución del pedido

  /** Los datos comunes del cuerpo; en la edición, `fallbackTicketDate` es la fecha actual si el cuerpo no la trae. */
  private async resolveCommon(ctx: SrsContext, body: CommonBody, fallbackTicketDate?: string): Promise<CommonFields> {
    let ticketDate: string
    try {
      ticketDate = validateReceiptDate(body.ticketDate ?? fallbackTicketDate, todayNy())
    } catch (e) {
      throw fieldError('ticketDate', (e as Error).message)
    }
    const idCompany = await this.resolveCatalog(ctx, 'company', body.idCompany, body.newCompanyName)
    const idCategory = await this.resolveCatalog(ctx, 'category', body.idCategory, body.newCategoryName)
    return {
      ticketDate,
      idCompany,
      idCategory,
      description: this.length(body.description, DESCRIPTION_MAX, 'description'),
      receiptNumber: this.length(body.receiptNumber, RECEIPT_NUMBER_MAX, 'receiptNumber'),
      notes: this.length(body.notes, NOTES_MAX, 'notes'),
    }
  }

  private length(value: string | undefined, max: number, field: string): string {
    try {
      return validateLength(value, max)
    } catch (e) {
      throw fieldError(field, (e as Error).message)
    }
  }

  /** Compañía o categoría: el id de la empresa, o el nombre nuevo (alta al vuelo). De otra empresa → 400 en el campo. */
  private async resolveCatalog(
    ctx: SrsContext,
    kind: 'company' | 'category',
    id: number | undefined,
    newName: string | undefined,
  ): Promise<number> {
    const field = kind === 'company' ? 'idCompany' : 'idCategory'
    const message = kind === 'company' ? MSG_CHOOSE_COMPANY : MSG_CHOOSE_CATEGORY
    if (id) {
      try {
        const item = await this.catalog.requireOwned(ctx, kind, id)
        return item.id
      } catch {
        throw fieldError(field, message)
      }
    }
    const name = (newName ?? '').trim()
    if (!name) throw fieldError(field, message)
    const { item } = await this.catalog.findOrCreate(ctx, kind, name)
    return item.id
  }

  /** Los dealers del pedido: de la empresa (findScopedByIds) y dentro del alcance del usuario (RESTRICTION_DEALER_V2). */
  private assertDealersInScope(ctx: SrsContext, ids: number[], fieldOf: (idDealer: number) => string): Promise<void> {
    return assertDealersInScope(this.dealers, this.report, ctx, ids, fieldOf)
  }

  /** El reparto validado y con los dealers en el alcance del usuario. */
  private async resolveSplit(ctx: SrsContext, body: SplitBody): Promise<ResolvedSplit> {
    const split = this.computeSplit(body)
    if (split.mode === 'single') {
      await this.assertDealersInScope(ctx, [split.rows[0].idDealer], () => 'idDealer')
      return split
    }
    const ids = (body.branches ?? []).map((b) => Number(b.idDealer))
    await this.assertDealersInScope(ctx, ids, (id) => `branches.${ids.indexOf(id)}.idDealer`)
    return split
  }

  /**
   * El reparto del cuerpo sin tocar la base (reglas puras de expense-rules.ts): una fila por dealer con su
   * importe. Lo usa `resolveSplit` y la comparación «¿cambia el reparto?» de un grupo con filas aprobadas.
   */
  private computeSplit(body: SplitBody): ResolvedSplit {
    if (body.mode === undefined) throw fieldError('mode', MSG_CHOOSE_MODE)
    if (body.mode === 'single') {
      if (!body.idDealer) throw fieldError('idDealer', MSG_CHOOSE_BRANCH)
      const amount = this.amount(body.totalAmount, 'totalAmount')
      return { mode: 'single', splitType: null, rows: [{ idDealer: body.idDealer, amount }] }
    }
    const branches: ExpenseBranchDto[] = body.branches ?? []
    if (branches.length < 2) throw fieldError('branches', MSG_AT_LEAST_TWO_BRANCHES)
    const ids = branches.map((b) => Number(b.idDealer))
    const seen = new Set<number>()
    branches.forEach((b, i) => {
      if (seen.has(Number(b.idDealer))) throw fieldError(`branches.${i}.idDealer`, 'This dealer is already in the list.')
      seen.add(Number(b.idDealer))
    })

    if (body.mode === 'equal') {
      const total = this.amount(body.totalAmount, 'totalAmount')
      const amounts = splitEqual(toCents(total), ids)
      return { mode: 'equal', splitType: GROUP_SPLIT_EQUAL, rows: ids.map((id) => ({ idDealer: id, amount: amounts[String(id)] })) }
    }
    if (body.mode === 'percent') {
      branches.forEach((b, i) => {
        try {
          validateManualPercent(b.percentage)
        } catch (e) {
          throw fieldError(`branches.${i}.percentage`, (e as Error).message)
        }
      })
      let normalized: { id: number; percentage: string }[]
      try {
        normalized = validatePercentSplit(branches.map((b) => ({ id: Number(b.idDealer), percentage: b.percentage })))
      } catch (e) {
        throw fieldError('branches', (e as Error).message)
      }
      const total = this.amount(body.totalAmount, 'totalAmount')
      const amounts = splitAmount(total, normalized)
      return { mode: 'percent', splitType: GROUP_SPLIT_PERCENT, rows: ids.map((id) => ({ idDealer: id, amount: amounts[String(id)] })) }
    }
    // By amount: cada monto válido; el total es la suma.
    branches.forEach((b, i) => {
      try {
        validateAmount(b.amount)
      } catch (e) {
        throw fieldError(`branches.${i}.amount`, (e as Error).message)
      }
    })
    let split: ReturnType<typeof validateAmountSplit>
    try {
      split = validateAmountSplit(branches.map((b) => ({ id: Number(b.idDealer), amount: b.amount })))
    } catch (e) {
      throw fieldError('branches', (e as Error).message)
    }
    return { mode: 'amount', splitType: GROUP_SPLIT_AMOUNT, rows: split.rows.map((r) => ({ idDealer: r.id, amount: r.amount })) }
  }

  private amount(value: string | undefined, field: string): string {
    try {
      return validateAmount(value)
    } catch (e) {
      throw fieldError(field, (e as Error).message)
    }
  }

  /** «Assign to employee»: solo con 117; el empleado tiene que estar asignado a alguno de los dealers del gasto. */
  private async resolveAuthor(ctx: SrsContext, idAuthor: number | undefined, dealerIds: number[]): Promise<number> {
    if (!idAuthor || idAuthor === ctx.idUsuario) return ctx.idUsuario
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_ON_BEHALF)
    if (!(await this.report.employeeAssigned(ctx.idDealerProvider, idAuthor, dealerIds))) {
      throw fieldError('idAuthor', 'Choose an employee assigned to the selected dealers.')
    }
    return idAuthor
  }

  /**
   * Edición: el autor se valida (117 + empleado asignado) **solo si cambia** respecto del actual; si no viene o es
   * el mismo, se conserva sin validar nada (paridad con ExpenseHelper.php:31-33, que solo lo pisa si viene otro).
   */
  private resolveAuthorChange(ctx: SrsContext, idAuthor: number | undefined, current: number, dealerIds: number[]): Promise<number> {
    if (idAuthor === undefined || Number(idAuthor) === Number(current)) return Promise.resolve(current)
    return this.resolveAuthor(ctx, idAuthor, dealerIds)
  }

  private async resolveRule(ctx: SrsContext, idExpRepetitive: number | undefined): Promise<number | null> {
    if (!idExpRepetitive) return null
    const rule = await this.rules.findOwned(idExpRepetitive, ctx.idDealerProvider)
    if (!rule) throw fieldError('idExpRepetitive', MSG_NOT_FOUND)
    return rule.id
  }

  // ---------------------------------------------------------------- alta

  @Transactional()
  async create(ctx: SrsContext, body: CreateExpenseDto): Promise<ExpenseDetail> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_ADD)
    const common = await this.resolveCommon(ctx, body)
    const split = await this.resolveSplit(ctx, body)
    const idAuthor = await this.resolveAuthor(ctx, body.idAuthor, split.rows.map((r) => r.idDealer))
    const idExpRepetitive = await this.resolveRule(ctx, body.idExpRepetitive)

    if (split.mode === 'single') {
      const created = await this.insertRow(ctx, common, split.rows[0], idAuthor, idExpRepetitive, null)
      await this.catalog.setLastCategory(ctx, common.idCompany, common.idCategory)
      return this.detailByExpenseId(ctx, created.id)
    }

    const group = await this.groups.create({
      idDetailer: ctx.idDealerProvider,
      idCreatedBy: ctx.idUsuario,
      splitType: split.splitType as number,
      idAttachmentExpense: null,
    })
    const ids: number[] = []
    for (const row of split.rows) {
      const created = await this.insertRow(ctx, common, row, idAuthor, idExpRepetitive, group.id as number)
      ids.push(created.id)
    }
    await this.groups.setAttachmentExpense(group.id as number, Math.min(...ids))
    await this.logs.logGroup(group.id as number, ctx.idUsuario, `Group created (${ids.length} dealers, ${MODE_LABEL[split.mode]})`)
    await this.catalog.setLastCategory(ctx, common.idCompany, common.idCategory)
    return this.groupDetail(ctx, group.id as number, 1)
  }

  private async insertRow(
    ctx: SrsContext,
    common: CommonFields,
    row: { idDealer: number; amount: string },
    idAuthor: number,
    idExpRepetitive: number | null,
    idExpGroup: number | null,
    logLabel = 'Expense created',
  ): Promise<Expense> {
    const created = await this.expenses.create({
      idDetailer: ctx.idDealerProvider,
      idDealer: row.idDealer,
      idAuthor,
      idCreatedBy: ctx.idUsuario,
      idCompany: common.idCompany,
      idCategory: common.idCategory,
      idExpRepetitive,
      idExpGroup,
      amount: row.amount,
      ticketDate: common.ticketDate,
      hasOtherPhoto: 0,
      notes: common.notes,
      description: common.description || null,
      receiptNumber: common.receiptNumber || null,
      isApproved: null,
      estado: 1,
    })
    await this.logs.logExpense(created.id, ctx.idUsuario, `${logLabel} ($${fromCents(toCents(row.amount))})`)
    return created
  }

  // ---------------------------------------------------------------- edición

  @Transactional()
  async update(ctx: SrsContext, id: number, body: UpdateExpenseDto): Promise<ExpenseDetail> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_EDIT)
    if (body.kind === 'group') return this.updateGroup(ctx, id, body)
    const expense = await this.expenses.findOwned(id, ctx.idDealerProvider)
    if (!expense) throw new NotFoundException('Expense not found')
    if (expense.idExpGroup) return this.updateGroup(ctx, expense.idExpGroup, body)
    return this.updateSingle(ctx, expense, body)
  }

  /** Gasto suelto: como el `save` legacy (aprobado → 409); con adjunto la Branch no cambia. */
  private async updateSingle(ctx: SrsContext, expense: Expense, body: UpdateExpenseDto): Promise<ExpenseDetail> {
    const { meta } = await this.requireWritable(ctx, expense.id)
    if (Number(expense.isApproved) === 1) throw new ConflictException(MSG_RECEIPT_APPROVED)
    if (body.mode === undefined) throw fieldError('mode', MSG_CHOOSE_MODE)
    if (body.mode !== 'single') throw fieldError('mode', 'A single expense keeps one dealer.')
    const common = await this.resolveCommon(ctx, body)
    const idDealer = body.idDealer ?? expense.idDealer
    if (idDealer !== expense.idDealer) {
      if (meta.row.hasAttachment) throw fieldError('idDealer', MSG_ATTACHMENT_BRANCH_LOCKED)
      await this.assertDealersInScope(ctx, [idDealer], () => 'idDealer')
    }
    const amount = body.totalAmount !== undefined ? this.amount(body.totalAmount, 'totalAmount') : fromCents(toCents(expense.amount))
    const idAuthor = await this.resolveAuthorChange(ctx, body.idAuthor, expense.idAuthor, [idDealer])
    const idExpRepetitive = body.idExpRepetitive !== undefined ? await this.resolveRule(ctx, body.idExpRepetitive) : expense.idExpRepetitive ?? null

    const changes = await this.describeChanges(ctx, meta.row, {
      ticketDate: common.ticketDate,
      idCompany: common.idCompany,
      idCategory: common.idCategory,
      idDealer,
      amount,
      idAuthor,
      description: common.description,
      receiptNumber: common.receiptNumber,
      notes: common.notes,
    })
    await this.expenses.updateById(expense.id, {
      ticketDate: common.ticketDate,
      idCompany: common.idCompany,
      idCategory: common.idCategory,
      idDealer,
      amount,
      idAuthor,
      idExpRepetitive,
      description: common.description || null,
      receiptNumber: common.receiptNumber || null,
      notes: common.notes,
    })
    if (changes.length) await this.logs.logExpense(expense.id, ctx.idUsuario, changes.join('; '))
    if (common.idCategory !== expense.idCategory || common.idCompany !== expense.idCompany) {
      await this.catalog.setLastCategory(ctx, common.idCompany, common.idCategory)
    }
    return this.detailByExpenseId(ctx, expense.id)
  }

  /** «Receipt date: 10/01/2026 -> 10/02/2026; Amount: 10.00 -> 12.00» (texto plano, no HTML). */
  private async describeChanges(
    ctx: SrsContext,
    before: ExpenseSingleRow,
    after: {
      ticketDate: string
      idCompany: number
      idCategory: number
      idDealer: number
      amount: string
      idAuthor: number
      description: string
      receiptNumber: string
      notes: string
    },
  ): Promise<string[]> {
    const parts: string[] = []
    if (after.ticketDate !== before.ticketDate) parts.push(`Receipt date: ${ymdToUs(before.ticketDate)} -> ${ymdToUs(after.ticketDate)}`)
    if (after.idCompany !== before.company.id || after.idCategory !== before.category.id) {
      const names = await this.report.genericNames(ctx.idDealerProvider, [after.idCompany, after.idCategory])
      if (after.idCompany !== before.company.id) parts.push(`Company: ${before.company.name} -> ${names.get(after.idCompany) ?? after.idCompany}`)
      if (after.idCategory !== before.category.id) parts.push(`Category: ${before.category.name} -> ${names.get(after.idCategory) ?? after.idCategory}`)
    }
    if (after.idDealer !== before.dealer.id) {
      const names = await this.report.dealerNames(ctx.idDealerProvider, [after.idDealer])
      parts.push(`Branch: ${before.dealer.name} -> ${names.get(after.idDealer) ?? after.idDealer}`)
    }
    if (toCents(after.amount) !== toCents(before.amount)) parts.push(`Amount: ${before.amount} -> ${after.amount}`)
    if (after.idAuthor !== before.author.id) {
      const names = await this.report.userNames(ctx.idDealerProvider, [after.idAuthor])
      parts.push(`Assigned to: ${before.author.name} -> ${names.get(after.idAuthor) ?? after.idAuthor}`)
    }
    if (after.description !== before.description) parts.push(`Description: ${before.description || '-'} -> ${after.description || '-'}`)
    if (after.receiptNumber !== before.receiptNumber) parts.push(`Receipt #: ${before.receiptNumber || '-'} -> ${after.receiptNumber || '-'}`)
    if (after.notes !== before.notes) parts.push(`Notes: ${before.notes || '-'} -> ${after.notes || '-'}`)
    return parts
  }

  /**
   * Grupo: datos comunes a todas las filas y, si viene el reparto, update / insert / soft-delete por dealer. Con
   * alguna fila aprobada solo notes, description y receipt #.
   */
  private async updateGroup(ctx: SrsContext, groupId: number, body: UpdateExpenseDto): Promise<ExpenseDetail> {
    const group = await this.groups.findOwned(groupId, ctx.idDealerProvider)
    if (!group) throw new NotFoundException('Expense not found')
    await this.assertGroupWritable(ctx, groupId, 1)
    const scope = this.scope(ctx)
    const current = await this.report.rowsByGroup(groupId, 1, scope)
    if (!current.length) throw new NotFoundException('Expense not found')
    const first = current[0].row
    const anyApproved = current.some((r) => r.row.status === 'approved')

    if (anyApproved) {
      const description = this.length(body.description, DESCRIPTION_MAX, 'description')
      const receiptNumber = this.length(body.receiptNumber, RECEIPT_NUMBER_MAX, 'receiptNumber')
      const notes = this.length(body.notes, NOTES_MAX, 'notes')
      const touchesLocked =
        (body.ticketDate !== undefined && body.ticketDate !== first.ticketDate) ||
        (body.idCompany !== undefined && Number(body.idCompany) !== first.company.id) ||
        (body.idCategory !== undefined && Number(body.idCategory) !== first.category.id) ||
        (body.idAuthor !== undefined && Number(body.idAuthor) !== first.author.id) ||
        (body.newCompanyName ?? '').trim() !== '' ||
        (body.newCategoryName ?? '').trim() !== '' ||
        this.splitChanges(body, group.splitType, current)
      if (touchesLocked) throw new ConflictException(MSG_RECEIPT_APPROVED)
      for (const r of current) {
        const changes = await this.describeChanges(ctx, r.row, {
          ticketDate: r.row.ticketDate,
          idCompany: r.row.company.id,
          idCategory: r.row.category.id,
          idDealer: r.row.dealer.id,
          amount: r.row.amount,
          idAuthor: r.row.author.id,
          description,
          receiptNumber,
          notes,
        })
        await this.expenses.updateById(r.row.id, { description: description || null, receiptNumber: receiptNumber || null, notes })
        if (changes.length) await this.logs.logExpense(r.row.id, ctx.idUsuario, changes.join('; '))
      }
      return this.groupDetail(ctx, groupId, 1)
    }

    const common = await this.resolveCommon(ctx, body, first.ticketDate)
    const mode: ExpenseMode = body.mode ?? groupSplitTypeName(group.splitType)
    const split = body.branches !== undefined && mode !== 'single' ? await this.resolveSplit(ctx, { ...body, mode }) : null
    const dealerIds = split ? split.rows.map((r) => r.idDealer) : current.map((r) => r.row.dealer.id)
    const idAuthor = await this.resolveAuthorChange(ctx, body.idAuthor, first.author.id, dealerIds)

    const byDealer = new Map(current.map((r) => [r.row.dealer.id, r]))
    if (split) {
      const keep = new Set(split.rows.map((r) => r.idDealer))
      const attachmentRow = current.find((r) => r.row.id === group.idAttachmentExpense)
      if (attachmentRow && attachmentRow.row.hasAttachment && !keep.has(attachmentRow.row.dealer.id)) {
        throw fieldError('branches', MSG_ATTACHMENT_BRANCH_LOCKED)
      }
      const splitChanged = this.splitChanges(body, group.splitType, current)
      if (splitChanged) {
        await this.retireDeletedRows(ctx, groupId)
        for (const r of current) {
          if (!keep.has(r.row.dealer.id)) await this.retireRow(ctx, r.row.id, r.row.amount)
        }
      }
      const remainingIds: number[] = []
      for (const row of split.rows) {
        const existing = byDealer.get(row.idDealer)
        if (existing) {
          await this.applyCommon(ctx, existing.row, common, idAuthor, row.amount)
          remainingIds.push(existing.row.id)
        } else {
          const created = await this.insertRow(ctx, common, row, idAuthor, first.idExpRepetitive ?? null, groupId, 'Dealer added')
          remainingIds.push(created.id)
        }
      }
      if (split.splitType !== null && split.splitType !== group.splitType) await this.groups.setSplitType(groupId, split.splitType)
      if (!group.idAttachmentExpense || !remainingIds.includes(group.idAttachmentExpense)) {
        await this.groups.setAttachmentExpense(groupId, Math.min(...remainingIds))
      }
      if (splitChanged) await this.logs.logGroup(groupId, ctx.idUsuario, `Split changed (${split.rows.length} dealers, ${MODE_LABEL[split.mode]})`)
    } else {
      for (const r of current) await this.applyCommon(ctx, r.row, common, idAuthor, r.row.amount)
    }
    if (common.idCategory !== first.category.id || common.idCompany !== first.company.id) {
      await this.catalog.setLastCategory(ctx, common.idCompany, common.idCategory)
    }
    return this.groupDetail(ctx, groupId, 1)
  }

  /**
   * ¿El cuerpo cambia el reparto de un grupo? Solo si trae `mode`, `totalAmount` o `branches` distintos de lo
   * grabado: mismos dealers con los mismos importes (en centavos) y el mismo tipo de reparto no cuentan como
   * cambio, aunque vengan en el cuerpo. Un reparto que no pasa las reglas (porcentajes que no suman 100, etc.)
   * también es un intento de cambio.
   */
  private splitChanges(body: SplitBody, currentSplitType: number, current: SingleWithMeta[]): boolean {
    const currentMode = groupSplitTypeName(currentSplitType)
    if (body.mode !== undefined && body.mode !== currentMode) return true
    const currentTotal = current.reduce((acc, r) => acc + toCents(r.row.amount), 0)
    if (body.totalAmount !== undefined && toCents(body.totalAmount) !== currentTotal) return true
    if (body.branches === undefined) return false
    let split: ResolvedSplit
    try {
      split = this.computeSplit({ ...body, mode: body.mode ?? currentMode })
    } catch {
      return true
    }
    if (split.rows.length !== current.length) return true
    const byDealer = new Map(current.map((r) => [r.row.dealer.id, toCents(r.row.amount)]))
    return split.rows.some((r) => byDealer.get(r.idDealer) !== toCents(r.amount))
  }

  private async applyCommon(ctx: SrsContext, row: ExpenseSingleRow, common: CommonFields, idAuthor: number, amount: string) {
    const changes = await this.describeChanges(ctx, row, {
      ticketDate: common.ticketDate,
      idCompany: common.idCompany,
      idCategory: common.idCategory,
      idDealer: row.dealer.id,
      amount,
      idAuthor,
      description: common.description,
      receiptNumber: common.receiptNumber,
      notes: common.notes,
    })
    await this.expenses.updateById(row.id, {
      ticketDate: common.ticketDate,
      idCompany: common.idCompany,
      idCategory: common.idCategory,
      amount,
      idAuthor,
      description: common.description || null,
      receiptNumber: common.receiptNumber || null,
      notes: common.notes,
    })
    if (changes.length) await this.logs.logExpense(row.id, ctx.idUsuario, changes.join('; '))
  }

  // ---------------------------------------------------------------- aprobación

  @Transactional()
  async setApproval(ctx: SrsContext, id: number, body: ApprovalDto): Promise<ExpenseDetail> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const { expense } = await this.requireWritable(ctx, id)
    await this.applyApproval(ctx, expense, body.approved)
    return this.detailByExpenseId(ctx, id)
  }

  /** Approve / Reject de grupo: solo las filas activas pendientes; las ya decididas quedan (legacy decide fila por fila). */
  @Transactional()
  async setGroupApproval(ctx: SrsContext, groupId: number, body: ApprovalDto): Promise<ExpenseDetail> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const group = await this.groups.findOwned(groupId, ctx.idDealerProvider)
    if (!group) throw new NotFoundException('Expense not found')
    await this.assertGroupWritable(ctx, groupId, 1)
    const rows = await this.expenses.findByGroup(groupId, ctx.idDealerProvider, 1)
    let n = 0
    for (const e of rows) {
      if (e.isApproved !== null && e.isApproved !== undefined) continue
      await this.applyApproval(ctx, e, body.approved)
      n++
    }
    await this.logs.logGroup(groupId, ctx.idUsuario, `Group ${body.approved ? 'approved' : 'rejected'} (${n} pending dealers)`)
    return this.groupDetail(ctx, groupId, 1)
  }

  private async applyApproval(ctx: SrsContext, expense: Expense, approved: boolean): Promise<void> {
    await this.expenses.updateById(expense.id, {
      isApproved: approved ? 1 : 0,
      idAuthorApproved: ctx.idUsuario,
      approvedDate: nowNyStamp(),
    })
    await this.logs.logExpense(expense.id, ctx.idUsuario, approved ? 'Receipt approved' : 'Receipt rejected')
  }

  // ---------------------------------------------------------------- baja y restauración

  @Transactional()
  async remove(ctx: SrsContext, id: number): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_EDIT)
    const { expense } = await this.requireWritable(ctx, id)
    if (Number(expense.estado) !== 1) throw new NotFoundException('Expense not found')
    await this.softDelete(ctx, id)
    if (expense.idExpGroup) await this.closeGroupIfEmpty(ctx, expense.idExpGroup)
  }

  @Transactional()
  async removeGroup(ctx: SrsContext, groupId: number): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_EDIT)
    const group = await this.groups.findOwned(groupId, ctx.idDealerProvider)
    if (!group) throw new NotFoundException('Expense not found')
    await this.assertGroupWritable(ctx, groupId, 1)
    const rows = await this.expenses.findByGroup(groupId, ctx.idDealerProvider, 1)
    if (!rows.length) throw new NotFoundException('Expense not found')
    // Restaurar devuelve el gasto como estaba al borrarlo: lo que ya estaba borrado no es parte de él.
    await this.retireDeletedRows(ctx, groupId)
    for (const e of rows) await this.softDelete(ctx, e.id)
    await this.logs.logGroup(groupId, ctx.idUsuario, `Group deleted (${rows.length} dealers)`)
    await this.groups.setDeleted(groupId, true)
  }

  private async softDelete(ctx: SrsContext, id: number): Promise<void> {
    await this.expenses.updateById(id, { estado: 0, idAuthorDel: ctx.idUsuario, deletedDate: nowNyStamp() })
    await this.logs.logExpense(id, ctx.idUsuario, 'Receipt deleted')
  }

  /** La fila deja de ser parte del gasto (`EXPENSE_ESTADO_RETIRED`): queda por el histórico y no se restaura. */
  private async retireRow(ctx: SrsContext, id: number, amount: string): Promise<void> {
    await this.expenses.updateById(id, { estado: EXPENSE_ESTADO_RETIRED, idAuthorDel: ctx.idUsuario, deletedDate: nowNyStamp() })
    await this.logs.logExpense(id, ctx.idUsuario, `Dealer removed ($${fromCents(toCents(amount))})`)
  }

  private async retireDeletedRows(ctx: SrsContext, groupId: number): Promise<void> {
    const deleted = await this.expenses.findByGroup(groupId, ctx.idDealerProvider, 0)
    for (const e of deleted) await this.retireRow(ctx, e.id, e.amount)
  }

  private async closeGroupIfEmpty(ctx: SrsContext, groupId: number): Promise<void> {
    const active = await this.expenses.findByGroup(groupId, ctx.idDealerProvider, 1)
    if (!active.length) await this.groups.setDeleted(groupId, true)
  }

  @Transactional()
  async restore(ctx: SrsContext, id: number): Promise<ExpenseDetail> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_EDIT)
    const { expense } = await this.requireWritable(ctx, id)
    if (Number(expense.estado) === 1) return this.detailByExpenseId(ctx, id)
    await this.reactivate(id)
    await this.logs.logExpense(id, ctx.idUsuario, 'Receipt activated')
    if (expense.idExpGroup) await this.groups.setDeleted(expense.idExpGroup, false)
    return this.detailByExpenseId(ctx, id)
  }

  /**
   * Restaura todas las filas borradas del grupo (todas tienen que estar en el alcance: D8 → 403) y reabre el
   * grupo; log «Group restored (N dealers)» por fila y por grupo. Sin filas borradas devuelve el grupo como está.
   */
  @Transactional()
  async restoreGroup(ctx: SrsContext, groupId: number): Promise<ExpenseDetail> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_EDIT)
    const group = await this.groups.findOwned(groupId, ctx.idDealerProvider)
    if (!group) throw new NotFoundException('Expense not found')
    const agg = (await this.report.groupAggregates([groupId], 0, this.scope(ctx))).get(groupId)
    if (!agg) return this.groupDetail(ctx, groupId, 1)
    if (agg.inScope < agg.total) throw new ForbiddenException(MSG_SOME_BRANCHES_OUTSIDE)
    const deleted = await this.expenses.findByGroup(groupId, ctx.idDealerProvider, 0)
    const text = `Group restored (${deleted.length} dealers)`
    for (const e of deleted) {
      await this.reactivate(e.id)
      await this.logs.logExpense(e.id, ctx.idUsuario, text)
    }
    await this.logs.logGroup(groupId, ctx.idUsuario, text)
    await this.groups.setDeleted(groupId, false)
    return this.groupDetail(ctx, groupId, 1)
  }

  /** `estado = 1` y sin rastro de la baja (quién y cuándo), en la fila y en el grupo. */
  private async reactivate(id: number): Promise<void> {
    await this.expenses.updateById(id, { estado: 1, idAuthorDel: null, deletedDate: null })
  }

  // ---------------------------------------------------------------- adjuntos

  /**
   * «Attachment {filename}» en LOG_GENERIC (tipo 7) de la fila; si la fila es la del adjunto de su grupo
   * (`id_attachment_expense`), la misma fila de log lleva también `id_exp_group`. De acá sale `hasAttachment`.
   * Mismo control que la subida (`assertCanAttach`).
   */
  @Transactional()
  async logAttachment(ctx: SrsContext, id: number, body: AttachmentLogDto): Promise<void> {
    const meta = await this.assertCanAttach(ctx, id)
    const idExpGroup = meta.row.groupId && meta.groupAttachmentExpense === id ? meta.row.groupId : null
    await this.logs.logExpense(id, ctx.idUsuario, `Attachment ${body.filename.trim()}`, idExpGroup)
  }

  /**
   * ¿Puede subir un adjunto a este gasto? El BFF lo pregunta ANTES de mandar el archivo al Node. Permiso 110 o 118;
   * gasto activo y escribible (empresa y alcance, D8: un grupo visto en parte da 403).
   */
  async assertCanAttach(ctx: SrsContext, id: number): Promise<SingleWithMeta> {
    if (!(await this.permissions.userHasRolAccion(ctx, ROL_ACCION_EXPENSES_ADD))) {
      await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_EDIT)
    }
    const { expense, meta } = await this.requireWritable(ctx, id)
    if (Number(expense.estado) !== 1) throw new NotFoundException('Expense not found')
    return meta
  }
}
