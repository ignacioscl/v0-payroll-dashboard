import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'

import { UsuarioSrsService } from 'src/features/srs-usuario/service/usuario-srs.service'
import { ContratistaService } from 'src/features/srs-contratista/service/contratista.service'
import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_CLOSING, SrsPermissionRepository } from '../../auth/srs-permission.repository'
import { BillingKpiRepository } from '../../billing/repository/billing-kpi.repository'
import type { ClosingLineDto } from '../../billing/dto/billing-kpi.dto'
import { PayrollSnapshotKpiRepository } from '../../payroll/repository/payroll-snapshot-kpi.repository'
import { PayrollSourceRepository } from '../../payroll/snapshot/payroll-source.repository'
import { periodsEndingInMonth } from '../../payroll/snapshot/payroll-month-periods'
import type { PayrollPeriod } from '../../payroll/snapshot/payroll-snapshot.types'
import { ExpenseReportRepository } from '../../expenses/repository/expense-report.repository'
import type { ExpenseListFilter } from '../../expenses/expense-list-filter'
import { SrsKpiFilter, buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { removedDealersProvider } from '../../shared/kpi/srs-kpi-dealer-filter'
import { countRequestedDealersInScope } from '../../shared/kpi/srs-kpi-dealer-scope'
import {
  buildNyStampedExportFilename,
  contentDispositionAttachment,
  formatNyStamp,
  XLSX_MIME,
} from '../../punch/punch-export-format'
import { loadDealerNames, loadUserName } from '../../punch/punch-export-lookups'
import {
  ClosingPeriodDto,
  ClosingRowDto,
  ClosingScope,
  CLOSING_SCOPES,
  MonthlyClosingDealerDto,
  MonthlyClosingDto,
  MonthlyClosingQueryDto,
} from '../dto/monthly-closing.dto'
import { MONTHLY_CLOSING_MONTH_ERROR, isValidClosingMonth, monthBounds } from '../dto/monthly-closing-month'
import {
  TINT_EXPENSE_CATEGORY,
  TINT_ROLE_FRAGMENT,
  canonicalPayrollCents,
  fromCents,
  isTintIncomeLine,
  largestRemainderCents,
  payrollKey,
  profitPct,
  toCents,
} from '../monthly-closing-math'
import { buildClosingWorkbook, closingExportPrefix } from '../monthly-closing-export'

/** Todo lo que una consulta del reporte necesita, armado una vez desde la sesión y el pedido. */
export interface ClosingContext {
  scope: ClosingScope
  month: string
  firstDay: string
  lastDay: string
  filter: SrsKpiFilter
  expenseFilter: ExpenseListFilter
  periods: PayrollPeriod[]
  /** Window Tint Closing: los tinteros; null = todos los empleados. */
  employeeIds: number[] | null
  showWithoutDealer: boolean
}

export interface PayrollEmployeeLine {
  idDealer: number | null
  periodoDesde: string
  periodoHasta: string
  employee: string
  position: string
  cents: number
}

export interface IncomeLine extends ClosingLineDto {
  cents: number
}

export interface ExpenseLine {
  date: string
  dealerId: number
  dealer: string
  vendor: string
  category: string
  cents: number
  notes: string
}

/**
 * Monthly Closing y Window Tint Closing (plans/plan-monthly-closing/PLAN.md T4, plans/plan-reporte-tint/PLAN.md
 * T1–T5). No lee ninguna tabla por su cuenta: Income lo da billing, Payroll el snapshot, Expenses el dueño de
 * EXP_EXPENSE y los tinteros srs-usuario. La empresa sale siempre de la sesión.
 */
@Injectable()
export class MonthlyClosingService {
  constructor(
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
    @Inject(BillingKpiRepository) private readonly billing: BillingKpiRepository,
    @Inject(PayrollSnapshotKpiRepository) private readonly payroll: PayrollSnapshotKpiRepository,
    @Inject(PayrollSourceRepository) private readonly payrollSource: PayrollSourceRepository,
    @Inject(ExpenseReportRepository) private readonly expenses: ExpenseReportRepository,
    @Inject(UsuarioSrsService) private readonly usuarios: UsuarioSrsService,
    @Inject(ContratistaService) private readonly contratistas: ContratistaService,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  async getSummary(ctx: SrsContext, query: MonthlyClosingQueryDto): Promise<MonthlyClosingDto> {
    const cc = await this.prepare(ctx, query, query.idDealer)
    const summary = await this.summary(cc)
    return { scope: cc.scope, month: cc.month, ...summary }
  }

  async getDealer(ctx: SrsContext, idDealer: number, query: MonthlyClosingQueryDto): Promise<MonthlyClosingDealerDto> {
    if (!Number.isInteger(idDealer) || idDealer < 0) throw new BadRequestException('Invalid dealer')
    // 0 = Without dealer: solo Payroll, solo quien ve toda la empresa.
    const cc = await this.prepare(ctx, query, idDealer === 0 ? query.idDealer : String(idDealer))
    if (idDealer === 0) {
      if (!cc.showWithoutDealer) throw new ForbiddenException('Forbidden')
      const payroll = await this.payrollLines(cc, 'none')
      return { dealerId: 0, dealer: 'Without dealer', income: [], payroll: payroll.map(toPayrollDto), expenses: [] }
    }
    await this.assertDealerInScope(cc.filter, idDealer)
    const [income, payroll, expenses, names] = await Promise.all([
      this.incomeLines(cc),
      this.payrollLines(cc, idDealer),
      this.expenseLines(cc),
      this.payroll.dealerNames(ctx.idDealerProvider, [idDealer]),
    ])
    return {
      dealerId: idDealer,
      dealer: names.get(idDealer) ?? '',
      income: income.map((l) => ({
        nro: l.nro,
        dateFrom: l.dateFrom,
        dateTo: l.dateTo,
        department: l.department,
        service: l.service,
        qty: l.qty,
        total: fromCents(l.cents),
      })),
      payroll: payroll.map(toPayrollDto),
      expenses: expenses.map((e) => ({
        date: e.date,
        vendor: e.vendor,
        category: e.category,
        amount: fromCents(e.cents),
        notes: e.notes,
      })),
    }
  }

  async export(ctx: SrsContext, query: MonthlyClosingQueryDto, res: Response): Promise<void> {
    const cc = await this.prepare(ctx, query, query.idDealer)
    // Report Info nombra los dealers pedidos con GET_DEALER_NAME_BY_PROVIDER, que no mira el alcance: como el export
    // de Production vs Goal (production-kpi.service.ts), todos tienen que ser de la empresa y visibles para el usuario.
    await this.assertDealersInScope(cc.filter)
    const generatedAt = new Date()
    const [summary, income, payroll, withoutDealerPayroll, expenses, generatedBy, activeDealers] = await Promise.all([
      this.summary(cc),
      this.incomeLines(cc),
      this.payrollLines(cc, 'all'),
      cc.showWithoutDealer ? this.payrollLines(cc, 'none') : Promise.resolve([] as PayrollEmployeeLine[]),
      this.expenseLines(cc),
      loadUserName(this.srs, ctx.idUsuario),
      this.payroll.activeDealerIds(ctx.idDealerProvider),
    ])
    const requested = [...new Set(cc.filter.dealerIds)]
    const allDealers = activeDealers.length > 0 && activeDealers.every((id) => requested.includes(id))
    const dealerFilterNames = allDealers ? [] : await loadDealerNames(this.srs, ctx.idDealerProvider, requested)
    const dealerIds = [
      ...new Set([...income.map((l) => l.dealerId), ...payroll.map((p) => p.idDealer ?? 0), ...expenses.map((e) => e.dealerId)]),
    ]
    const names = await this.payroll.dealerNames(ctx.idDealerProvider, dealerIds.filter((id) => id > 0))
    const removed = new Set(summary.rows.filter((r) => r.removed).map((r) => r.dealerId))

    const workbook = buildClosingWorkbook({
      scope: cc.scope,
      month: cc.month,
      generatedAt,
      generatedBy,
      dealersLabel: allDealers ? 'All' : dealerFilterNames.join(', '),
      includeRemovedDealers: removedDealersProvider(cc.filter) != null,
      removedWithRows: summary.rows.filter((r) => r.removed).map((r) => r.dealer),
      periods: summary.periods,
      summary,
      income,
      payroll: [...payroll, ...withoutDealerPayroll],
      expenses,
      dealerName: (id) => (id === 0 ? 'Without dealer' : names.get(id) ?? ''),
      isRemoved: (id) => removed.has(id),
    })

    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader(
      'Content-Disposition',
      contentDispositionAttachment(buildNyStampedExportFilename(closingExportPrefix(cc.scope, cc.month), generatedAt)),
    )
    await workbook.xlsx.write(res)
  }

  /** Permiso, mes, alcance y filtros: todo lo que valida el pedido. */
  private async prepare(ctx: SrsContext, query: MonthlyClosingQueryDto, idDealer: string): Promise<ClosingContext> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_CLOSING)
    if (!isValidClosingMonth(query.month)) {
      throw new BadRequestException({ message: MONTHLY_CLOSING_MONTH_ERROR, field: 'month' })
    }
    const scope: ClosingScope = query.scope ?? 'all'
    if (!CLOSING_SCOPES.includes(scope)) throw new BadRequestException({ message: 'Invalid scope', field: 'scope' })
    // Window Tint Closing pide además el check de la empresa (plans/plan-checks-expenses-tint); scope=all no.
    if (scope === 'tint') await this.contratistas.assertCompanyModule(ctx, 'windowTintClosing')
    const { firstDay, lastDay } = monthBounds(query.month)
    // includeZero fijo: el Closing trae las líneas de $0 (T1 de MC, v5); WO por fecha de alta.
    const filter = buildSrsKpiFilter(ctx, {
      fechaDesde: firstDay,
      fechaHasta: lastDay,
      idDealer,
      includeZero: true,
      filterDateDone: false,
      includeRemovedDealers: query.includeRemovedDealers,
    })
    const [periods, employeeIds] = await Promise.all([
      periodsEndingInMonth(this.payrollSource, ctx.idDealerProvider, firstDay, lastDay),
      scope === 'tint'
        ? this.usuarios.idsWithRoleNameLike(ctx.idDealerProvider, TINT_ROLE_FRAGMENT)
        : Promise.resolve(null),
    ])
    return {
      scope,
      month: query.month,
      firstDay,
      lastDay,
      filter,
      expenseFilter: {
        idDealerProvider: filter.idDealerProvider,
        idUsuario: filter.idUsuario,
        skipDealerRestriction: filter.skipDealerRestriction,
        dealerIds: filter.dealerIds,
        includeRemovedDealers: filter.includeRemovedDealers,
        from: firstDay,
        to: lastDay,
        deleted: false,
        ...(scope === 'tint' ? { categoryNameIs: TINT_EXPENSE_CATEGORY } : {}),
      },
      periods,
      employeeIds,
      showWithoutDealer: filter.skipDealerRestriction,
    }
  }

  /** Un dealer se abre solo si es de la empresa y, para un usuario restringido, RESTRICTION_DEALER_V2 lo deja ver. */
  private async assertDealerInScope(filter: SrsKpiFilter, idDealer: number): Promise<void> {
    await this.assertDealersInScope({ ...filter, dealerIds: [idDealer] })
  }

  private async assertDealersInScope(filter: SrsKpiFilter): Promise<void> {
    if ((await countRequestedDealersInScope(this.srs, filter)) !== new Set(filter.dealerIds).size) {
      throw new ForbiddenException('One or more dealers are outside your scope.')
    }
  }

  private async summary(cc: ClosingContext): Promise<Omit<MonthlyClosingDto, 'scope' | 'month'>> {
    const periodDesdes = cc.periods.map((p) => p.desde)
    const tint = cc.scope === 'tint'
    const [incomeByDealer, tintLines, payrollRows, expenseRows, coverage] = await Promise.all([
      tint ? Promise.resolve(null) : this.billing.incomeByDealerForRange(cc.filter),
      tint ? this.incomeLines(cc) : Promise.resolve(null),
      this.payroll.amountsByDealerPeriodType(cc.filter, periodDesdes, cc.showWithoutDealer, cc.employeeIds),
      this.expenses.amountsByDealer(cc.expenseFilter),
      this.payroll.periodCoverage(cc.filter.idDealerProvider, periodDesdes),
    ])

    type Acc = { income: number; payroll: number; expenses: number; accident: number; vehicles: number }
    const acc = new Map<number, Acc>()
    const at = (id: number): Acc => {
      let a = acc.get(id)
      if (!a) {
        a = { income: 0, payroll: 0, expenses: 0, accident: 0, vehicles: 0 }
        acc.set(id, a)
      }
      return a
    }
    if (incomeByDealer) for (const [id, r] of incomeByDealer) at(id).income += toCents(r.income)
    if (tintLines) {
      for (const l of tintLines) {
        const a = at(l.dealerId)
        a.income += l.cents
        a.vehicles += l.qty
      }
    }
    let withoutDealerCents = 0
    for (const [key, cents] of canonicalPayrollCents(payrollRows)) {
      const [dealer] = key.split('|')
      if (dealer === 'none') withoutDealerCents += cents
      else at(Number(dealer)).payroll += cents
    }
    for (const r of expenseRows) {
      const a = at(r.dealerId)
      a.expenses += toCents(Number(r.total))
      a.accident += toCents(Number(r.accidentTotal))
    }

    const ids = [...acc.keys()].filter((id) => {
      const a = acc.get(id) as Acc
      return a.income !== 0 || a.payroll !== 0 || a.expenses !== 0 || a.vehicles !== 0
    })
    const removedOf = removedDealersProvider(cc.filter)
    const [names, removed] = await Promise.all([
      this.payroll.dealerNames(cc.filter.idDealerProvider, ids),
      removedOf != null ? this.billing.removedDealersOfProvider(removedOf) : Promise.resolve([]),
    ])
    const removedIds = new Set(removed.map((d) => d.dealerId))

    const toRow = (dealerId: number, dealer: string, a: Acc): ClosingRowDto => {
      const profit = a.income - a.payroll - a.expenses
      return {
        dealerId,
        dealer,
        removed: removedIds.has(dealerId),
        vehicles: tint ? a.vehicles : null,
        income: fromCents(a.income),
        payroll: fromCents(a.payroll),
        expenses: fromCents(a.expenses),
        profit: fromCents(profit),
        pct: profitPct(profit, a.income),
        accident: tint ? null : fromCents(a.accident),
      }
    }
    const rows = ids
      .map((id) => toRow(id, names.get(id) ?? '', acc.get(id) as Acc))
      .sort((a, b) => a.dealer.localeCompare(b.dealer))
    const totalAcc = [...ids].reduce<Acc>(
      (t, id) => {
        const a = acc.get(id) as Acc
        return {
          income: t.income + a.income,
          payroll: t.payroll + a.payroll,
          expenses: t.expenses + a.expenses,
          accident: t.accident + a.accident,
          vehicles: t.vehicles + a.vehicles,
        }
      },
      { income: 0, payroll: 0, expenses: 0, accident: 0, vehicles: 0 },
    )
    const withoutDealer =
      cc.showWithoutDealer && withoutDealerCents !== 0
        ? {
            ...toRow(0, 'Without dealer', { income: 0, payroll: withoutDealerCents, expenses: 0, accident: 0, vehicles: 0 }),
            vehicles: null,
            accident: null,
          }
        : null

    return {
      rows,
      total: { ...toRow(-1, 'Total', totalAcc), removed: false },
      withoutDealer,
      periods: cc.periods.map((p) => periodStatus(p, coverage.get(p.desde))),
    }
  }

  /** Líneas del Closing del filtro; en el alcance tint, solo las de tint (isTintIncomeLine). */
  async incomeLines(cc: ClosingContext): Promise<IncomeLine[]> {
    const lines = await this.billing.incomeLinesForRange(cc.filter)
    return lines
      .filter((l) => cc.scope !== 'tint' || isTintIncomeLine(l))
      .map((l) => ({ ...l, cents: toCents(l.amount) }))
      .sort(
        (a, b) =>
          a.dealerId - b.dealerId ||
          a.dateFrom.localeCompare(b.dateFrom) ||
          a.nro.localeCompare(b.nro) ||
          a.service.localeCompare(b.service),
      )
  }

  /**
   * Filas por empleado y período: cada dealer y período suma su importe canónico (mayor resto, T2 de MC).
   * `dealer`: un id, 'all' (los del filtro) o 'none' (sin dealer).
   */
  async payrollLines(cc: ClosingContext, dealer: number | 'all' | 'none'): Promise<PayrollEmployeeLine[]> {
    const periodDesdes = cc.periods.map((p) => p.desde)
    const filter = typeof dealer === 'number' ? { ...cc.filter, dealerIds: [dealer] } : cc.filter
    const [employees, typeRows] = await Promise.all([
      this.payroll.amountsByDealerEmployeeForPeriods(filter, periodDesdes, dealer, cc.employeeIds),
      this.payroll.amountsByDealerPeriodType(filter, periodDesdes, dealer === 'none', cc.employeeIds),
    ])
    const canonical = canonicalPayrollCents(
      dealer === 'none' ? typeRows.filter((r) => r.idDealer === null) : typeRows.filter((r) => r.idDealer !== null),
    )
    const groups = new Map<string, typeof employees>()
    for (const e of employees) {
      const key = payrollKey(e.idDealer, e.periodoDesde)
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    const out: PayrollEmployeeLine[] = []
    for (const [key, rows] of groups) {
      for (const r of largestRemainderCents(rows, canonical.get(key) ?? 0)) {
        if (r.cents === 0 && r.amount === 0) continue
        out.push({
          idDealer: r.idDealer,
          periodoDesde: r.periodoDesde,
          periodoHasta: r.periodoHasta,
          employee: r.employee,
          position: r.position,
          cents: r.cents,
        })
      }
    }
    return out.sort(
      (a, b) =>
        (a.idDealer ?? 0) - (b.idDealer ?? 0) ||
        a.periodoDesde.localeCompare(b.periodoDesde) ||
        a.employee.localeCompare(b.employee),
    )
  }

  async expenseLines(cc: ClosingContext): Promise<ExpenseLine[]> {
    const rows = await this.expenses.linesForRange(cc.expenseFilter)
    return rows
      .map((r) => ({
        date: r.ticketDate,
        dealerId: r.dealerId,
        dealer: r.dealer,
        vendor: r.vendor,
        category: r.category,
        cents: toCents(Number(r.amount)),
        notes: r.notes,
      }))
      .sort((a, b) => a.dealer.localeCompare(b.dealer) || a.date.localeCompare(b.date))
  }
}

function toPayrollDto(p: PayrollEmployeeLine) {
  return {
    periodDesde: p.periodoDesde,
    periodHasta: p.periodoHasta,
    employee: p.employee,
    position: p.position,
    amount: fromCents(p.cents),
  }
}

/** §5.4.5 de MC: calculado entero, hasta un día antes del fin, o sin calcular (no se suma). */
export function periodStatus(p: PayrollPeriod, coveredThrough: string | undefined): ClosingPeriodDto {
  if (!coveredThrough) return { desde: p.desde, hasta: p.hasta, status: 'notCalculated', calculatedThrough: null }
  if (coveredThrough < p.hasta) {
    return { desde: p.desde, hasta: p.hasta, status: 'partial', calculatedThrough: coveredThrough }
  }
  return { desde: p.desde, hasta: p.hasta, status: 'complete', calculatedThrough: null }
}
