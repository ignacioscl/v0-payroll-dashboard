import { Inject, Injectable } from '@nestjs/common'

import { PayrollKpiRepository } from '../repository/payroll-kpi.repository'
import { PayrollSnapshotKpiRepository, SnapshotTypeAgg } from '../repository/payroll-snapshot-kpi.repository'
import { PayrollKpiDto, PayrollSpendDto, PayrollSpendTypeRowDto } from '../dto/payroll-kpi.dto'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_TTK_PAYROLL, SrsPermissionRepository } from '../../auth/srs-permission.repository'
import { SrsKpiQueryDto } from '../../shared/kpi/srs-kpi-query.dto'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PAYMENT_TYPE_IDS, PIECEWORK_TYPE_IDS, proratedDayId } from '../snapshot/payment-type-ids'
import { addDays, PAYROLL_TIME_ZONE, todayInZone, weekEnd, weekStart } from '../snapshot/payroll-dates'
import { overtimeHoursInRange } from '../snapshot/overtime-hours'
import { payrollSnapshotFrom } from '../snapshot/payroll-snapshot.job'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Orden de las filas del desglose: el del export XLS de legacy (plan §2.3). */
function typeOrder(): string[] {
  const p = PAYMENT_TYPE_IDS
  const prorated = proratedDayId()
  return [
    `${p.HOURLY}|ponchada`,
    `${p.HOURLY}|overtime`,
    `${p.SHOP_H}|ponchada`,
    `${p.PIECEWORK}|ponchada`,
    `${p.PIECEWORK_BY_PERCENT}|ponchada`,
    `${p.FLAT_RATE}|ponchada`,
    `${p.SALARY}|prorrateo`,
    `${p.COMMISSION}|prorrateo`,
    `${p.DAILY_RATE}|ponchada`,
    `${p.HALF_DAY}|ponchada`,
    `${p.CLOSING}|ponchada`,
    `${p.SUNDAY}|ponchada`,
    ...(prorated !== null ? [`${prorated}|ponchada`] : []),
    `${p.EXTRA}|ponchada`,
    `${p.SHOP}|ponchada`,
    `${p.OVERTIME_MANUAL}|ponchada`,
    `${p.OTHER}|ponchada`,
  ]
}

/** Columna «Qty / Hours» del desglose (plan §2.3). */
function measureOf(id: number, concepto: SnapshotTypeAgg['concepto']): PayrollSpendTypeRowDto['measure'] {
  const p = PAYMENT_TYPE_IDS
  if (concepto === 'overtime') return 'hours'
  if (concepto === 'prorrateo') return 'employees'
  if (PIECEWORK_TYPE_IDS.includes(id)) return 'none'
  if (id === p.HOURLY || id === p.SHOP_H || id === p.EXTRA || id === proratedDayId()) return 'hours'
  return 'count'
}

/** Suma por (tipo, concepto) y arma las filas del desglose, sin las que no tienen monto. */
function toTypeRows(aggs: SnapshotTypeAgg[]): PayrollSpendTypeRowDto[] {
  const byKey = new Map<string, PayrollSpendTypeRowDto>()
  for (const a of aggs) {
    const key = `${a.idPaymentType}|${a.concepto}`
    const row = byKey.get(key) ?? {
      id: a.idPaymentType,
      name: a.name,
      concepto: a.concepto,
      amount: 0,
      qty: 0,
      hours: 0,
      measure: measureOf(a.idPaymentType, a.concepto),
      kind:
        a.concepto === 'overtime'
          ? 'overtime_auto'
          : a.idPaymentType === PAYMENT_TYPE_IDS.OVERTIME_MANUAL
            ? 'overtime_manual'
            : a.idPaymentType === PAYMENT_TYPE_IDS.HOURLY
              ? 'hourly'
              : 'other',
    }
    row.amount += a.monto
    row.qty += a.concepto === 'prorrateo' ? a.empleados : a.filas
    row.hours += a.horas
    byKey.set(key, row)
  }
  const order = typeOrder()
  const rank = (k: string) => {
    const i = order.indexOf(k)
    return i === -1 ? order.length : i
  }
  return [...byKey.entries()]
    .map(([key, r]) => ({ key, row: { ...r, amount: round2(r.amount), hours: round2(r.hours) } }))
    .filter(({ row }) => row.amount !== 0)
    .sort((a, b) => rank(a.key) - rank(b.key) || a.row.name.localeCompare(b.row.name))
    .map(({ row }) => row)
}

@Injectable()
export class PayrollKpiService {
  constructor(
    @Inject(PayrollKpiRepository) private readonly repository: PayrollKpiRepository,
    @Inject(PayrollSnapshotKpiRepository) private readonly snapshot: PayrollSnapshotKpiRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
  ) {}

  /** Montos de payroll: solo con «Time Tracking > Payroll» (o Admin General / Company). Decisión C. */
  private assertPayrollAccess(ctx: SrsContext): Promise<void> {
    return this.permissions.assertRolAccion(ctx, ROL_ACCION_TTK_PAYROLL)
  }

  async getPayrollKpis(ctx: SrsContext, query: SrsKpiQueryDto): Promise<PayrollKpiDto> {
    await this.assertPayrollAccess(ctx)
    return this.repository.getPayrollKpis(buildSrsKpiFilter(ctx, query))
  }

