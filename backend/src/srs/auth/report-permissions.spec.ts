/**
 * Un permiso por reporte de Pro (tema 10 de plans/plan-reunion-juan-18-11, migration 033): cada endpoint de cada reporte
 * pide su permiso antes de consultar la base, y los tres de Auto Wax (Monthly Closing, Window Tint Closing y Open
 * Invoices) piden además el módulo «Closing reports» de la empresa, también al admin (D17). Sin base: todo es un doble.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common'

import { SrsContext } from './srs-auth-context.service'
import {
  ROL_ACCION_REPORT_BUSINESS_KPIS,
  ROL_ACCION_REPORT_INCOME_BY_DEALER,
  ROL_ACCION_REPORT_MONTHLY_CLOSING,
  ROL_ACCION_REPORT_OPEN_INVOICES,
  ROL_ACCION_REPORT_PRODUCTION_VS_GOAL,
  ROL_ACCION_REPORT_WINDOW_TINT_CLOSING,
} from './srs-permission.repository'
import { BillingKpiService } from '../billing/service/billing-kpi.service'
import { CollectionsKpiService } from '../collections/service/collections-kpi.service'
import { PayrollKpiService } from '../payroll/service/payroll-kpi.service'
import { ProductionKpiService } from '../production/service/production-kpi.service'
import { PunchKpiService } from '../punch/service/punch-kpi.service'
import { MonthlyClosingService } from '../monthly-closing/service/monthly-closing.service'

const ctx: SrsContext = { idUsuario: 4972, idUsuarioRolrel: null, idRol: 5, idDealerProvider: 79, isUserDealer: false, isActive: true }
const query = { fechaDesde: '2026-10-01', fechaHasta: '2026-10-31', idDealer: '76' } as never

/** Un doble donde cada método es un jest.fn: si el servicio consulta algo sin permiso, se ve en `calls`. */
function spyAll(): { proxy: any; calls: string[] } {
  const calls: string[] = []
  const proxy = new Proxy(
    {},
    {
      get: (_t, name) => (name === 'then' ? undefined : jest.fn(async () => calls.push(String(name)))),
    },
  )
  return { proxy, calls }
}

function denied() {
  return { assertRolAccion: jest.fn(async () => Promise.reject(new ForbiddenException('Forbidden'))) }
}

describe('ids de la migration 033', () => {
  it('148 a 153, en el orden del plan', () => {
    expect([
      ROL_ACCION_REPORT_BUSINESS_KPIS,
      ROL_ACCION_REPORT_PRODUCTION_VS_GOAL,
      ROL_ACCION_REPORT_INCOME_BY_DEALER,
      ROL_ACCION_REPORT_MONTHLY_CLOSING,
      ROL_ACCION_REPORT_WINDOW_TINT_CLOSING,
      ROL_ACCION_REPORT_OPEN_INVOICES,
    ]).toEqual([148, 149, 150, 151, 152, 153])
  })
})

