import { Inject, Injectable } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { monthBounds } from 'src/srs/monthly-closing/dto/monthly-closing-month'
import { periodsEndingInMonth } from 'src/srs/payroll/snapshot/payroll-month-periods'
import { PayrollSourceRepository, WorkOrderPieceworkState } from 'src/srs/payroll/snapshot/payroll-source.repository'
import type { PayrollPeriod, PayrollProviderConfig } from 'src/srs/payroll/snapshot/payroll-snapshot.types'
import { GROUP_SPLIT_AMOUNT } from 'src/features/expense-group/entity/expense-group.entity'
import { ExpenseGroupService } from 'src/features/expense-group/service/expense-group.service'
import { LogChangeService } from 'src/features/srs-log-change/service/log-change.service'
import { LogGenericService } from 'src/features/srs-log-generic/service/log-generic.service'
import { Expense } from '../entity/expense.entity'
import { ExpensePieceworkWo } from '../entity/expense-piecework-wo.entity'
import { ExpensePieceworkWoHistory } from '../entity/expense-piecework-wo-history.entity'
import { ExpensePieceworkWoHistoryRepository } from '../repository/expense-piecework-wo-history.repository'
import { ExpensePieceworkWoRepository, PieceworkUnitKey } from '../repository/expense-piecework-wo.repository'
import {
  LiveWindow,
  PIECEWORK_REASON,
  PieceworkInputs,
  amountsByExpenseRow,
  changeReasons,
  currentAmount,
  decideRow,
  encodeReasons,
  periodContaining,
} from '../rules/expense-piecework-recalc'
import { fromCents, toCents } from '../rules/expense-rules'
import { ExpenseService } from './expense.service'

type HistoryRow = Omit<ExpensePieceworkWoHistory, 'id' | 'createdAt'>

/** Una fila nueva de la expense (alta de una WO en Edit, o un servicio que apareció en la WO). */
export interface NewPieceworkRow {
  idInvoice: number
  idService: number
  idDealer: number
  workDate: string
  amount: string
  inputs: PieceworkInputs
}

/** Lo que se cambió en una unidad: para el log y el resultado de la corrida. */
interface UnitChanges {
  history: HistoryRow[]
  /** Fila de EXP_EXPENSE → quién firma su línea de LOG_GENERIC. */
  authorByExpense: Map<number, number>
}

const nowUtc = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

/** Lo que entró en el cálculo de un servicio de la WO hoy (las columnas `src_*`). */
export function inputsOf(header: WorkOrderPieceworkState, svc: WorkOrderPieceworkState | undefined): PieceworkInputs {
  return {
    woEstado: header.woEstado,
    hasService: svc ? 1 : 0,
    hasVendor: header.hasVendor,
    servicePiecework: svc?.servicePiecework ?? null,
    servicePrice: svc?.servicePrice ?? null,
    employeePiecework: svc?.employeePiecework ?? null,
    employeeCount: header.employeeCount,
  }
}

function srcPatch(inputs: PieceworkInputs): Partial<ExpensePieceworkWo> {
  return {
    srcWoEstado: inputs.woEstado,
    srcHasService: inputs.hasService,
    srcHasVendor: inputs.hasVendor,
    srcServicePiecework: inputs.servicePiecework,
    srcServicePrice: inputs.servicePrice,
    srcEmployeePiecework: inputs.employeePiecework,
    srcEmployeeCount: inputs.employeeCount,
  }
}

function storedInputs(r: ExpensePieceworkWo): PieceworkInputs {
  return {
    woEstado: r.srcWoEstado ?? null,
    hasService: r.srcHasService ?? null,
    hasVendor: r.srcHasVendor ?? null,
    servicePiecework: r.srcServicePiecework ?? null,
    servicePrice: r.srcServicePrice ?? null,
    employeePiecework: r.srcEmployeePiecework ?? null,
    employeeCount: r.srcEmployeeCount ?? null,
  }
}

