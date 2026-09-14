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

/**
 * `scopeCount` responde el chequeo de scope (RESTRICTION_DEALER_V2 / existencia) y
 * `relCount` el de DEALER_REL. Cada uno cuenta cuántos de los dealers pedidos pasan.
 */
function mockSrs(scopeCount: number, relCount: number) {
  return {
    // Tipado con los dos argumentos de `query`, para leer los binds en `mock.calls`.
    query: jest.fn<Promise<{ n: number }[]>, [sql: string, params?: unknown[]]>(async (sql) =>
      sql.includes('DEALER_REL') ? [{ n: relCount }] : [{ n: scopeCount }],
    ),
  }
}

function relCall(srs: ReturnType<typeof mockSrs>) {
  return srs.query.mock.calls.find(([sql]) => sql.includes('DEALER_REL'))
}

describe('PunchAccessPolicyService.assertDashboardRanking', () => {
  it('un usuario externo da 403 sin tocar la base', async () => {
    const srs = mockSrs(1, 1)
    const svc = new PunchAccessPolicyService(mockPerms([65, 68]), srs as never)
    await expect(svc.assertDashboardRanking(ctx({ isUserDealer: true }), '85')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(srs.query).not.toHaveBeenCalled()
  })

  it('NO exige Time Tracking > Hours Admin. (65): paridad con el resumen PHP', async () => {
    const svc = new PunchAccessPolicyService(mockPerms([]), mockSrs(1, 1) as never)
    await expect(svc.assertDashboardRanking(ctx(), '85')).resolves.toEqual({
      dealerIds: [85],
      skipDealerRestriction: false,
      includeDeletedFixes: false,
    })
  })

  it('dealer en scope pero sin fila en DEALER_REL del provider: 403 con el mismo mensaje', async () => {
    const srs = mockSrs(1, 0)
    const svc = new PunchAccessPolicyService(mockPerms([]), srs as never)
    await expect(svc.assertDashboardRanking(ctx(), '768')).rejects.toThrow(
      'One or more dealers are outside your scope.',
    )

    const call = relCall(srs)
    expect(call).toBeDefined()
    const [sql, params] = call!
    expect(sql).toMatch(/dr\.id_dealer_provider = \?/)
    expect(sql).toMatch(/dr\.id_dealer_customer IN \(\?\)/)
    // El provider sale del contexto (tenant), nunca del pedido.
    expect(params).toEqual([79, 768])
  })

  it('Admin (rol 1/2): el scope sólo mira que el dealer exista y DEALER_REL lo frena igual', async () => {
    const srs = mockSrs(1, 0)
    const svc = new PunchAccessPolicyService(mockPerms([]), srs as never)
    await expect(svc.assertDashboardRanking(ctx({ idRol: 1 }), '768')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    const scopeSql = String(srs.query.mock.calls[0][0])
    expect(scopeSql).not.toMatch(/RESTRICTION_DEALER_V2/)
    expect(relCall(srs)).toBeDefined()
  })

  it('con varios dealers, alcanza con uno que no esté relacionado para dar 403', async () => {
    const srs = mockSrs(2, 1)
    const svc = new PunchAccessPolicyService(mockPerms([]), srs as never)
    await expect(svc.assertDashboardRanking(ctx(), '85,768')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(relCall(srs)![1]).toEqual([79, 85, 768])
  })

  it('ids repetidos cuentan una vez: el COUNT(DISTINCT) no puede dar de más ni de menos', async () => {
    const srs = mockSrs(1, 1)
    const svc = new PunchAccessPolicyService(mockPerms([]), srs as never)
    const access = await svc.assertDashboardRanking(ctx(), '85,85')
    expect(access.dealerIds).toEqual([85])
    expect(relCall(srs)![1]).toEqual([79, 85])
  })

  it('includeDeletedFixes sigue a Time Tracking > Delete (web) (68)', async () => {
    const con68 = new PunchAccessPolicyService(mockPerms([68]), mockSrs(1, 1) as never)
    expect((await con68.assertDashboardRanking(ctx(), '85')).includeDeletedFixes).toBe(true)

    const sin68 = new PunchAccessPolicyService(mockPerms([65]), mockSrs(1, 1) as never)
    expect((await sin68.assertDashboardRanking(ctx(), '85')).includeDeletedFixes).toBe(false)
  })

  it('assertDealersRelatedToProvider con la lista vacía da 403 sin consultar', async () => {
    const srs = mockSrs(1, 1)
    const svc = new PunchAccessPolicyService(mockPerms([]), srs as never)
    await expect(svc.assertDealersRelatedToProvider(ctx(), [])).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(srs.query).not.toHaveBeenCalled()
  })
})