describe('cada endpoint pide su permiso antes de consultar', () => {
  const cases: [string, number, (permissions: any, repo: any) => Promise<unknown>][] = [
    // Business KPIs: todas sus tabs (Billing, Open AR, Punch Quality, Payroll Spend) y lo que esas tabs piden prestado.
    ['production (tarjetas)', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new ProductionKpiService(r, p, r).getProductionKpis(ctx, query)],
    ['production/by-week', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new ProductionKpiService(r, p, r).getProductionByWeek(ctx, query)],
    ['production/pipeline', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new ProductionKpiService(r, p, r).getOpenPipeline(ctx, query)],
    ['billing', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new BillingKpiService(r, p).getBillingKpis(ctx, query)],
    ['billing/by-week', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new BillingKpiService(r, p).getBillingByWeek(ctx, query)],
    ['billing/unbilled-aging', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new BillingKpiService(r, p).getUnbilledAging(ctx, query)],
    ['billing/unbilled-by-dealer', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new BillingKpiService(r, p).getUnbilledByDealer(ctx, query)],
    ['billing/period-collection', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new BillingKpiService(r, p).getPeriodCollectionKpis(ctx, query)],
    ['collections', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new CollectionsKpiService(r, p).getCollectionsKpis(ctx, query)],
    ['collections/by-month', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new CollectionsKpiService(r, p).getCollectionsByMonth(ctx, { ...(query as object), historyMonths: 4 } as never)],
    ['punch', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new PunchKpiService(r, r, p).getPunchKpis(ctx, query)],
    ['payroll', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new PayrollKpiService(r, r, p).getPayrollKpis(ctx, query)],
    ['payroll/spend', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new PayrollKpiService(r, r, p).getSpend(ctx, query)],
    ['payroll/by-type', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new PayrollKpiService(r, r, p).getPayrollByType(ctx, query)],
    ['payroll/piecework-diff', ROL_ACCION_REPORT_BUSINESS_KPIS, (p, r) => new PayrollKpiService(r, r, p).getPieceworkDiff(ctx, query)],
    // Production vs Goal by Dealer: la grilla y su Excel.
    ['production/by-dealer', ROL_ACCION_REPORT_PRODUCTION_VS_GOAL, (p, r) => new ProductionKpiService(r, p, r).getDealerProduction(ctx, query)],
    ['production/by-dealer/export', ROL_ACCION_REPORT_PRODUCTION_VS_GOAL, (p, r) => new ProductionKpiService(r, p, r).exportDealerProduction(ctx, query, r)],
    // Income by Dealer: la pantalla, por servicio y los autos.
    ['billing/income-by-dealer', ROL_ACCION_REPORT_INCOME_BY_DEALER, (p, r) => new BillingKpiService(r, p).getIncomeByDealer(ctx, query)],
    ['billing/income-by-dealer/services', ROL_ACCION_REPORT_INCOME_BY_DEALER, (p, r) => new BillingKpiService(r, p).getIncomeServicesByDealer(ctx, query)],
    ['billing/income-by-dealer/services/vehicles', ROL_ACCION_REPORT_INCOME_BY_DEALER, (p, r) => new BillingKpiService(r, p).getIncomeServiceVehicles(ctx, { ...(query as object), service: 'Wash' } as never)],
  ]

  it.each(cases)('%s → %i', async (_name, id, call) => {
    const permissions = denied()
    const { proxy, calls } = spyAll()
    await expect(call(permissions, proxy)).rejects.toBeInstanceOf(ForbiddenException)
    expect(permissions.assertRolAccion).toHaveBeenCalledWith(ctx, id)
    expect(calls).toEqual([])
  })
})

describe('Monthly Closing y Window Tint Closing: su permiso y el módulo «Closing reports» (D17)', () => {
  function build(opts: { permission: boolean; module: boolean }) {
    const permissions = {
      assertRolAccion: jest.fn(async () => (opts.permission ? undefined : Promise.reject(new ForbiddenException('Forbidden')))),
    }
    const contratistas = {
      assertCompanyModule: jest.fn(async () => (opts.module ? undefined : Promise.reject(new ForbiddenException('Forbidden')))),
    }
    const { proxy, calls } = spyAll()
    const service = new MonthlyClosingService(permissions as any, proxy, proxy, proxy, proxy, proxy, contratistas as any, proxy)
    return { service, permissions, contratistas, calls }
  }

  // Mes inválido: si pasa el permiso y el módulo, el pedido termina en 400 sin consultar nada.
  const badMonth = { month: '2026-13' } as never

  it.each([
    ['all', ROL_ACCION_REPORT_MONTHLY_CLOSING],
    ['tint', ROL_ACCION_REPORT_WINDOW_TINT_CLOSING],
  ])('scope %s pide %i', async (scope, id) => {
    const m = build({ permission: false, module: true })
    await expect(m.service.getSummary(ctx, { month: '2026-10', scope } as never)).rejects.toBeInstanceOf(ForbiddenException)
    expect(m.permissions.assertRolAccion).toHaveBeenCalledWith(ctx, id)
    expect(m.calls).toEqual([])
  })

  it('sin scope es Monthly Closing', async () => {
    const m = build({ permission: false, module: true })
    await expect(m.service.getSummary(ctx, { month: '2026-10' } as never)).rejects.toBeInstanceOf(ForbiddenException)
    expect(m.permissions.assertRolAccion).toHaveBeenCalledWith(ctx, ROL_ACCION_REPORT_MONTHLY_CLOSING)
  })

  it.each(['all', 'tint'])('scope %s sin el módulo de la empresa: 403 aunque tenga el permiso (o sea admin)', async (scope) => {
    const m = build({ permission: true, module: false })
    await expect(m.service.getSummary(ctx, { month: '2026-10', scope } as never)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(m.service.getDealer(ctx, 76, { month: '2026-10', scope } as never)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(m.service.export(ctx, { month: '2026-10', scope } as never, {} as never)).rejects.toBeInstanceOf(ForbiddenException)
    expect(m.contratistas.assertCompanyModule).toHaveBeenCalledWith(ctx, 'closingReports')
    expect(m.calls).toEqual([])
  })

  it('con permiso y módulo sigue a validar el mes', async () => {
    const m = build({ permission: true, module: true })
    await expect(m.service.getSummary(ctx, badMonth)).rejects.toBeInstanceOf(BadRequestException)
    expect(m.calls).toEqual([])
  })
})