/**
 * «La expense Piecework sigue a sus WO» (plans/plan-reunion-juan-18-11 v9, tema 4, sección v6; T5b).
 *
 * - **La noche** (`recalcPeriod`): el job del snapshot de Payroll lo llama dentro de la transacción de `rewritePeriod`,
 *   para cada pay period que acaba de reescribir. Vuelve a calcular las filas de las expenses Piecework activas
 *   (aprobadas también, D19) que tocan ese pay period, con la misma función que el Payroll, y aplica `decideRow`: la
 *   fila sigue siempre al snapshot del pay period donde queda contada (R2 de los dos ciclos), sale y queda libre si la
 *   WO pasó fuera de los pay periods de la expense (D20). Cada cambio queda en el histórico con su motivo (R4).
 * - **Edit** (`applyEdit`, D18): agrega y saca WO con el histórico `source = edit`.
 *
 * En los dos casos, después se vuelven a armar los montos de EXP_EXPENSE de cada dealer con todas las filas de la
 * expense (las que cambiaron y las que no): una expense se escribe completa o no se escribe.
 */
@Injectable()
export class ExpensePieceworkRecalcService {
  constructor(
    @Inject(PayrollSourceRepository) private readonly source: PayrollSourceRepository,
    @Inject(ExpensePieceworkWoRepository) private readonly rows: ExpensePieceworkWoRepository,
    @Inject(ExpensePieceworkWoHistoryRepository) private readonly history: ExpensePieceworkWoHistoryRepository,
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
    @Inject(ExpenseGroupService) private readonly groups: ExpenseGroupService,
    @Inject(LogGenericService) private readonly logs: LogGenericService,
    @Inject(LogChangeService) private readonly logChanges: LogChangeService,
  ) {}

  /**
   * La noche, para un pay period que el Payroll acaba de reescribir. `window` = la ventana que el Payroll de la noche
   * mantiene al día (`ventana`..`corte` del job), también en una corrida a mano con rango. Devuelve cuántas filas
   * cambiaron.
   */
  @Transactional()
  async recalcPeriod(provider: PayrollProviderConfig, periodo: PayrollPeriod, window: LiveWindow): Promise<number> {
    const units = await this.rows.unitsTouchingPeriod(provider.idContratista, periodo.desde, periodo.hasta)
    const monthPeriods = new Map<string, PayrollPeriod[]>()
    let changed = 0
    for (const unit of units) changed += await this.recalcUnit(provider, unit, periodo, window, monthPeriods)
    return changed
  }