  async getPayrollByType(ctx: SrsContext, query: SrsKpiQueryDto) {
    await this.assertPayrollAccess(ctx)
    return this.repository.getPayrollByType(buildSrsKpiFilter(ctx, query))
  }

  /**
   * Tab Payroll Spend: Total Payroll (= TOTAL PAYROLL del TTK Payroll Report de legacy, con Prorated
   * Day y los salarios sin dealer), Overtime Payment, Overtime Hours, Piecework y el desglose por
   * tipo de pago, para las fechas y los dealers del header. Lee solo `PAYROLL_SNAPSHOT_DAY`.
   */
  async getSpend(ctx: SrsContext, query: SrsKpiQueryDto): Promise<PayrollSpendDto> {
    await this.assertPayrollAccess(ctx)
    const filter = buildSrsKpiFilter(ctx, query)
    const dataFrom = payrollSnapshotFrom()
    const showWithoutDealer = filter.skipDealerRestriction
    const base = {
      periodo: { desde: filter.fechaDesde, hasta: filter.fechaHasta },
      dataFrom,
      dealerRestricted: !showWithoutDealer,
    }

    // payment_method NULL: no hay período de pago (decisión E); no se consulta nada más.
    const cfg = await this.snapshot.getProviderConfig(filter.idDealerProvider)
    if (cfg.paymentMethod === null) {
      return {
        ...base,
        paymentMethod: null,
        totalPayroll: 0,
        payrollTaxes: 0,
        overtime: { amount: 0, hours: 0, employeesOver40: 0 },
        piecework: 0,
        byType: [],
        employees: 0,
        withoutDealer: null,
        allDealers: false,
        calculatedAt: null,
      }
    }

    const recentFrom = addDays(todayInZone(PAYROLL_TIME_ZONE), -62)
    const [aggs, withoutAggs, activeDealers, calculatedAt, hourRows] = await Promise.all([
      this.snapshot.totalsByType(filter),
      showWithoutDealer ? this.snapshot.withoutDealerByType(filter) : Promise.resolve([] as SnapshotTypeAgg[]),
      this.snapshot.activeDealerIds(filter.idDealerProvider),
      this.snapshot.lastCalculatedAt(filter.idDealerProvider, recentFrom),
      this.snapshot.hoursByDay(
        filter,
        weekStart(filter.fechaDesde, cfg.firstDayWeek),
        weekEnd(filter.fechaHasta, cfg.firstDayWeek),
      ),
    ])

    const selected = new Set(filter.dealerIds)
    const allDealers = activeDealers.length > 0 && activeDealers.every((id) => selected.has(id))
    // Con todos los dealers, lo sin dealer entra en el total y en el desglose; con un filtro, va aparte.
    const included = showWithoutDealer && allDealers ? [...aggs, ...withoutAggs] : aggs

    // Montos redondeados a centavos por dealer y tipo, como el TTK Payroll Report de legacy, y
    // después sumados: el total da al centavo lo mismo que la pantalla legacy.
    const perDealer = await this.snapshot.amountsByDealerType(filter, showWithoutDealer && allDealers)
    const amountByKey = new Map<string, number>()
    const taxByDealer = new Map<string, number>()
    for (const r of perDealer) {
      const key = `${r.idPaymentType}|${r.concepto}`
      amountByKey.set(key, (amountByKey.get(key) ?? 0) + round2(r.monto))
      const d = String(r.idDealer)
      taxByDealer.set(d, (taxByDealer.get(d) ?? 0) + r.tax)
    }
    const byType = toTypeRows(included).map((row) => ({
      ...row,
      amount: round2(amountByKey.get(`${row.id}|${row.concepto}`) ?? row.amount),
    }))
    const payrollTaxes = round2([...taxByDealer.values()].reduce((a, t) => a + round2(t), 0))
    const totalPayroll = round2(byType.reduce((a, r) => a + r.amount, 0) + payrollTaxes)

    const sumWhere = (pred: (r: { idPaymentType: number; concepto: string }) => boolean) =>
      round2(perDealer.filter((r) => r.idDealer !== null && pred(r)).reduce((acc, r) => acc + round2(r.monto), 0))
    const overtimeAmount = sumWhere(
      (r) => r.concepto === 'overtime' || r.idPaymentType === PAYMENT_TYPE_IDS.OVERTIME_MANUAL,
    )
    const piecework = sumWhere((r) => PIECEWORK_TYPE_IDS.includes(r.idPaymentType))
    const ot = overtimeHoursInRange(hourRows, filter.fechaDesde, filter.fechaHasta, cfg.firstDayWeek)

    const withoutDealer = showWithoutDealer
      ? {
          amount: round2(withoutAggs.reduce((a, r) => a + r.monto + r.tax, 0)),
          employees: withoutAggs.reduce((a, r) => Math.max(a, r.empleados), 0),
          byType: toTypeRows(withoutAggs),
        }
      : null

    return {
      ...base,
      paymentMethod: cfg.paymentMethod,
      totalPayroll,
      payrollTaxes,
      overtime: { amount: overtimeAmount, hours: ot.hours, employeesOver40: ot.employeesOver40 },
      piecework,
      byType,
      employees: await this.snapshot.countEmployees(filter, showWithoutDealer && allDealers),
      withoutDealer,
      allDealers,
      calculatedAt,
    }
  }
}
