import { BadRequestException, ForbiddenException } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_PRODUCTION_REPORT } from '../../auth/srs-permission.repository'
import { BillingKpiService } from './billing-kpi.service'

/** GET /srs/kpis/billing/income-by-dealer/services (plans/plan-income-by-dealer-por-servicio T2 y T6). */
describe('BillingKpiService.getIncomeServicesByDealer', () => {
  const ctx = { idUsuario: 5, idUsuarioRolrel: null, idRol: 3, idDealerProvider: 188, isUserDealer: false } as SrsContext
  const query = { fechaDesde: '2025-06-01', fechaHasta: '2026-03-31', idDealer: '196' }

  function build(allowed: boolean) {
    const repository = { getIncomeServicesByDealer: jest.fn().mockResolvedValue([]) }
    const permissions = {
      assertRolAccion: jest.fn(allowed ? () => Promise.resolve() : () => Promise.reject(new ForbiddenException())),
    }
    return { service: new BillingKpiService(repository as any, permissions as any), repository, permissions }
  }

  it('sin el permiso de Production Report no consulta la base', async () => {
    const { service, repository, permissions } = build(false)
    await expect(service.getIncomeServicesByDealer(ctx, query)).rejects.toBeInstanceOf(ForbiddenException)
    expect(permissions.assertRolAccion).toHaveBeenCalledWith(ctx, ROL_ACCION_PRODUCTION_REPORT)
    expect(repository.getIncomeServicesByDealer).not.toHaveBeenCalled()
  })

  it('la empresa sale de la sesión y withVehicles llega solo si es true', async () => {
    const { service, repository } = build(true)
    const oneYear = { ...query, fechaDesde: '2025-06-01', fechaHasta: '2025-12-31' }
    await expect(service.getIncomeServicesByDealer(ctx, { ...oneYear, idDealerProvider: 999 } as any)).resolves.toEqual({
      years: [],
    })
    const [filter, years, withVehicles] = repository.getIncomeServicesByDealer.mock.calls[0]
    expect(filter.idDealerProvider).toBe(188)
    expect(filter.dealerIds).toEqual([196])
    expect(years).toEqual([{ year: 2025, fechaDesde: '2025-06-01', fechaHasta: '2025-12-31', partial: true }])
    expect(withVehicles).toBe(false)

    await service.getIncomeServicesByDealer(ctx, { ...oneYear, withVehicles: true })
    expect(repository.getIncomeServicesByDealer.mock.calls[1][2]).toBe(true)
  })

  it('un dealer y un año por pedido (§8: el pool es chico): más de uno es 400 sin consultar la base', async () => {
    const { service, repository } = build(true)
    await expect(service.getIncomeServicesByDealer(ctx, query)).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.getIncomeServicesByDealer(ctx, { ...query, fechaDesde: '2026-01-01', idDealer: '196,199' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(repository.getIncomeServicesByDealer).not.toHaveBeenCalled()
  })
})
