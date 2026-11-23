import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'

import { fieldError } from 'src/commons/errors/field.error'
import { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import { ROL_ACCION_EXPENSES_PIECEWORK, SrsPermissionRepository } from 'src/srs/auth/srs-permission.repository'
import { ExpenseReportRepository } from 'src/srs/expenses/repository/expense-report.repository'
import { expenseScopeOf } from 'src/srs/expenses/expense-dealer-scope'
import { monthBounds } from 'src/srs/monthly-closing/dto/monthly-closing-month'
import { periodsEndingInMonth } from 'src/srs/payroll/snapshot/payroll-month-periods'
import { PayrollSourceRepository, WorkOrderServicePiecework } from 'src/srs/payroll/snapshot/payroll-source.repository'
import type { PayrollPeriod } from 'src/srs/payroll/snapshot/payroll-snapshot.types'
import { UsuarioSrsService } from 'src/features/srs-usuario/service/usuario-srs.service'
import { ExpensePieceworkWo } from '../entity/expense-piecework-wo.entity'
import { ExpensePieceworkWoRepository, PieceworkUnitKey } from '../repository/expense-piecework-wo.repository'
import { NewPieceworkRow, inputsOf } from './expense-piecework-recalc.service'
import {
  MSG_CHOOSE_VENDOR,
  MSG_CHOOSE_WORK_ORDERS,
  MSG_NOT_PIECEWORK,
  MSG_NO_PAY_PERIODS,
  MSG_PIECEWORK_RESTORE_TAKEN,
  MSG_WORK_ORDER_NOT_AVAILABLE,
  amountsByDealer,
  availableWorkOrders,
  monthOf,
  periodOf,
} from '../rules/expense-piecework'
import { fromCents, toCents } from '../rules/expense-rules'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Con la foto: el combo «Vendor» es el combo de empleados común (foto o iniciales). */
export interface PieceworkVendorDto {
  id: number
  name: string
  thumbnailUuid: string | null
  logoImg: string | null
}

export interface PieceworkWorkOrderDto {
  idInvoice: number
  nro: string
  vin: string
  dealer: { id: number; name: string }
  date: string
  piecework: string
  services: string[]
}

/** La tabla del modal: los pay periods del mes (el texto de arriba) y las WO disponibles del vendor. */
export interface PieceworkWorkOrdersDto {
  periods: { desde: string; hasta: string }[]
  workOrders: PieceworkWorkOrderDto[]
}

/** Lo que el alta necesita: el vendor, las filas por servicio de las WO elegidas y el monto por dealer. */
export interface ResolvedPiecework {
  vendor: PieceworkVendorDto
  rows: WorkOrderServicePiecework[]
  byDealer: { idDealer: number; amount: string }[]
}

/**
 * Expense Piecework (plans/plan-reunion-juan-18-11, temas 3 y 4, D4–D8): los vendors, sus WO de los pay periods que
 * terminan en el mes de la expense que no están en otra expense Piecework activa, y lo que el alta recalcula en el
 * servidor. El piecework sale de la misma función que usa el snapshot (PayrollSourceRepository); los pay periods, de
 * `periodsEndingInMonth`, la misma regla del Monthly Closing.
 */
@Injectable()
export class ExpensePieceworkService {
  constructor(
    @Inject(PayrollSourceRepository) private readonly source: PayrollSourceRepository,
    @Inject(ExpensePieceworkWoRepository) private readonly pieceworkRows: ExpensePieceworkWoRepository,
    @Inject(ExpenseReportRepository) private readonly report: ExpenseReportRepository,
    @Inject(UsuarioSrsService) private readonly usuarios: UsuarioSrsService,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  async vendors(ctx: SrsContext): Promise<{ data: PieceworkVendorDto[] }> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_PIECEWORK)
    return { data: await this.usuarios.activeVendors(ctx.idDealerProvider) }
  }

  async workOrders(ctx: SrsContext, vendorId: number, month: string): Promise<PieceworkWorkOrdersDto> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_PIECEWORK)
    if (!MONTH_RE.test(month ?? '')) throw new BadRequestException({ message: 'Invalid month', field: 'month' })
    await this.requireVendor(ctx, vendorId)
    const { periods, rows } = await this.candidates(ctx, vendorId, month, null)
    const wos = availableWorkOrders(rows, periods, new Set())
    const names = await this.report.dealerNames(ctx.idDealerProvider, [...new Set(wos.map((w) => w.idDealer))])
    return {
      periods: periods.map((p) => ({ desde: p.desde, hasta: p.hasta })),
      workOrders: wos.map((w) => ({
        idInvoice: w.idInvoice,
        nro: w.nro,
        vin: w.vin,
        dealer: { id: w.idDealer, name: names.get(w.idDealer) ?? '' },
        date: w.workDate,
        piecework: w.piecework,
        services: w.services,
      })),
    }
  }

  /**
   * Alta: el permiso, el vendor, que cada WO sea de un pay period que termina en el mes de `ticketDate`, del alcance
   * del usuario y no esté en otra expense activa. Los montos se recalculan acá (no se confía en el front).
   */
  async resolveForCreate(
    ctx: SrsContext,
    vendorId: number | undefined,
    ticketDate: string,
    invoiceIds: readonly number[] | undefined,
  ): Promise<ResolvedPiecework> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_PIECEWORK)
    const vendor = await this.requireVendor(ctx, vendorId)
    const ids = [...new Set((invoiceIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    if (!ids.length) throw fieldError('invoiceIds', MSG_CHOOSE_WORK_ORDERS)
    const { periods, rows } = await this.candidates(ctx, vendor.id, monthOf(ticketDate), ids)
    if (!periods.length) throw fieldError('ticketDate', MSG_NO_PAY_PERIODS)
    const found = new Set(rows.map((r) => r.idInvoice))
    if (ids.some((id) => !found.has(id))) throw fieldError('invoiceIds', MSG_WORK_ORDER_NOT_AVAILABLE)
    return { vendor, rows, byDealer: amountsByDealer(rows) }
  }

  /** Las filas de la tabla nueva, una por servicio, cada una con la fila de EXP_EXPENSE de su dealer. */
  async saveRows(resolved: ResolvedPiecework, expenseIdByDealer: ReadonlyMap<number, number>): Promise<void> {
    await this.pieceworkRows.insertMany(
      resolved.rows.map((r) => ({
        idExpense: expenseIdByDealer.get(r.idDealer) as number,
        idInvoice: r.idInvoice,
        idInvoiceService: r.idService,
        idEmployee: resolved.vendor.id,
        idDealer: r.idDealer,
        amount: fromCents(toCents(r.piecework)),
        workDate: r.workDate,
      })),
    )
  }

  /**
   * Edit de una expense Piecework (D18): qué filas salen (las WO que ya no vienen) y qué filas entran (las WO nuevas,
   * validadas igual que el alta: del vendor, de los pay periods que terminan en el mes de la expense, del alcance del
   * usuario y libres). Las WO que quedan no cambian.
   */
  async resolveForEdit(
    ctx: SrsContext,
    unit: PieceworkUnitKey,
    ticketDate: string,
    invoiceIds: readonly number[],
  ): Promise<{ removed: ExpensePieceworkWo[]; added: NewPieceworkRow[] }> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_PIECEWORK)
    const vendor = await this.pieceworkRows.vendorOfUnit(ctx.idDealerProvider, unit)
    if (vendor === null) throw new ConflictException(MSG_NOT_PIECEWORK)
    const active = await this.pieceworkRows.activeRowsOfUnit(ctx.idDealerProvider, unit)
    const desired = new Set(invoiceIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))
    const current = new Set(active.map((r) => r.idInvoice))
    const removed = active.filter((r) => !desired.has(r.idInvoice))
    const addIds = [...desired].filter((id) => !current.has(id))
    if (!addIds.length) return { removed, added: [] }
    const { periods, rows } = await this.candidates(ctx, vendor, monthOf(ticketDate), addIds)
    if (!periods.length) throw fieldError('invoiceIds', MSG_NO_PAY_PERIODS)
    const found = new Set(rows.map((r) => r.idInvoice))
    if (addIds.some((id) => !found.has(id))) throw fieldError('invoiceIds', MSG_WORK_ORDER_NOT_AVAILABLE)
    const state = await this.source.workOrderPieceworkState(ctx.idDealerProvider, vendor, addIds)
    const added = rows.map((r): NewPieceworkRow => {
      const services = state.filter((s) => s.idInvoice === r.idInvoice)
      return {
        idInvoice: r.idInvoice,
        idService: r.idService,
        idDealer: r.idDealer,
        workDate: r.workDate,
        amount: fromCents(toCents(r.piecework)),
        inputs: inputsOf(services[0], services.find((s) => s.idService === r.idService)),
      }
    })
    return { removed, added }
  }

  /**
   * Edit de una expense Piecework: sus WO (marcadas) y, si se puede editar, las libres del mismo vendor y mes, con el
   * piecework de cada una; arriba de la tabla, los pay periods. Las suyas muestran lo que la expense tiene hoy.
   */
  async workOrdersOfExpense(
    ctx: SrsContext,
    unit: PieceworkUnitKey,
    ticketDate: string,
    withAvailable: boolean,
  ): Promise<{ vendor: PieceworkVendorDto | null; periods: { desde: string; hasta: string }[]; workOrders: (PieceworkWorkOrderDto & { selected: boolean })[] }> {
    const idVendor = await this.pieceworkRows.vendorOfUnit(ctx.idDealerProvider, unit)
    if (idVendor === null) throw new ConflictException(MSG_NOT_PIECEWORK)
    const active = await this.pieceworkRows.activeRowsOfUnit(ctx.idDealerProvider, unit)
    const ids = [...new Set(active.map((r) => r.idInvoice))]
    const [state, names, vendorNames] = await Promise.all([
      this.source.workOrderPieceworkState(ctx.idDealerProvider, idVendor, ids),
      this.report.dealerNames(ctx.idDealerProvider, [...new Set(active.map((r) => r.idDealer))]),
      this.report.userNames(ctx.idDealerProvider, [idVendor]),
    ])
    const serviceName = new Map(state.filter((s) => s.idService !== null).map((s) => [`${s.idInvoice}:${s.idService}`, s.service]))
    const own = new Map<number, PieceworkWorkOrderDto & { selected: boolean; cents: number }>()
    for (const r of active) {
      const head = state.find((s) => s.idInvoice === r.idInvoice)
      let wo = own.get(r.idInvoice)
      if (!wo) {
        wo = {
          idInvoice: r.idInvoice,
          nro: head?.nro ?? String(r.idInvoice),
          vin: head?.vin ?? '',
          dealer: { id: r.idDealer, name: names.get(r.idDealer) ?? '' },
          date: r.workDate,
          piecework: '0.00',
          services: [],
          selected: true,
          cents: 0,
        }
        own.set(r.idInvoice, wo)
      }
      wo.cents += toCents(r.amount)
      const svc = serviceName.get(`${r.idInvoice}:${r.idInvoiceService}`)
      if (svc && !wo.services.includes(svc)) wo.services.push(svc)
    }
    const mine = [...own.values()].map(({ cents, ...wo }) => ({ ...wo, piecework: fromCents(cents) }))
    let periods: { desde: string; hasta: string }[] = []
    let free: (PieceworkWorkOrderDto & { selected: boolean })[] = []
    if (withAvailable) {
      const avail = await this.workOrders(ctx, idVendor, monthOf(ticketDate))
      periods = avail.periods
      free = avail.workOrders.filter((w) => !own.has(w.idInvoice)).map((w) => ({ ...w, selected: false }))
    } else {
      const { firstDay, lastDay } = monthBounds(monthOf(ticketDate))
      periods = (await periodsEndingInMonth(this.source, ctx.idDealerProvider, firstDay, lastDay)).map((p) => ({ desde: p.desde, hasta: p.hasta }))
    }
    const workOrders = [...mine, ...free].sort((a, b) => (a.date === b.date ? a.idInvoice - b.idInvoice : a.date < b.date ? -1 : 1))
    const vendor = (await this.usuarios.activeVendors(ctx.idDealerProvider)).find((v) => v.id === idVendor) ?? {
      id: idVendor,
      name: vendorNames.get(idVendor) ?? String(idVendor),
      thumbnailUuid: null,
      logoImg: null,
    }
    return { vendor, periods, workOrders }
  }

  /** Restore: ninguna WO de esas filas puede estar ya en otra expense Piecework activa (D4). */
  async assertRestorable(ctx: SrsContext, expenseIds: readonly number[]): Promise<void> {
    const rows = await this.pieceworkRows.rowsOfExpenses(ctx.idDealerProvider, expenseIds)
    const byEmployee = new Map<number, number[]>()
    for (const r of rows) byEmployee.set(r.idEmployee, [...(byEmployee.get(r.idEmployee) ?? []), r.idInvoice])
    for (const [idEmployee, invoices] of byEmployee) {
      const taken = await this.pieceworkRows.takenWorkOrders(ctx.idDealerProvider, idEmployee, [...new Set(invoices)], expenseIds)
      if (taken.length) throw new ConflictException(MSG_PIECEWORK_RESTORE_TAKEN)
    }
  }

  private async requireVendor(ctx: SrsContext, vendorId: number | undefined): Promise<PieceworkVendorDto> {
    const id = Number(vendorId)
    const vendor = Number.isInteger(id) && id > 0 ? (await this.usuarios.activeVendors(ctx.idDealerProvider)).find((v) => v.id === id) : undefined
    if (!vendor) throw fieldError('pieceworkVendorId', MSG_CHOOSE_VENDOR)
    return vendor
  }

  /**
   * Las filas por servicio del vendor que pueden ir en una expense del mes: de un pay period que termina en el mes,
   * de un dealer del alcance del usuario y sin estar en otra expense Piecework activa.
   */
  private async candidates(
    ctx: SrsContext,
    vendorId: number,
    month: string,
    invoiceIds: readonly number[] | null,
  ): Promise<{ periods: PayrollPeriod[]; rows: WorkOrderServicePiecework[] }> {
    const { firstDay, lastDay } = monthBounds(month)
    const periods = await periodsEndingInMonth(this.source, ctx.idDealerProvider, firstDay, lastDay)
    if (!periods.length) return { periods, rows: [] }
    const desde = periods.reduce((m, p) => (p.desde < m ? p.desde : m), periods[0].desde)
    const hasta = periods.reduce((m, p) => (p.hasta > m ? p.hasta : m), periods[0].hasta)
    const all = (await this.source.workOrderServicePiecework(ctx.idDealerProvider, vendorId, desde, hasta, invoiceIds)).filter(
      (r) => periodOf(r.workDate, periods) !== null,
    )
    const [taken, inScope] = await Promise.all([
      this.pieceworkRows.takenWorkOrders(ctx.idDealerProvider, vendorId, [...new Set(all.map((r) => r.idInvoice))]),
      this.report.dealerIdsInRestriction(expenseScopeOf(ctx), [...new Set(all.map((r) => r.idDealer))]),
    ])
    const takenIds = new Set(taken.map((t) => t.idInvoice))
    const dealers = new Set(inScope)
    return { periods, rows: all.filter((r) => !takenIds.has(r.idInvoice) && dealers.has(r.idDealer)) }
  }
}
