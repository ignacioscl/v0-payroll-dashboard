import { ForbiddenException } from '@nestjs/common'

import { SrsContext } from '../auth/srs-auth-context.service'
import { SrsPermissionRepository } from '../auth/srs-permission.repository'
import { PunchAccessPolicyService } from './punch-access-policy'

function ctx(partial: Partial<SrsContext> = {}): SrsContext {
  return {
    idUsuario: 10,
    idUsuarioRolrel: null,
    idRol: 5,
    idDealerProvider: 79,
    isUserDealer: false,
    ...partial,
  }
}

function mockPerms(allowed: number[]) {
  return {
    userHasRolAccion: jest.fn(async (_c: SrsContext, id: number) => allowed.includes(id)),
  } as unknown as SrsPermissionRepository
}

function mockSrs(queryImpl: (sql: string, params?: unknown[]) => Promise<unknown[]>) {
  return { query: jest.fn(queryImpl) }
}

const BASE_QUERY = {
  fechaDesde: '2026-01-01',
  fechaHasta: '2026-01-31',
  idDealer: '639',
}

describe('PunchAccessPolicyService', () => {
  it('sin permiso 65 da 403', async () => {
    const svc = new PunchAccessPolicyService(mockPerms([]), mockSrs(async () => []) as never)
    await expect(svc.assertAndResolve(ctx(), BASE_QUERY)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('only_deletes sin 68 da 403', async () => {
    const svc = new PunchAccessPolicyService(mockPerms([65]), mockSrs(async () => []) as never)
    await expect(
      svc.assertAndResolve(ctx(), { ...BASE_QUERY, issueType: 'only_deletes' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('usuario externo con issueType distinto de all da 403', async () => {
    const srs = mockSrs(async () => [{ n: 1 }])
    const svc = new PunchAccessPolicyService(mockPerms([65]), srs as never)
    await expect(
      svc.assertAndResolve(ctx({ isUserDealer: true }), { ...BASE_QUERY, issueType: 'only_error' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('idPaymentType o without_salary sin ver payment type da 403', async () => {
    const srs = mockSrs(async () => [{ n: 1 }])
    const svc = new PunchAccessPolicyService(mockPerms([65]), srs as never)
    await expect(
      svc.assertAndResolve(ctx(), { ...BASE_QUERY, idPaymentType: 101 }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      svc.assertAndResolve(ctx(), { ...BASE_QUERY, issueType: 'without_salary' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('dealer fuera de RESTRICTION da 403 y no busca el nombre', async () => {
    const srs = mockSrs(async () => [{ n: 0 }])
    const svc = new PunchAccessPolicyService(mockPerms([65]), srs as never)
    await expect(svc.assertAndResolve(ctx(), BASE_QUERY)).rejects.toBeInstanceOf(ForbiddenException)
    const sql = String((srs.query as jest.Mock).mock.calls[0][0])
    expect(sql).not.toMatch(/GET_DEALER_NAME_BY_PROVIDER/i)
    expect(sql).not.toMatch(/razon_social/i)
  })

  it('empleado fuera de scope da 403 y no selecciona nombre primero', async () => {
    const srs = mockSrs(async (sql: string) => {
      if (sql.includes('COUNT(DISTINCT')) return [{ n: 1 }]
      return []
    })
    const svc = new PunchAccessPolicyService(mockPerms([65]), srs as never)
    await expect(
      svc.assertAndResolve(ctx(), { ...BASE_QUERY, idEmployee: 999 }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    const empSql = String((srs.query as jest.Mock).mock.calls[1][0])
    expect(empSql).not.toMatch(/SELECT\s+.*nombre/i)
  })

  it('con 65 y dealers ok, 130 ve nombre de pago pero no importes', async () => {
    const srs = mockSrs(async () => [{ n: 1 }])
    const svc = new PunchAccessPolicyService(mockPerms([65, 130]), srs as never)
    const policy = await svc.assertAndResolve(ctx(), BASE_QUERY)
    expect(policy.canViewPaymentTypeName).toBe(true)
    expect(policy.canViewPaymentAmounts).toBe(false)
  })

  it('105 o 136 habilitan importes (el diálogo de pago no puede arrancar en 0)', async () => {
    const srs = mockSrs(async () => [{ n: 1 }])
    const svc105 = new PunchAccessPolicyService(mockPerms([65, 105]), srs as never)
    const svc136 = new PunchAccessPolicyService(mockPerms([65, 136]), srs as never)
    expect((await svc105.assertAndResolve(ctx(), BASE_QUERY)).canViewPaymentAmounts).toBe(true)
    expect((await svc136.assertAndResolve(ctx(), BASE_QUERY)).canViewPaymentAmounts).toBe(true)
  })
})