  private async recalcUnit(
    provider: PayrollProviderConfig,
    unit: PieceworkUnitKey,
    periodo: PayrollPeriod,
    window: LiveWindow,
    monthPeriods: Map<string, PayrollPeriod[]>,
  ): Promise<number> {
    const idDetailer = provider.idContratista
    const rows = await this.rows.activeRowsOfUnit(idDetailer, unit)
    const expenseRows = await this.expenseRowsOf(idDetailer, unit)
    if (!rows.length || !expenseRows.length) return 0
    const vendor = rows[0].idEmployee
    const invoiceIds = [...new Set(rows.map((r) => r.idInvoice))]
    const state = await this.source.workOrderPieceworkState(idDetailer, vendor, invoiceIds)
    const byInvoice = new Map<number, WorkOrderPieceworkState[]>()
    for (const s of state) byInvoice.set(s.idInvoice, [...(byInvoice.get(s.idInvoice) ?? []), s])

    const inPeriod = (d: string) => d >= periodo.desde && d <= periodo.hasta
    const selected = rows.filter((r) => inPeriod(r.workDate) || inPeriod(byInvoice.get(r.idInvoice)?.[0]?.workDate ?? ''))
    if (!selected.length) return 0

    const month = expenseRows[0].ticketDate.slice(0, 7)
    if (!monthPeriods.has(month)) {
      const { firstDay, lastDay } = monthBounds(month)
      monthPeriods.set(month, await periodsEndingInMonth(this.source, idDetailer, firstDay, lastDay))
    }
    const expensePeriods = monthPeriods.get(month) as PayrollPeriod[]
    const dates = selected.flatMap((r) => [r.workDate, byInvoice.get(r.idInvoice)?.[0]?.workDate ?? r.workDate]).sort()
    const periods = await this.source.getPeriods(provider, dates[0], dates[dates.length - 1])
    const lastChanges = await this.logChanges.lastWorkOrderChanges(idDetailer, invoiceIds)
    const who = (idInvoice: number) => lastChanges.get(idInvoice) ?? null

    const changes: UnitChanges = { history: [], authorByExpense: new Map() }
    const checkedAt = nowUtc()
    const updatedInvoices = new Set<number>()
    const groupState = { unit, expenseRows }

    for (const r of selected) {
      const services = byInvoice.get(r.idInvoice) ?? []
      const header = services[0]
      if (!header) continue // la WO no es de la empresa: no pasa (FK + id_dealer_provider), pero no se toca
      const svc = services.find((s) => s.idService === r.idInvoiceService)
      const inputs = inputsOf(header, svc)
      const decision = decideRow(periodContaining(r.workDate, periods), periodContaining(header.workDate, periods), expensePeriods, window)
      const by = who(r.idInvoice)
      const base = {
        idPieceworkWo: r.id as number,
        idInvoice: r.idInvoice,
        oldAmount: fromCents(toCents(r.amount)),
        oldIdDealer: r.idDealer,
        oldWorkDate: r.workDate,
        source: 'nightly' as const,
        idUsuario: null,
        woChangedBy: by?.idAutor ?? null,
        woChangedAt: by?.fecha ?? null,
      }
      const author = by?.idAutor ?? expenseRows[0].idCreatedBy

      if (decision.kind === 'keep') continue

      if (decision.kind === 'release') {
        // D20: la WO pasó fuera de los pay periods de la expense. Sale y queda libre para la expense de su mes.
        changes.history.push({
          ...base,
          idExpense: r.idExpense,
          newAmount: '0.00',
          newIdDealer: header.idDealer,
          newWorkDate: header.workDate,
          reason: PIECEWORK_REASON.movedOut,
          detail: encodeReasons([{ code: PIECEWORK_REASON.movedOut, from: r.workDate, to: header.workDate }]),
        })
        changes.authorByExpense.set(r.idExpense, author)
        await this.rows.updateRow(r.id as number, { ...srcPatch(inputs), checkedAt })
        await this.rows.release(r.id as number)
        continue
      }

      if (decision.kind === 'zero_in_origin') {
        // R2: la fecha nueva cae en otro pay period de la expense que el Payroll ya no recalcula: el del origen ya no
        // tiene la WO y el del destino nunca la sumó. Queda en el origen, en $0, sin liberarse.
        if (toCents(r.amount) !== 0) {
          changes.history.push({
            ...base,
            idExpense: r.idExpense,
            newAmount: '0.00',
            newIdDealer: r.idDealer,
            newWorkDate: r.workDate,
            reason: PIECEWORK_REASON.movedFrozen,
            detail: encodeReasons([{ code: PIECEWORK_REASON.movedFrozen, from: r.workDate, to: header.workDate }]),
          })
          changes.authorByExpense.set(r.idExpense, author)
        }
        await this.rows.updateRow(r.id as number, { amount: '0.00', ...srcPatch(inputs), checkedAt })
        continue
      }

      // update: el monto, el dealer y la fecha de hoy.
      updatedInvoices.add(r.idInvoice)
      const newAmount = currentAmount(svc ? String(svc.piecework) : '0', inputs)
      const reasons = changeReasons(
        { amount: r.amount, idDealer: r.idDealer, workDate: r.workDate, checkedAt: r.checkedAt ?? null, inputs: storedInputs(r) },
        { piecework: newAmount, idDealer: header.idDealer, workDate: header.workDate, inputs },
        newAmount,
      )
      const moved = header.idDealer !== r.idDealer
      const idExpense = moved ? await this.dealerRow(idDetailer, groupState, header.idDealer) : r.idExpense
      const changedSomething = toCents(newAmount) !== toCents(r.amount) || moved || header.workDate !== r.workDate
      if (changedSomething) {
        changes.history.push({
          ...base,
          idExpense,
          newAmount,
          newIdDealer: header.idDealer,
          newWorkDate: header.workDate,
          reason: (reasons[0]?.code ?? PIECEWORK_REASON.calc) as string,
          detail: encodeReasons(reasons),
        })
        changes.authorByExpense.set(idExpense, author)
        if (moved) changes.authorByExpense.set(r.idExpense, author)
      }
      await this.rows.updateRow(r.id as number, {
        amount: newAmount,
        idDealer: header.idDealer,
        workDate: header.workDate,
        idExpense,
        ...srcPatch(inputs),
        checkedAt,
      })
    }

    // Un servicio del vendor que apareció en una WO de la expense (con piecework): se suma como fila nueva.
    for (const idInvoice of updatedInvoices) {
      const services = byInvoice.get(idInvoice) ?? []
      const header = services[0]
      const have = new Set(rows.filter((r) => r.idInvoice === idInvoice).map((r) => r.idInvoiceService))
      for (const svc of services) {
        if (svc.idService === null || have.has(svc.idService)) continue
        const inputs = inputsOf(header, svc)
        const amount = currentAmount(String(svc.piecework), inputs)
        if (toCents(amount) === 0) continue
        const by = who(idInvoice)
        await this.insertRows(
          idDetailer,
          groupState,
          vendor,
          [{ idInvoice, idService: svc.idService, idDealer: header.idDealer, workDate: header.workDate, amount, inputs }],
          { reason: PIECEWORK_REASON.serviceAdded, source: 'nightly', idUsuario: null, woChangedBy: by?.idAutor ?? null, woChangedAt: by?.fecha ?? null },
          changes,
          by?.idAutor ?? expenseRows[0].idCreatedBy,
          checkedAt,
        )
      }
    }

    await this.history.insertMany(changes.history)
    await this.recompose(idDetailer, groupState, changes.authorByExpense, 'Piecework recalculated from its work orders')
    return changes.history.length
  }

