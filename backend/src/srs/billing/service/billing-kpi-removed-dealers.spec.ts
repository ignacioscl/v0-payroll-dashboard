import { BadRequestException } from '@nestjs/common'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { BillingKpiService } from './billing-kpi.service'

/** GET /srs/kpis/billing/removed-dealers-available (plans/plan-totales-income-centavos §4.3). */
describe('BillingKpiService.getRemovedDealersAvailable', () => {
  const ctx = (idRol: number): SrsContext =>
    ({ idUsuario: 5, idUsuarioRolrel: null, idRol, idDealerProvider: 188, isUserDealer: false }) as SrsContext

  function build(available = true) {
    const repository = { hasRemovedDealersWithMoney: jest.fn().mockResolvedValue(available) }
    const service = new BillingKpiService(repository as any, {} as any)
    return { service, repository }
  }

  it('user with assigned dealers or external user: false without querying (P29)', async () => {
    const { service, repository } = build(true)
    await expect(
      service.getRemovedDealersAvailable(ctx(3), { fechaDesde: '2024-01-01', fechaHasta: '2024-12-31' }),
    ).resolves.toEqual({ available: false })
    expect(repository.hasRemovedDealersWithMoney).not.toHaveBeenCalled()
  })

  it('Admin Company: the company is always the session one, with the range and the filter', async () => {
    const { service, repository } = build(true)
    const query = { fechaDesde: '2024-04-23', fechaHasta: '2024-04-23', filterDateDone: true, idDealerProvider: 999 }
    await expect(service.getRemovedDealersAvailable(ctx(2), query as any)).resolves.toEqual({ available: true })
    expect(repository.hasRemovedDealersWithMoney).toHaveBeenCalledWith(
      188,
      { fechaDesde: '2024-04-23', fechaHasta: '2024-04-23' },
      true,
    )
  })

  it('no dates = whole history', async () => {
    const { service, repository } = build(false)
    await expect(service.getRemovedDealersAvailable(ctx(1), {})).resolves.toEqual({ available: false })
    expect(repository.hasRemovedDealersWithMoney).toHaveBeenCalledWith(188, null, false)
  })

  it('only one date, or from after to: 400', async () => {
    const { service } = build()
    await expect(service.getRemovedDealersAvailable(ctx(2), { fechaDesde: '2024-01-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(
      service.getRemovedDealersAvailable(ctx(2), { fechaDesde: '2024-12-31', fechaHasta: '2024-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