  /**
   * Edit (D18): saca las filas de `removed` (la WO queda libre) y agrega `added`, con el histórico `source = edit`.
   * Las WO que quedan no se recalculan acá: las sigue la noche, con su pay period.
   */
  @Transactional()
  async applyEdit(idDetailer: number, unit: PieceworkUnitKey, removed: ExpensePieceworkWo[], added: NewPieceworkRow[], idUsuario: number): Promise<void> {
    const expenseRows = await this.expenseRowsOf(idDetailer, unit)
    if (!expenseRows.length) return
    const groupState = { unit, expenseRows }
    const changes: UnitChanges = { history: [], authorByExpense: new Map() }
    const checkedAt = nowUtc()
    for (const r of removed) {
      changes.history.push({
        idPieceworkWo: r.id as number,
        idExpense: r.idExpense,
        idInvoice: r.idInvoice,
        oldAmount: fromCents(toCents(r.amount)),
        newAmount: '0.00',
        oldIdDealer: r.idDealer,
        newIdDealer: r.idDealer,
        oldWorkDate: r.workDate,
        newWorkDate: r.workDate,
        reason: PIECEWORK_REASON.editRemoved,
        detail: PIECEWORK_REASON.editRemoved,
        source: 'edit',
        idUsuario,
        woChangedBy: null,
        woChangedAt: null,
      })
      changes.authorByExpense.set(r.idExpense, idUsuario)
      await this.rows.release(r.id as number)
    }
    const vendor = await this.rows.vendorOfUnit(idDetailer, unit)
    if (added.length && vendor !== null) {
      await this.insertRows(
        idDetailer,
        groupState,
        vendor,
        added,
        { reason: PIECEWORK_REASON.editAdded, source: 'edit', idUsuario, woChangedBy: null, woChangedAt: null },
        changes,
        idUsuario,
        checkedAt,
      )
    }
    await this.history.insertMany(changes.history)
    await this.recompose(idDetailer, groupState, changes.authorByExpense, 'Piecework work orders changed')
  }

  private async insertRows(
    idDetailer: number,
    groupState: { unit: PieceworkUnitKey; expenseRows: Expense[] },
    vendor: number,
    added: readonly NewPieceworkRow[],
    meta: Pick<HistoryRow, 'reason' | 'source' | 'idUsuario' | 'woChangedBy' | 'woChangedAt'>,
    changes: UnitChanges,
    author: number,
    checkedAt: string,
  ): Promise<void> {
    for (const a of added) {
      const idExpense = await this.dealerRow(idDetailer, groupState, a.idDealer)
      const [saved] = await this.rows.insertMany([
        {
          idExpense,
          idInvoice: a.idInvoice,
          idInvoiceService: a.idService,
          idEmployee: vendor,
          idDealer: a.idDealer,
          amount: a.amount,
          workDate: a.workDate,
          checkedAt,
          ...(srcPatch(a.inputs) as object),
        } as Omit<ExpensePieceworkWo, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
      ])
      changes.history.push({
        ...meta,
        idPieceworkWo: saved.id as number,
        idExpense,
        idInvoice: a.idInvoice,
        oldAmount: null,
        newAmount: a.amount,
        oldIdDealer: null,
        newIdDealer: a.idDealer,
        oldWorkDate: null,
        newWorkDate: a.workDate,
        detail: meta.reason,
      })
      changes.authorByExpense.set(idExpense, author)
    }
  }

  /** Las filas activas de EXP_EXPENSE de la unidad. */
  private async expenseRowsOf(idDetailer: number, unit: PieceworkUnitKey): Promise<Expense[]> {
    if ('idExpGroup' in unit) return this.expenses.findByGroup(unit.idExpGroup, idDetailer, 1)
    const one = await this.expenses.findOwned(unit.idExpense, idDetailer)
    return one && Number(one.estado) === 1 ? [one] : []
  }

  /**
   * La fila de EXP_EXPENSE del dealer dentro de la expense. Si no está, se suma (By amount, como el alta). Una expense
   * suelta pasa a ser un grupo: su fila queda como la del adjunto, y la nueva copia los datos comunes y la aprobación.
   */
  private async dealerRow(idDetailer: number, groupState: { unit: PieceworkUnitKey; expenseRows: Expense[] }, idDealer: number): Promise<number> {
    const found = groupState.expenseRows.find((e) => e.idDealer === idDealer)
    if (found) return found.id
    const first = groupState.expenseRows[0]
    let groupId = first.idExpGroup ?? null
    if (groupId === null) {
      const group = await this.groups.create({ idDetailer, idCreatedBy: first.idCreatedBy, splitType: GROUP_SPLIT_AMOUNT, idAttachmentExpense: first.id })
      groupId = group.id as number
      await this.expenses.updateById(first.id, { idExpGroup: groupId })
      first.idExpGroup = groupId
      groupState.unit = { idExpGroup: groupId }
    }
    const created = await this.expenses.create({
      idDetailer,
      idDealer,
      idAuthor: first.idAuthor,
      idCreatedBy: first.idCreatedBy,
      idCompany: first.idCompany,
      idCategory: first.idCategory,
      idExpRepetitive: null,
      idExpGroup: groupId,
      amount: '0.00',
      ticketDate: first.ticketDate,
      hasOtherPhoto: 0,
      notes: first.notes,
      description: first.description ?? null,
      receiptNumber: first.receiptNumber ?? null,
      isApproved: first.isApproved ?? null,
      idAuthorApproved: first.idAuthorApproved ?? null,
      approvedDate: first.approvedDate ?? null,
      estado: 1,
    })
    await this.logs.logExpense(created.id, first.idCreatedBy, 'Dealer added: a work order of this Piecework expense changed dealer')
    groupState.expenseRows.push(created)
    return created.id
  }

  /** Los montos de cada fila de EXP_EXPENSE = la suma de sus filas sin liberar (las que cambiaron y las que no). */
  private async recompose(
    idDetailer: number,
    groupState: { unit: PieceworkUnitKey; expenseRows: Expense[] },
    authorByExpense: Map<number, number>,
    label: string,
  ): Promise<void> {
    const active = await this.rows.activeRowsOfUnit(idDetailer, groupState.unit)
    const sums = amountsByExpenseRow(active)
    for (const e of groupState.expenseRows) {
      const next = sums.get(e.id) ?? '0.00'
      if (toCents(next) === toCents(e.amount)) continue
      await this.expenses.updateById(e.id, { amount: next })
      await this.logs.logExpense(
        e.id,
        authorByExpense.get(e.id) ?? e.idCreatedBy,
        `${label}. Amount: ${fromCents(toCents(e.amount))} -> ${next}`,
      )
      e.amount = next
    }
  }
}
